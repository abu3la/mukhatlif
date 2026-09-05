import { createHash } from 'node:crypto';
import type { AudioMigrationPlanItem } from './core.ts';

// The source is ADTS AAC despite its immutable .mp3 URL and audio/mpeg header.
// Private evidence: aac-source-format-review.json and ep-rss-*-aac-source-review.json,
// complete ADTS frame walks and ffmpeg -xerror full decodes. Not auto-detection.
export const REVIEWED_AAC_SOURCE = Object.freeze({
  reviewId: 'petroly-aac-20260905',
  episodeId: 'ep-rss-petroly-cb77233f92442c04',
  showId: 'shw-petroly',
  rssGuid: 'd5c8e688-29b8-40f3-82bd-9bd0c28572df',
  sourceUrlSha256: '638800aebdfc207e06a2fe7ccad9b0e642a11144a9b4e9181e05e432116f4f84',
  byteSize: 74462866,
  bodySha256: '7c477a95de5dae96df567afa7dbac1cdf55ac1130f214a3e564212de1992e378',
  storageContentType: 'audio/aac',
});

export const REVIEWED_AAC_SOURCES = Object.freeze([
  REVIEWED_AAC_SOURCE,
  Object.freeze({
    reviewId: 'petroly-aac-muadh-20260905',
    episodeId: 'ep-rss-petroly-02072a974bcadced',
    showId: 'shw-petroly',
    rssGuid: '83724706-e72f-487d-817a-c4b3d9a04cff',
    sourceUrlSha256: 'e5ba93deb02a21620ad17c9a3d84bb8e56f2f5290241f53111d9bf93ad795fd9',
    byteSize: 58049516,
    bodySha256: '9d361ef3c69f2e6398abb88d802f6506f485aa9636d34ee36c67097a197a914a',
    storageContentType: 'audio/aac',
  }),
  Object.freeze({
    reviewId: 'petroly-aac-ali-20260905',
    episodeId: 'ep-rss-petroly-e96554e2d323eb78',
    showId: 'shw-petroly',
    rssGuid: '133d0d08-944c-42e3-b2c1-a4873cafff1c',
    sourceUrlSha256: '7da31288fc41394cda1df62ae4dab3680a054222a4779a1b816b9a52452f8602',
    byteSize: 59261040,
    bodySha256: '8e37f6f55addb0f94452b1cf91fef415db4ac9a2381d0c3eb408604df4486cf5',
    storageContentType: 'audio/aac',
  }),
]);

export function reviewedSourceAudioFormat(item: AudioMigrationPlanItem) {
  const review = REVIEWED_AAC_SOURCES.find((r) => r.episodeId === item.databaseEpisodeId);
  if (!review) return null;
  if (
    item.showId !== review.showId ||
    item.rssGuid !== review.rssGuid ||
    item.sourceUrlSha256 !== review.sourceUrlSha256 ||
    createHash('sha256').update(item.sourceUrl).digest('hex') !== review.sourceUrlSha256 ||
    item.expectedByteSize !== review.byteSize ||
    item.extension !== 'mp3' ||
    item.mimeType !== 'audio/mpeg' ||
    item.key !== `legacy/podcasts/source/${review.sourceUrlSha256}.mp3`
  )
    throw new Error('Reviewed audio source identity changed');
  return review;
}

export function archiveObjectContentType(item: AudioMigrationPlanItem, bodySha256?: string) {
  const review = reviewedSourceAudioFormat(item);
  if (review && bodySha256 !== review.bodySha256)
    throw new Error('Reviewed audio body SHA-256 changed');
  return review?.storageContentType ?? item.mimeType;
}

export function archiveObjectMetadata(item: AudioMigrationPlanItem, bodySha256: string) {
  if (!/^[a-f0-9]{64}$/.test(bodySha256 ?? '')) throw new Error('Missing audio SHA-256 proof');
  archiveObjectContentType(item, bodySha256);
  const review = reviewedSourceAudioFormat(item);
  const metadata: Record<string, string> = {
    sha256: bodySha256,
    'source-sha256': item.sourceUrlSha256,
  };
  if (review) {
    metadata['source-content-type'] = item.mimeType;
    metadata['format-review'] = review.reviewId;
  }
  return metadata;
}

// Only the reviewed MPEG-2 AAC-LC / 44.1 kHz stereo stream, starting at byte 0.
// Three complete ADTS frames are required; the full body hash is checked next.
// Header layout: FFmpeg libavcodec/adts_header.c; MIME: IANA audio/aac.
export function validReviewedAacPrefix(bytes: Buffer): boolean {
  let offset = 0;
  for (let count = 0; count < 3; count++) {
    if (offset + 7 > bytes.length) return false;
    const h = bytes.subarray(offset, offset + 7);
    if (
      h[0] !== 0xff ||
      h[1] !== 0xf9 ||
      h[2]! >> 6 !== 1 ||
      ((h[2]! >> 2) & 15) !== 4 ||
      (((h[2]! & 1) << 2) | (h[3]! >> 6)) !== 2 ||
      (h[6]! & 3) !== 0
    )
      return false;
    const length = ((h[3]! & 3) << 11) | (h[4]! << 3) | (h[5]! >> 5);
    if (length < 8 || offset + length > bytes.length) return false;
    offset += length;
  }
  return true;
}
