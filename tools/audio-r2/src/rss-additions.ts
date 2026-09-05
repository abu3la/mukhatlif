import { readFile, stat, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checksumObject } from '../../wordpress-import/src/hash.ts';
import type { RssImportManifest } from '../../rss-import/src/core.ts';
import { episodeRow } from '../../rss-import/src/cli.ts';
import {
  APPROVED_CLOUDFLARE_ACCOUNT_ID,
  APPROVED_R2_BUCKET,
  APPROVED_SUPABASE_PROJECT_REF,
  buildAudioMigrationPlan,
  canonicalAudioSource,
  type DatabaseEpisode,
} from './core.ts';
import { inspectAudioHead, mapConcurrent } from './network.ts';

// Append-only development import. No updates, deletes, or general RSS reconciliation.
const [apply, originalFile, currentFile, expectedSha, envFile, output] = process.argv.slice(2);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
if (
  apply !== '--apply' ||
  !originalFile ||
  !currentFile ||
  !expectedSha ||
  !envFile ||
  !output ||
  !path.isAbsolute(output) ||
  output === root ||
  output.startsWith(`${root}/`)
)
  throw new Error(
    'Usage: rss-additions.ts --apply ORIGINAL CURRENT CURRENT_SHA256 PRIVATE_DEV_ENV PRIVATE_REPORT',
  );
if ((await stat(envFile)).mode & 0o077) throw new Error('Credentials must be private');
const env = parseEnv(await readFile(envFile, 'utf8'));
if (
  env.SUPABASE_URL !== `https://${APPROVED_SUPABASE_PROJECT_REF}.supabase.co` ||
  !env.SUPABASE_SERVICE_ROLE_KEY
)
  throw new Error('Only the pinned development project is allowed');
const original = JSON.parse(await readFile(originalFile, 'utf8')) as RssImportManifest;
const currentText = await readFile(currentFile, 'utf8');
if (
  !/^[a-f0-9]{64}$/.test(expectedSha) ||
  createHash('sha256').update(currentText).digest('hex') !== expectedSha
)
  throw new Error('Current manifest checksum mismatch');
const current = JSON.parse(currentText) as RssImportManifest;
for (const manifest of [original, current]) {
  const { manifestChecksumSha256, ...data } = manifest;
  if (manifest.sourceKind !== 'podcast_rss' || checksumObject(data) !== manifestChecksumSha256)
    throw new Error('Invalid RSS manifest');
}
const oldIds = new Set(original.shows.flatMap((s) => s.episodes.map((e) => e.guid)));
const shows = current.shows
  .map((show) => {
    if (
      !original.shows.some(
        (s) => s.id === show.id && s.rssUrl === show.rssUrl && s.slug === show.slug,
      )
    )
      throw new Error('Unreviewed RSS show');
    return { ...show, episodes: show.episodes.filter((e) => !oldIds.has(e.guid)) };
  })
  .filter((s) => s.episodes.length);
const newEpisodes = shows.flatMap((s) => s.episodes.map((e) => ({ show: s, episode: e })));
if (!newEpisodes.length || newEpisodes.length > 50) throw new Error('Expected 1-50 RSS additions');
for (const { episode } of newEpisodes) canonicalAudioSource(episode.enclosure.url!);
const headers = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
};
async function inventory(table: string) {
  const url = new URL(`/rest/v1/${table}`, env.SUPABASE_URL);
  url.searchParams.set('select', '*');
  url.searchParams.set('limit', '1000');
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Development ${table} HTTP ${response.status}`);
  const rows = (await response.json()) as Record<string, unknown>[];
  if (rows.length >= 1000) throw new Error('Inventory exceeds safety limit');
  return rows;
}
const [rows, storedShows] = await Promise.all([inventory('episodes'), inventory('shows')]);
for (const show of shows)
  if (
    !storedShows.some(
      (s) => s.id === show.id && s.slug === show.slug && s.rss_url === show.rssUrl && !s.premium,
    )
  )
    throw new Error('Development show identity conflict');
const incoming = newEpisodes.map(({ show, episode }) => episodeRow(show.id, episode));
// Never use upsert; concurrent imports fail without overwriting the existing row.
for (const row of incoming)
  if (rows.some((r) => r.id === row.id || r.rss_guid === row.rss_guid))
    throw new Error('An addition already exists; review instead of overwriting');
const sourceHeads = await mapConcurrent(newEpisodes, 3, ({ episode }) =>
  inspectAudioHead({
    sourceUrl: episode.enclosure.url!,
    expectedByteSize: episode.enclosure.lengthBytes!,
    expectedMimeType: episode.enclosure.mimeType!,
  }),
);
if (sourceHeads.some((h) => h.status !== 'verified'))
  throw new Error('New audio source failed HEAD verification');
await writeFile(
  `${output}.before.json`,
  JSON.stringify({ rows, incoming, sourceHeads, currentSha256: expectedSha }, null, 2),
  { mode: 0o600, flag: 'wx' },
);
await writeFile(output, JSON.stringify({ status: 'prepared', databaseWrites: false }), {
  mode: 0o600,
  flag: 'wx',
});
const response = await fetch(new URL('/rest/v1/episodes', env.SUPABASE_URL), {
  method: 'POST',
  headers: { ...headers, 'content-type': 'application/json', prefer: 'return=representation' },
  body: JSON.stringify(incoming),
  signal: AbortSignal.timeout(30_000),
});
if (!response.ok)
  throw new Error(`Append-only development import HTTP ${response.status}; before-image retained`);
const inserted = (await response.json()) as DatabaseEpisode[];
if (inserted.length !== incoming.length)
  throw new Error('Unexpected inserted count; inspect before retrying');
const deltaData = {
  schemaVersion: current.schemaVersion,
  sourceKind: current.sourceKind,
  snapshot: current.snapshot,
  shows,
};
const delta = { ...deltaData, manifestChecksumSha256: checksumObject(deltaData) };
const items = buildAudioMigrationPlan(delta, inserted);
if (items.some((i) => i.databaseState !== 'ready'))
  throw new Error('Inserted row provenance did not verify');
await writeFile(`${output}.rss.json`, JSON.stringify(delta, null, 2), { mode: 0o600, flag: 'wx' });
await writeFile(
  output,
  JSON.stringify(
    {
      schemaVersion: 1,
      mode: 'dry-run',
      generatedAt: new Date().toISOString(),
      guards: {
        cloudflareAccountId: APPROVED_CLOUDFLARE_ACCOUNT_ID,
        r2Bucket: APPROVED_R2_BUCKET,
        supabaseProjectRef: APPROVED_SUPABASE_PROJECT_REF,
      },
      appendImport: { insertedIds: inserted.map((r) => r.id), currentSha256: expectedSha },
      items,
    },
    null,
    2,
  ),
  { mode: 0o600 },
);
process.stdout.write(
  `${JSON.stringify({ inserted: inserted.length, audioBytes: items.reduce((n, i) => n + i.expectedByteSize, 0) })}\n`,
);
