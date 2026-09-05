import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { atomicJson } from './apply-cli.ts';
import { APPROVED_SUPABASE_PROJECT_REF } from './core.ts';
import { buildMatches, type RssShow, type Video } from './youtube-match.ts';
import { isOfficialChannel } from './youtube-channels.ts';

interface Row {
  id: string;
  show_id: string;
  rss_guid: string | null;
  title_ar: string;
  duration_sec: number;
  premium: boolean;
  youtube_video_id: string | null;
  audio_url?: string | null;
  source_url?: string | null;
}
type Match = ReturnType<typeof buildMatches>[number] & { expectedSourceUrl?: string };
export function videoLinkState(
  row: Row | undefined,
  match: Match,
): 'link' | 'unchanged' | 'conflict' {
  if (
    !row ||
    !match.videoId ||
    !/^[A-Za-z0-9_-]{11}$/.test(match.videoId) ||
    row.id !== match.episodeId ||
    row.show_id !== match.showId ||
    row.rss_guid !== match.rssGuid ||
    row.title_ar !== match.rssTitle ||
    row.duration_sec !== match.rssDurationSec ||
    row.premium ||
    (match.expectedSourceUrl !== undefined &&
      (row.audio_url !== match.expectedSourceUrl || row.source_url !== match.expectedSourceUrl))
  )
    return 'conflict';
  if (row.youtube_video_id === match.videoId) return 'unchanged';
  return row.youtube_video_id === null ? 'link' : 'conflict';
}

// Callers must verify their automatic or manually reviewed source evidence first.
export async function applyVerifiedMatches(
  items: Match[],
  envFile: string,
  output: string,
  confirmedHash: string,
) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  if (
    !/^[a-f0-9]{64}$/.test(confirmedHash) ||
    !envFile ||
    !output ||
    !path.isAbsolute(output) ||
    output === root ||
    output.startsWith(`${root}/`)
  )
    throw new Error(
      'Usage: youtube-apply.ts REPORT SHA256 RSS CHANNEL PRIVATE_DEV_ENV PRIVATE_RESULT',
    );
  if ((await stat(envFile)).mode & 0o077) throw new Error('Credentials must be private (600)');
  const env = parseEnv(await readFile(envFile, 'utf8'));
  if (
    env.SUPABASE_URL !== `https://${APPROVED_SUPABASE_PROJECT_REF}.supabase.co` ||
    !env.SUPABASE_SERVICE_ROLE_KEY
  )
    throw new Error('Only the pinned development Supabase project is allowed');
  if (new Set(items.map((i) => i.episodeId)).size !== items.length)
    throw new Error('Duplicate episode in reviewed matches');
  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
  const endpoint = new URL('/rest/v1/episodes', env.SUPABASE_URL);
  endpoint.searchParams.set('select', '*');
  endpoint.searchParams.set('limit', '1000');
  const inventory = await fetch(endpoint, { headers, signal: AbortSignal.timeout(30_000) });
  if (!inventory.ok) throw new Error(`Development inventory HTTP ${inventory.status}`);
  const rows = (await inventory.json()) as Row[];
  if (rows.length >= 1000 || rows.some((r) => !Object.hasOwn(r, 'youtube_video_id')))
    throw new Error('Missing migration 0023 or inventory exceeds safety limit');
  await writeFile(`${output}.before.json`, JSON.stringify(rows, null, 2), {
    mode: 0o600,
    flag: 'wx',
  });
  const result = {
    projectRef: APPROVED_SUPABASE_PROJECT_REF,
    reportSha256: confirmedHash,
    startedAt: new Date().toISOString(),
    complete: false,
    linked: [] as string[],
    unchanged: [] as string[],
    conflicts: [] as string[],
  };
  await writeFile(output, JSON.stringify(result), { mode: 0o600, flag: 'wx' });
  for (const match of items.filter((i) => i.videoId)) {
    const row = rows.find((r) => r.id === match.episodeId);
    const state = rows.some((r) => r.id !== match.episodeId && r.youtube_video_id === match.videoId)
      ? 'conflict'
      : videoLinkState(row, match);
    if (state !== 'link')
      result[state === 'unchanged' ? 'unchanged' : 'conflicts'].push(match.episodeId);
    else {
      const url = new URL('/rest/v1/episodes', env.SUPABASE_URL);
      for (const [name, value] of Object.entries({
        id: row!.id,
        show_id: row!.show_id,
        rss_guid: row!.rss_guid,
        title_ar: row!.title_ar,
        duration_sec: row!.duration_sec,
        premium: false,
      }))
        url.searchParams.set(name, `eq.${value}`);
      url.searchParams.set('youtube_video_id', 'is.null');
      if (match.expectedSourceUrl !== undefined) {
        url.searchParams.set('audio_url', `eq.${match.expectedSourceUrl}`);
        url.searchParams.set('source_url', `eq.${match.expectedSourceUrl}`);
      }
      url.searchParams.set('select', 'id,youtube_video_id');
      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          ...headers,
          'content-type': 'application/json',
          prefer: 'return=representation',
        },
        body: JSON.stringify({ youtube_video_id: match.videoId }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`Development YouTube link HTTP ${response.status}`);
      const changed = (await response.json()) as Row[];
      if (changed.length === 1 && changed[0]?.youtube_video_id === match.videoId) {
        result.linked.push(match.episodeId);
        row!.youtube_video_id = match.videoId;
      } else result.conflicts.push(match.episodeId);
    }
    await atomicJson(output, result);
  }
  result.complete = true;
  await atomicJson(output, result);
  process.stdout.write(
    JSON.stringify({
      linked: result.linked.length,
      unchanged: result.unchanged.length,
      preservedConflicts: result.conflicts.length,
      unmatched: items.filter((i) => !i.videoId).length,
    }) + '\n',
  );
}
async function main() {
  const [reportFile, confirmedHash, rssFile, channelFile, envFile, output] = process.argv.slice(2);
  if (!reportFile || !confirmedHash || !rssFile || !channelFile || !envFile || !output)
    throw new Error(
      'Usage: youtube-apply.ts REPORT SHA256 RSS CHANNEL PRIVATE_DEV_ENV PRIVATE_RESULT',
    );
  const [reportText, rssText, channelText] = await Promise.all(
    [reportFile, rssFile, channelFile].map((p) => readFile(p, 'utf8')),
  );
  const hash = (s: string) => createHash('sha256').update(s).digest('hex');
  if (!/^[a-f0-9]{64}$/.test(confirmedHash) || hash(reportText!) !== confirmedHash)
    throw new Error('Report checksum mismatch');
  const report = JSON.parse(reportText!);
  const channel = JSON.parse(channelText!) as { channel_id: string; entries: Video[] };
  if (
    !isOfficialChannel(channel.channel_id) ||
    report.channelId !== channel.channel_id ||
    report.schemaVersion !== 1 ||
    report.sourceHashes[0] !== hash(rssText!) ||
    report.sourceHashes[1] !== hash(channelText!)
  )
    throw new Error('Official channel or source checksum mismatch');
  const items = buildMatches(
    (JSON.parse(rssText!) as { shows: RssShow[] }).shows,
    channel.entries.filter((v) => /^[A-Za-z0-9_-]{11}$/.test(v.id) && typeof v.title === 'string'),
  );
  if (JSON.stringify(items) !== JSON.stringify(report.items))
    throw new Error('Match report no longer reproduces');
  await applyVerifiedMatches(items, envFile, output, confirmedHash);
}
if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url))
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Import failed'}\n`);
    process.exitCode = 1;
  });
