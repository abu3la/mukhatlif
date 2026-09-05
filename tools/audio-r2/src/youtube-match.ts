import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { channelAllowedForShow, isOfficialChannel } from './youtube-channels.ts';

export function normalizedTitle(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u064b-\u065f\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
export function titleStem(value: string): string {
  return normalizedTitle(value.split(/[|｜]/)[0]!.replace(/^\s*\d+\s*[-.:]\s*/, ''));
}
function similarity(a: string, b: string): number {
  const left = new Set(a.split(' '));
  const right = new Set(b.split(' '));
  return [...left].filter((x) => right.has(x)).length / Math.max(left.size, right.size);
}
export interface Video {
  id: string;
  title: string;
  duration?: number;
  description?: string;
  channel_id?: string;
  availability?: string;
  live_status?: string;
}
export interface Episode {
  id: string;
  guid: string;
  title: string;
  durationSec: number;
  publishedAt: string;
  episodeType: string;
  description?: string;
}
export interface RssShow {
  id: string;
  slug: string;
  title: string;
  episodes: Episode[];
}
// The same read-only channel objects are compared with hundreds of RSS rows.
// Cache normalization only; all identity/duration decisions still run per row.
const descriptionCache = new WeakMap<Video, { source: string; normalized: string }>();
function normalizedVideoDescription(video: Video): string {
  const source = video.description ?? '';
  const cached = descriptionCache.get(video);
  if (cached?.source === source) return cached.normalized;
  const normalized = normalizedTitle(source);
  descriptionCache.set(video, { source, normalized });
  return normalized;
}
function descriptionExcerpts(episode: Episode): string[] {
  // A long, verbatim episode-specific introduction survives title changes.
  // Never use only a guest name, generic channel footer, or a fuzzy description.
  const descriptionWords = normalizedTitle(episode.description ?? '')
    .split(' ')
    .slice(0, 135);
  // Include the last complete 45-word window, even when its starting point is
  // not divisible by 15. Short descriptions may have one edited opening word.
  const starts = new Set([
    ...Array.from({ length: 7 }, (_, i) => i * 15),
    Math.max(0, descriptionWords.length - 45),
  ]);
  return [...starts]
    .map((start) => descriptionWords.slice(start, start + 45))
    .filter((words) => words.length === 45 && new Set(words).size >= 25)
    .map((words) => words.join(' '))
    .filter(
      (text) => text.length >= 180 && !/https|youtube|instagram|twitter|فيسبوك|لينكدان/.test(text),
    );
}
export function matchEpisode(
  episode: Episode,
  videos: Video[],
  repeatedExcerpts = new Set<string>(),
  showSlug?: string,
) {
  const stem = titleStem(episode.title);
  const excerpts = descriptionExcerpts(episode).filter((excerpt) => !repeatedExcerpts.has(excerpt));
  const ranked = videos
    .map((video) => {
      const description = normalizedVideoDescription(video);
      const matchedExcerpt =
        channelAllowedForShow(video.channel_id, showSlug, episode.publishedAt) &&
        video.availability === 'public' &&
        !['is_live', 'is_upcoming'].includes(video.live_status ?? '')
          ? (excerpts.find((excerpt) => description.includes(excerpt)) ?? null)
          : null;
      return {
        ...video,
        titleScore: similarity(stem, titleStem(video.title)),
        exact: stem === titleStem(video.title) && stem.length >= 15 && stem.split(' ').length >= 3,
        exactDescription: Boolean(matchedExcerpt),
        matchedExcerpt,
        durationDelta: video.duration ? Math.abs(video.duration - episode.durationSec) : null,
      };
    })
    .sort((a, b) => Number(b.exact) - Number(a.exact) || b.titleScore - a.titleScore);
  const eligible = ranked.filter(
    (v) =>
      (v.exact || v.exactDescription) &&
      v.durationDelta !== null &&
      v.durationDelta <= Math.max(180, episode.durationSec * 0.06) &&
      channelAllowedForShow(v.channel_id, showSlug, episode.publishedAt) &&
      v.availability === 'public' &&
      !['is_live', 'is_upcoming'].includes(v.live_status ?? '') &&
      // A full discussion ABOUT advertising is not itself an advertisement.
      !/(?:^|[|｜])\s*(?:تشويقة|التشويقة|تشويقي|برومو|إعلان|اعلان)(?:\s|:|$)|(?:^|\s)(?:تشويقي|برومو|إعلان|اعلان)\s*$/.test(
        v.title,
      ),
  );
  const accepted = eligible.length === 1 && episode.episodeType !== 'trailer' ? eligible[0] : null;
  return {
    episodeId: episode.id,
    rssGuid: episode.guid,
    rssTitle: episode.title,
    rssDurationSec: episode.durationSec,
    status: accepted
      ? accepted.exact
        ? 'exact-title-duration'
        : 'exact-description-duration'
      : 'needs-review',
    videoId: accepted?.id ?? null,
    youtubeTitle: accepted?.title ?? null,
    matchedDescriptionExcerpt: accepted?.matchedExcerpt ?? null,
    candidates: ranked.slice(0, 3).map((v) => ({
      videoId: v.id,
      title: v.title,
      durationSec: v.duration,
      titleScore: Number(v.titleScore.toFixed(3)),
      durationDelta: v.durationDelta,
    })),
  };
}

export function buildMatches(shows: RssShow[], videos: Video[]) {
  const excerptCounts = new Map<string, number>();
  for (const episode of shows.flatMap((s) => s.episodes))
    for (const excerpt of new Set(descriptionExcerpts(episode)))
      excerptCounts.set(excerpt, (excerptCounts.get(excerpt) ?? 0) + 1);
  const repeatedExcerpts = new Set(
    [...excerptCounts].filter(([, count]) => count > 1).map(([text]) => text),
  );
  const items = shows.flatMap((s) =>
    s.episodes.map((e) => ({
      showId: s.id,
      showSlug: s.slug,
      showTitle: s.title,
      ...matchEpisode(e, videos, repeatedExcerpts, s.slug),
    })),
  );
  const counts = new Map<string, number>();
  for (const item of items)
    if (item.videoId) counts.set(item.videoId, (counts.get(item.videoId) ?? 0) + 1);
  for (const item of items)
    if (item.videoId && counts.get(item.videoId)! > 1) {
      item.status = 'needs-review';
      item.videoId = null;
      item.youtubeTitle = null;
    }
  return items;
}

async function main() {
  const [rssFile, youtubeFile, reportFile] = process.argv.slice(2);
  if (
    !rssFile ||
    !youtubeFile ||
    !reportFile ||
    !path.isAbsolute(reportFile) ||
    reportFile.includes('/mukhatlif/')
  )
    throw new Error('Provide RSS, official channel metadata, and private output paths');
  const rssText = await readFile(rssFile, 'utf8');
  const youtubeText = await readFile(youtubeFile, 'utf8');
  const rss = JSON.parse(rssText);
  const channel = JSON.parse(youtubeText);
  if (!isOfficialChannel(channel.channel_id)) throw new Error('Not the official Mukhtalif channel');
  const videos = channel.entries.filter(
    (v: Video) => /^[A-Za-z0-9_-]{11}$/.test(v.id) && typeof v.title === 'string',
  );
  const items = buildMatches(rss.shows, videos);
  const report = {
    schemaVersion: 1,
    channelId: channel.channel_id,
    generatedAt: new Date().toISOString(),
    sourceHashes: [rssText, youtubeText].map((s) => createHash('sha256').update(s).digest('hex')),
    counts: {
      episodes: items.length,
      verified: items.filter((i: { videoId: string | null }) => i.videoId).length,
    },
    items,
  };
  await writeFile(reportFile, JSON.stringify(report, null, 2), { mode: 0o600, flag: 'wx' });
  process.stdout.write(`${JSON.stringify(report.counts)}\n`);
}
if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) await main();
