import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { buildRssImportManifest, type RssImportManifest } from '../../rss-import/src/core.ts';

// Read-only audit of the exact approved feeds. Never invokes the RSS database importer.
const [snapshotFile, outputDirectory] = process.argv.slice(2);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
if (
  !snapshotFile ||
  !outputDirectory ||
  !path.isAbsolute(outputDirectory) ||
  outputDirectory === root ||
  outputDirectory.startsWith(`${root}/`)
)
  throw new Error('Provide the saved RSS manifest and a NEW private directory outside Git');
const originalText = await readFile(snapshotFile, 'utf8');
const original = JSON.parse(originalText) as RssImportManifest;
if (original.sourceKind !== 'podcast_rss' || original.shows.length !== 16)
  throw new Error('Expected the reviewed 16-feed archive');
await mkdir(outputDirectory, { mode: 0o700 });
const rssDirectory = path.join(outputDirectory, 'rss');
await mkdir(rssDirectory, { mode: 0o700 });
for (const show of original.shows) {
  const url = new URL(show.rssUrl);
  if (
    url.origin !== 'https://anchor.fm' ||
    !/^\/s\/[a-f0-9]+\/podcast\/rss$/.test(url.pathname) ||
    url.search ||
    url.hash ||
    url.username ||
    url.password ||
    !/^[a-z0-9-]+$/.test(show.slug)
  )
    throw new Error('Feed is outside the reviewed Anchor archive');
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
  if (!response.ok || !response.body) throw new Error(`${show.slug}: RSS HTTP ${response.status}`);
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > 20 * 1024 * 1024) throw new Error(`${show.slug}: RSS exceeds 20 MiB`);
    chunks.push(value);
  }
  await writeFile(path.join(rssDirectory, `${show.slug}.xml`), Buffer.concat(chunks), {
    mode: 0o600,
    flag: 'wx',
  });
}
const current = await buildRssImportManifest({ rssDirectory, snapshot: new Date().toISOString() });
const items = current.shows.map((show) => {
  const old = original.shows.find((s) => s.id === show.id)!;
  const oldEpisodes = new Map(old.episodes.map((e) => [e.guid, e]));
  const newGuids = new Set(show.episodes.map((e) => e.guid));
  return {
    showId: show.id,
    previousCount: old.episodes.length,
    currentCount: show.episodes.length,
    added: show.episodes.filter((e) => !oldEpisodes.has(e.guid)),
    removed: old.episodes.filter((e) => !newGuids.has(e.guid)).map((e) => e.id),
    changedAudio: show.episodes
      .filter((e) => {
        const previous = oldEpisodes.get(e.guid);
        return previous && JSON.stringify(e.enclosure) !== JSON.stringify(previous.enclosure);
      })
      .map((e) => ({ id: e.id, before: oldEpisodes.get(e.guid)!.enclosure, after: e.enclosure })),
  };
});
const report = {
  checkedAt: new Date().toISOString(),
  originalSha256: createHash('sha256').update(originalText).digest('hex'),
  databaseWrites: false,
  counts: {
    currentEpisodes: current.shows.reduce((n, s) => n + s.episodes.length, 0),
    added: items.reduce((n, s) => n + s.added.length, 0),
    removed: items.reduce((n, s) => n + s.removed.length, 0),
    changedAudio: items.reduce((n, s) => n + s.changedAudio.length, 0),
  },
  items,
};
for (const [name, data] of [
  ['rss-manifest.json', current],
  ['audit.json', report],
] as const)
  await writeFile(path.join(outputDirectory, name), JSON.stringify(data, null, 2), {
    mode: 0o600,
    flag: 'wx',
  });
process.stdout.write(`${JSON.stringify(report.counts)}\n`);
