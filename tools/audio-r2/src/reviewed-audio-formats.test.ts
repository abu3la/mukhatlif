import { describe, expect, it } from 'vitest';
import type { AudioMigrationPlanItem } from './core.ts';
import { observeArchiveItem } from './audit.ts';
import { validAudioMagic } from './transfer.ts';
import {
  REVIEWED_AAC_SOURCE as review,
  REVIEWED_AAC_SOURCES,
  archiveObjectContentType,
  archiveObjectMetadata,
  reviewedSourceAudioFormat,
  validReviewedAacPrefix,
} from './reviewed-audio-formats.ts';

const item = {
  databaseEpisodeId: review.episodeId,
  showId: review.showId,
  rssGuid: review.rssGuid,
  sourceUrl:
    'https://anchor.fm/s/671546b0/podcast/play/49324166/https%3A%2F%2Fd3ctxlq1ktw2nl.cloudfront.net%2Fproduction%2F2022-2-20%2F254820630-44100-2-9007568d1b286.mp3',
  sourceUrlSha256: review.sourceUrlSha256,
  expectedByteSize: review.byteSize,
  extension: 'mp3',
  mimeType: 'audio/mpeg',
  key: `legacy/podcasts/source/${review.sourceUrlSha256}.mp3`,
} as AudioMigrationPlanItem;

function prefix() {
  const data = Buffer.alloc(1115);
  data.set(Buffer.from('fff950802e8244', 'hex'), 0);
  data.set(Buffer.from('fff95080310238', 'hex'), 372);
  data.set(Buffer.from('fff950802be244', 'hex'), 764);
  return data;
}

describe('explicit reviewed source-format exception', () => {
  it.each([
    [
      'ep-rss-petroly-02072a974bcadced',
      'https://anchor.fm/s/671546b0/podcast/play/48263673/https%3A%2F%2Fd3ctxlq1ktw2nl.cloudfront.net%2Fproduction%2F2022-1-27%2F250701893-44100-2-22f619ca53b51.mp3',
    ],
    [
      'ep-rss-petroly-e96554e2d323eb78',
      'https://anchor.fm/s/671546b0/podcast/play/46191586/https%3A%2F%2Fd3ctxlq1ktw2nl.cloudfront.net%2Fproduction%2F2022-0-15%2F242529655-44100-2-717f5c0986d53.mp3',
    ],
  ])('pins the separately decoded source %s without changing its original identity', (id, url) => {
    expect(new Set(REVIEWED_AAC_SOURCES.map((r) => r.episodeId)).size).toBe(3);
    const r = REVIEWED_AAC_SOURCES.find((entry) => entry.episodeId === id)!;
    const source = {
      ...item,
      databaseEpisodeId: id,
      rssGuid: r.rssGuid,
      sourceUrl: url,
      sourceUrlSha256: r.sourceUrlSha256,
      expectedByteSize: r.byteSize,
      key: `legacy/podcasts/source/${r.sourceUrlSha256}.mp3`,
    };
    expect(reviewedSourceAudioFormat(source)).toEqual(r);
    expect(archiveObjectContentType(source, r.bodySha256)).toBe('audio/aac');
    expect(archiveObjectMetadata(source, r.bodySha256)['format-review']).toBe(r.reviewId);
    expect(() => archiveObjectContentType(source, review.bodySha256)).toThrow('SHA-256 changed');
    expect(() => reviewedSourceAudioFormat({ ...source, rssGuid: review.rssGuid })).toThrow(
      'identity changed',
    );
    expect(source.sourceUrl).toBe(url);
    expect(source.mimeType).toBe('audio/mpeg');
  });

  it('recognizes three complete reviewed ADTS frames without accepting them as MP3', () => {
    expect(validReviewedAacPrefix(prefix())).toBe(true);
    expect(validAudioMagic(prefix(), 'mp3')).toBe(false);
    expect(validReviewedAacPrefix(prefix().subarray(0, -1))).toBe(false);
    expect(validReviewedAacPrefix(prefix().subarray(1))).toBe(false);
    expect(validReviewedAacPrefix(Buffer.from('<html>error</html>'))).toBe(false);
  });

  it('rejects inconsistent ADTS parameters and impossible frame lengths', () => {
    for (const [position, value] of [
      [372, 0],
      [373, 0xf1],
      [374, 0x90],
      [374, 0x54],
      [375, 0xc0],
      [376, 0],
      [378, 0x39],
    ]) {
      const bytes = prefix();
      bytes[position!] = value!;
      expect(validReviewedAacPrefix(bytes)).toBe(false);
    }
  });

  it('changes stored delivery type only for the exact source and body hash', () => {
    expect(reviewedSourceAudioFormat(item)).toEqual(review);
    expect(archiveObjectContentType(item, review.bodySha256)).toBe('audio/aac');
    expect(archiveObjectMetadata(item, review.bodySha256)).toEqual({
      sha256: review.bodySha256,
      'source-sha256': review.sourceUrlSha256,
      'source-content-type': 'audio/mpeg',
      'format-review': review.reviewId,
    });
    expect(() => archiveObjectContentType(item, 'a'.repeat(64))).toThrow('body SHA-256 changed');
    expect(() => archiveObjectMetadata(item, '')).toThrow('Missing audio SHA-256 proof');
    const unrelated = { ...item, databaseEpisodeId: 'another-episode' };
    expect(reviewedSourceAudioFormat(unrelated)).toBeNull();
    expect(archiveObjectContentType(unrelated, review.bodySha256)).toBe('audio/mpeg');
    expect(item.mimeType).toBe('audio/mpeg');
    expect(item.extension).toBe('mp3');
  });

  it('fails closed if any pinned source identity changes', () => {
    for (const change of [
      { showId: 'other' },
      { rssGuid: 'other' },
      { sourceUrl: 'https://anchor.fm/other.mp3' },
      { sourceUrlSha256: 'a'.repeat(64) },
      { expectedByteSize: review.byteSize + 1 },
      { extension: 'aac' },
      { mimeType: 'audio/aac' },
      { key: item.key.replace('.mp3', '.aac') },
    ])
      expect(() => reviewedSourceAudioFormat({ ...item, ...change })).toThrow('identity changed');
  });

  it('audits the corrected type and retained declared type, while refusing missing evidence', () => {
    const state = {
      sha256: review.bodySha256,
      etag: 'etag',
      verifiedAt: '2026-09-05T03:00:00Z',
      linkedAt: '2026-09-05T03:00:01Z',
    };
    const row = {
      id: item.databaseEpisodeId!,
      show_id: item.showId,
      rss_guid: item.rssGuid,
      audio_url: item.sourceUrl,
      source_url: item.sourceUrl,
      audio_key: item.key,
    };
    const head = {
      $metadata: {},
      ContentLength: item.expectedByteSize,
      ContentType: 'audio/aac',
      ETag: state.etag,
      Metadata: archiveObjectMetadata(item, review.bodySha256),
    };
    expect(observeArchiveItem(item, state, row, head).errors).toEqual([]);
    expect(
      observeArchiveItem(item, state, row, { ...head, ContentType: 'audio/mpeg' }).errors,
    ).toContain('object-mime');
    const withoutReview = { ...head, Metadata: { ...head.Metadata } };
    delete withoutReview.Metadata['format-review'];
    expect(observeArchiveItem(item, state, row, withoutReview).errors).toContain(
      'object-format-review',
    );
    expect(
      observeArchiveItem(item, { ...state, sha256: 'a'.repeat(64) }, row, head).errors,
    ).toContain('object-format-review');
  });
});
