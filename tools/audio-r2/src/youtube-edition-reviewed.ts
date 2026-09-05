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
interface Transcript {
  episodeId: string;
  reportSha256: string;
  originalSourceUrl: string;
  requestedStartSec: number;
  requestedDurationSec: number;
  transcription: { text: string; audioSeconds: number; pcmSha256: string };
}
interface CaptionTrack {
  events: { tStartMs: number; segs?: { utf8: string }[] }[];
}
interface EditionReview {
  kind: 'manually-reviewed-recording-editions';
  episodeId: string;
  videoId: string;
  guest: string;
  rationale: string;
  editionDifference: string;
  sourcePublishedAt: string;
  videoUploadDate: string;
  sourceDurationSec: number;
  videoDurationSec: number;
  sourceHashes: [string, string];
  audioReport: FileProof;
  captions: FileProof & { videoId: string };
  clips: (FileProof & {
    videoStartSec: number;
    videoDurationSec: number;
    sourceExcerpt: string;
    captionExcerpt: string;
  })[];
}
type SourceEpisode = Episode & { enclosure: { url: string } };
type DatedVideo = Video & { upload_date: string };
const normalizeSpeech = (text: string) => normalizedTitle(text).replace(/ة/g, 'ه');

// Editorial exception for different published cuts of the SAME recording.
// This function never discovers candidates or weakens the automatic matcher.
// A reviewer must inspect the actual passages and explain the edition difference.
export function reviewedEditionMatch(
  review: EditionReview,
  show: RssShow,
  episode: SourceEpisode,
  video: DatedVideo,
  transcripts: Transcript[],
  captions: CaptionTrack,
) {
  const compact = (s: string) => normalizedTitle(s).replace(/\s/g, '');
  const guest = normalizedTitle(review.guest);
  const published = /^\d{8}$/.test(video.upload_date)
    ? Date.parse(video.upload_date.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3'))
    : NaN;
  const delta = Math.abs(Date.parse(episode.publishedAt) - published);
  const starts = transcripts.map((t) => t.requestedStartSec);
  if (
    review.kind !== 'manually-reviewed-recording-editions' ||
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
    video.duration! < 1200 ||
    !Number.isFinite(delta) ||
    review.sourcePublishedAt !== episode.publishedAt ||
    review.videoUploadDate !== video.upload_date ||
    review.sourceDurationSec !== episode.durationSec ||
    review.videoDurationSec !== video.duration ||
    guest.length < 8 ||
    guest.split(' ').length < 2 ||
    !compact(`${episode.title} ${episode.description ?? ''}`).includes(compact(guest)) ||
    !compact(`${video.title} ${video.description ?? ''}`).includes(compact(guest)) ||
    review.rationale.length < 150 ||
    review.editionDifference.length < 100 ||
    review.clips.length < 2 ||
    review.clips.length > 3 ||
    transcripts.length !== review.clips.length ||
    starts[0]! > 180 ||
    starts.at(-1)! < episode.durationSec * 0.4 ||
    starts.some((s, i) => i > 0 && s - starts[i - 1]! < 600) ||
    review.clips.some((c, i) => i > 0 && c.videoStartSec - review.clips[i - 1]!.videoStartSec < 600)
  )
    throw new Error('Edition identity, guest, scope, chronology or editorial review is incomplete');
  transcripts.forEach((clip, i) => {
    const proof = review.clips[i]!;
    const sourceText = normalizeSpeech(clip.transcription.text);
    const sourceExcerpt = normalizeSpeech(proof.sourceExcerpt);
    const captionExcerpt = normalizeSpeech(proof.captionExcerpt);
    const captionText = normalizeSpeech(
      captions.events
        .filter(
          (e) =>
            e.tStartMs >= proof.videoStartSec * 1000 &&
            e.tStartMs < (proof.videoStartSec + proof.videoDurationSec) * 1000,
        )
        .map((e) => e.segs?.map((s) => s.utf8).join('') ?? '')
        .join(' '),
    );
    const a = new Set(sourceExcerpt.split(' ').filter((w) => w.length >= 3));
    const b = new Set(captionExcerpt.split(' ').filter((w) => w.length >= 3));
    const common = [...a].filter((w) => b.has(w)).length;
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
      clip.requestedStartSec + clip.requestedDurationSec > episode.durationSec ||
      !Number.isFinite(proof.videoStartSec) ||
      proof.videoStartSec < 0 ||
      !Number.isFinite(proof.videoDurationSec) ||
      proof.videoDurationSec < 60 ||
      proof.videoDurationSec > 120 ||
      proof.videoStartSec + proof.videoDurationSec > video.duration! ||
      sourceExcerpt.split(' ').length < 40 ||
      captionExcerpt.split(' ').length < 40 ||
      a.size < 25 ||
      b.size < 25 ||
      common < 20 ||
      common / Math.min(a.size, b.size) < 0.35 ||
      !sourceText.includes(sourceExcerpt) ||
      !captionText.includes(captionExcerpt)
    )
      throw new Error('Edition speech evidence is unbound, weak, mismatched or out of range');
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
    status: 'manually-reviewed-recording-editions',
    videoId: video.id,
    youtubeTitle: video.title,
    matchedDescriptionExcerpt: null,
    candidates: [],
  };
}
async function readProof<T>(file: FileProof): Promise<T> {
  if (!path.isAbsolute(file.path) || !/^[a-f0-9]{64}$/.test(file.sha256))
    throw new Error('Evidence path/hash required');
  const text = await readFile(file.path, 'utf8');
  if (createHash('sha256').update(text).digest('hex') !== file.sha256)
    throw new Error('Evidence checksum mismatch');
  return JSON.parse(text) as T;
}
async function main() {
  const [reviewFile, sha, rssFile, channelFile, env, output] = process.argv.slice(2);
  if (!reviewFile || !sha || !rssFile || !channelFile || !env || !output)
    throw new Error('Usage: youtube-edition-reviewed.ts REVIEW SHA RSS CHANNEL DEV_ENV OUTPUT');
  const review = await readProof<EditionReview>({ path: reviewFile, sha256: sha });
  const rss = await readProof<{
    shows: (Omit<RssShow, 'episodes'> & { episodes: SourceEpisode[] })[];
  }>({ path: rssFile, sha256: review.sourceHashes[0] });
  const channel = await readProof<{ entries: DatedVideo[] }>({
    path: channelFile,
    sha256: review.sourceHashes[1],
  });
  const audio = await readProof<{ items: { databaseEpisodeId: string; sourceUrl: string }[] }>(
    review.audioReport,
  );
  const show = rss.shows.find((s) => s.episodes.some((e) => e.id === review.episodeId));
  const episode = show?.episodes.find((e) => e.id === review.episodeId);
  const video = channel.entries.find((v) => v.id === review.videoId);
  if (
    !show ||
    !episode ||
    !video ||
    audio.items.find((i) => i.databaseEpisodeId === episode.id)?.sourceUrl !== episode.enclosure.url
  )
    throw new Error('Reviewed source identity mismatch');
  const transcripts = await Promise.all(review.clips.map((c) => readProof<Transcript>(c)));
  const captions = await readProof<CaptionTrack>(review.captions);
  await applyVerifiedMatches(
    [reviewedEditionMatch(review, show, episode, video, transcripts, captions)],
    env,
    output,
    sha,
  );
}
if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url))
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Edition review failed'}\n`);
    process.exitCode = 1;
  });
