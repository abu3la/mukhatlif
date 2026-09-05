import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizedTitle,
  titleStem,
  type Episode,
  type RssShow,
  type Video,
} from './youtube-match.ts';
import { applyVerifiedMatches } from './youtube-apply.ts';
import { channelAllowedForShow, isOfficialChannel } from './youtube-channels.ts';

export interface ReviewedPair {
  episodeId: string;
  videoId: string;
  guest?: string;
  reviewMode?: 'guest' | 'title';
  rationale: string;
}
type DatedVideo = Video & { upload_date: string };
// These gates support a recorded manual editorial review; they do not generate
// new guesses from guest names or fuzzy titles. The automatic matcher is unchanged.
export function reviewedMatch(
  pair: ReviewedPair,
  show: RssShow,
  episode: Episode,
  video: DatedVideo,
) {
  const guest = normalizedTitle(pair.guest ?? '');
  const rssTitle = titleStem(episode.title);
  const youtubeTitle = titleStem(video.title);
  const compact = (s: string) => s.replace(/\s+/g, '');
  // Manual-only: historical two-word titles or a removed colon subtitle.
  // This does not change automatic title/excerpt thresholds.
  const exactTitle =
    rssTitle.length >= 8 &&
    rssTitle.split(' ').length >= 2 &&
    compact(rssTitle) === compact(youtubeTitle);
  const colonTitle = titleStem(episode.title.split(':')[0]!);
  const removedSubtitle =
    episode.title.includes(':') &&
    colonTitle.length >= 12 &&
    colonTitle.split(' ').length >= 3 &&
    colonTitle === youtubeTitle;
  const identityVerified =
    pair.reviewMode === 'title'
      ? exactTitle || removedSubtitle
      : (pair.reviewMode === undefined || pair.reviewMode === 'guest') &&
        guest.length >= 8 &&
        guest.split(' ').length >= 2 &&
        compact(normalizedTitle(`${episode.title} ${episode.description ?? ''}`)).includes(
          compact(guest),
        ) &&
        compact(normalizedTitle(`${video.title} ${video.description ?? ''}`)).includes(
          compact(guest),
        );
  const date = /^\d{8}$/.test(video.upload_date)
    ? Date.parse(
        `${video.upload_date.slice(0, 4)}-${video.upload_date.slice(4, 6)}-${video.upload_date.slice(6, 8)}`,
      )
    : NaN;
  const dateDelta = Math.abs(Date.parse(episode.publishedAt) - date);
  if (
    episode.id !== pair.episodeId ||
    video.id !== pair.videoId ||
    !/^[A-Za-z0-9_-]{11}$/.test(video.id) ||
    !channelAllowedForShow(video.channel_id, show.slug, episode.publishedAt) ||
    video.availability !== 'public' ||
    ['is_live', 'is_upcoming'].includes(video.live_status ?? '') ||
    episode.episodeType === 'trailer' ||
    !video.duration ||
    Math.abs(video.duration - episode.durationSec) > 2 ||
    !Number.isFinite(dateDelta) ||
    dateDelta > 4 * 86400_000 ||
    !identityVerified ||
    pair.rationale.length < 50
  )
    throw new Error(
      'Manual pair does not meet official-channel, guest, duration, date or evidence guards',
    );
  return {
    showId: show.id,
    showSlug: show.slug,
    showTitle: show.title,
    episodeId: episode.id,
    rssGuid: episode.guid,
    rssTitle: episode.title,
    rssDurationSec: episode.durationSec,
    status:
      pair.reviewMode === 'title'
        ? 'manually-reviewed-title-date-duration'
        : 'manually-reviewed-guest-title-date-duration',
    videoId: video.id,
    youtubeTitle: video.title,
    matchedDescriptionExcerpt: null,
    candidates: [],
  };
}
async function main() {
  const [reviewFile, confirmedSha, rssFile, channelFile, envFile, output] = process.argv.slice(2);
  if (!reviewFile || !confirmedSha || !rssFile || !channelFile || !envFile || !output)
    throw new Error(
      'Usage: youtube-reviewed.ts REVIEW SHA256 RSS CHANNEL PRIVATE_DEV_ENV PRIVATE_RESULT',
    );
  const [reviewText, rssText, channelText] = await Promise.all(
    [reviewFile, rssFile, channelFile].map((p) => readFile(p, 'utf8')),
  );
  const hash = (s: string) => createHash('sha256').update(s).digest('hex');
  const review = JSON.parse(reviewText!) as {
    kind: string;
    sourceHashes: string[];
    pairs: ReviewedPair[];
  };
  if (
    hash(reviewText!) !== confirmedSha ||
    review.kind !== 'manually-reviewed-full-episodes' ||
    review.sourceHashes[0] !== hash(rssText!) ||
    review.sourceHashes[1] !== hash(channelText!) ||
    !Array.isArray(review.pairs) ||
    !review.pairs.length ||
    review.pairs.length > 50
  )
    throw new Error('Review/source hash or scope mismatch');
  const rss = JSON.parse(rssText!) as { shows: RssShow[] };
  const channel = JSON.parse(channelText!) as { channel_id: string; entries: DatedVideo[] };
  if (!isOfficialChannel(channel.channel_id)) throw new Error('Not the official channel');
  const matches = review.pairs.map((pair) => {
    const show = rss.shows.find((s) => s.episodes.some((e) => e.id === pair.episodeId));
    const episode = show?.episodes.find((e) => e.id === pair.episodeId);
    const video = channel.entries.find((v) => v.id === pair.videoId);
    if (!show || !episode || !video) throw new Error('Reviewed source record missing');
    return reviewedMatch(pair, show, episode, video);
  });
  await applyVerifiedMatches(matches, envFile, output, confirmedSha);
}
if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url))
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Review failed'}\n`);
    process.exitCode = 1;
  });
