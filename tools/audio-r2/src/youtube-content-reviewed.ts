import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizedTitle, type Episode, type RssShow, type Video } from './youtube-match.ts';
import { channelAllowedForShow } from './youtube-channels.ts';
import { applyVerifiedMatches } from './youtube-apply.ts';

interface FileProof {
  path: string;
  sha256: string;
}
interface Clip {
  episodeId: string;
  reportSha256: string;
  originalSourceUrl: string;
  requestedStartSec: number;
  requestedDurationSec: number;
  transcription: { audioSeconds: number; text: string; pcmSha256: string };
}
interface Captions {
  events: { tStartMs: number; segs?: { utf8: string }[] }[];
}
interface ContentReview {
  kind: 'manually-reviewed-spoken-content';
  sourceHashes: [string, string];
  audioReport: FileProof;
  episodeId: string;
  videoId: string;
  rationale: string;
  captions: FileProof & { videoId: string };
  clips: (FileProof & { sharedQuote: string })[];
}

// This is an explicit editorial review, never a discovery or fuzzy-matching rule.
// Retain exact-duration/date gates. Two distant, hash-bound spoken passages
// corroborate a renamed episode whose RSS description contains only a footer.
export function contentReviewedMatch(
  review: ContentReview,
  show: RssShow,
  episode: Episode & { enclosure: { url: string } },
  video: Video & { upload_date: string },
  clips: Clip[],
  captions: Captions,
) {
  const date = /^\d{8}$/.test(video.upload_date)
    ? Date.parse(video.upload_date.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3'))
    : NaN;
  const delta = Math.abs(Date.parse(episode.publishedAt) - date);
  const textBetween = (start: number, end: number) =>
    normalizedTitle(
      captions.events
        .filter((e) => e.tStartMs >= start * 1000 && e.tStartMs <= end * 1000)
        .map((e) => e.segs?.map((s) => s.utf8).join('') ?? '')
        .join(' '),
    );
  if (
    review.kind !== 'manually-reviewed-spoken-content' ||
    review.episodeId !== episode.id ||
    review.videoId !== video.id ||
    review.captions.videoId !== video.id ||
    !/^[A-Za-z0-9_-]{11}$/.test(video.id) ||
    !channelAllowedForShow(video.channel_id, show.slug, episode.publishedAt) ||
    video.availability !== 'public' ||
    ['is_live', 'is_upcoming'].includes(video.live_status ?? '') ||
    episode.episodeType !== 'full' ||
    !Number.isFinite(episode.durationSec) ||
    episode.durationSec < 1200 ||
    !Number.isFinite(video.duration) ||
    Math.abs(video.duration! - episode.durationSec) > 2 ||
    !Number.isFinite(delta) ||
    delta > 4 * 86400_000 ||
    review.rationale.length < 100 ||
    review.clips.length !== 2 ||
    clips.length !== 2 ||
    clips[1]!.requestedStartSec - clips[0]!.requestedStartSec < 600
  )
    throw new Error('Spoken-content review does not meet identity/date/duration/scope guards');
  const allCaptions = textBetween(0, video.duration!);
  clips.forEach((clip, i) => {
    const quote = normalizedTitle(review.clips[i]!.sharedQuote);
    const end = clip.requestedStartSec + clip.requestedDurationSec;
    if (
      clip.episodeId !== episode.id ||
      clip.reportSha256 !== review.audioReport.sha256 ||
      clip.originalSourceUrl !== episode.enclosure.url ||
      !/^[a-f0-9]{64}$/.test(clip.transcription.pcmSha256) ||
      !Number.isFinite(clip.requestedStartSec) ||
      clip.requestedStartSec < 0 ||
      !Number.isFinite(clip.requestedDurationSec) ||
      clip.requestedDurationSec < 60 ||
      clip.requestedDurationSec > 90 ||
      !Number.isFinite(clip.transcription.audioSeconds) ||
      Math.abs(clip.transcription.audioSeconds - clip.requestedDurationSec) > 0.1 ||
      end > episode.durationSec ||
      quote.length < 35 ||
      quote.split(' ').length < 8 ||
      new Set(quote.split(' ')).size < 7 ||
      !normalizedTitle(clip.transcription.text).includes(quote) ||
      !textBetween(clip.requestedStartSec, end).includes(quote) ||
      allCaptions.split(quote).length !== 2
    )
      throw new Error('Missing, repeated, mismatched or out-of-bounds spoken evidence');
  });
  return {
    showId: show.id,
    showSlug: show.slug,
    showTitle: show.title,
    episodeId: episode.id,
    rssGuid: episode.guid,
    rssTitle: episode.title,
    rssDurationSec: episode.durationSec,
    expectedSourceUrl: episode.enclosure.url,
    status: 'manually-reviewed-two-spoken-passages',
    videoId: video.id,
    youtubeTitle: video.title,
    matchedDescriptionExcerpt: null,
    candidates: [],
  };
}

const hash = (text: string) => createHash('sha256').update(text).digest('hex');
async function readProof<T>(proof: FileProof): Promise<T> {
  if (!path.isAbsolute(proof.path) || !/^[a-f0-9]{64}$/.test(proof.sha256))
    throw new Error('Absolute evidence path and SHA-256 required');
  const text = await readFile(proof.path, 'utf8');
  if (hash(text) !== proof.sha256) throw new Error('Evidence checksum mismatch');
  return JSON.parse(text) as T;
}
async function main() {
  const [reviewFile, sha, rssFile, channelFile, env, output] = process.argv.slice(2);
  if (!reviewFile || !sha || !rssFile || !channelFile || !env || !output)
    throw new Error('Usage: youtube-content-reviewed.ts REVIEW SHA RSS CHANNEL DEV_ENV OUTPUT');
  const review = await readProof<ContentReview>({ path: reviewFile, sha256: sha });
  const rss = await readProof<{
    shows: (Omit<RssShow, 'episodes'> & {
      episodes: (Episode & { enclosure: { url: string } })[];
    })[];
  }>({ path: rssFile, sha256: review.sourceHashes[0] });
  const channel = await readProof<{ entries: (Video & { upload_date: string })[] }>({
    path: channelFile,
    sha256: review.sourceHashes[1],
  });
  const audioReport = await readProof<{
    items: { databaseEpisodeId: string; sourceUrl: string }[];
  }>(review.audioReport);
  const show = rss.shows.find((s) => s.episodes.some((e) => e.id === review.episodeId));
  const episode = show?.episodes.find((e) => e.id === review.episodeId);
  const video = channel.entries.find((v) => v.id === review.videoId);
  const source = audioReport.items.find((i) => i.databaseEpisodeId === review.episodeId);
  if (!show || !episode || !video || source?.sourceUrl !== episode.enclosure.url)
    throw new Error('Reviewed RSS/audio/channel identity mismatch');
  const clips = await Promise.all(review.clips.map((p) => readProof<Clip>(p)));
  const captions = await readProof<Captions>(review.captions);
  const match = contentReviewedMatch(review, show, episode, video, clips, captions);
  await applyVerifiedMatches([match], env, output, sha);
}
if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url))
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Review failed'}\n`);
    process.exitCode = 1;
  });
