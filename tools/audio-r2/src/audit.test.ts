import { describe, expect, it } from 'vitest';
import type { HeadObjectCommandOutput } from '@aws-sdk/client-s3';
import type { AudioMigrationPlanItem, DatabaseEpisode } from './core.ts';
import type { TransferState } from './transfer.ts';
import { completeArchiveScope, observeArchiveItem } from './audit.ts';

const item = {
  databaseEpisodeId: 'ep-audit-example',
  showId: 'show-audit',
  rssGuid: 'audit-guid',
  key: 'legacy/podcasts/audit.mp3',
  expectedByteSize: 256,
  mimeType: 'audio/mpeg',
  sourceUrl: 'https://anchor.fm/example.mp3',
  sourceUrlSha256: 'a'.repeat(64),
} as AudioMigrationPlanItem;
const state: TransferState = {
  verifiedAt: '2026-09-04T21:00:00.000Z',
  linkedAt: '2026-09-04T21:00:01.000Z',
  sha256: 'b'.repeat(64),
  etag: '"verified-etag"',
};
const row: DatabaseEpisode = {
  id: item.databaseEpisodeId!,
  show_id: item.showId,
  rss_guid: item.rssGuid,
  audio_key: item.key,
  audio_url: item.sourceUrl,
  source_url: item.sourceUrl,
};
const head: HeadObjectCommandOutput = {
  $metadata: {},
  ContentLength: item.expectedByteSize,
  ContentType: item.mimeType,
  ETag: state.etag,
  Metadata: { sha256: state.sha256!, 'source-sha256': item.sourceUrlSha256 },
};
const verified = () => observeArchiveItem(item, state, row, head);
const complete = (observations = [verified()], statuses = ['complete'], files = 1, bytes = 256) =>
  completeArchiveScope(observations, statuses, files, bytes);

describe('read-only archive scope audit', () => {
  it('requires every transfer, provenance, object and database proof', () => {
    expect(verified()).toMatchObject({
      sourcePreserved: true,
      checkpointVerified: true,
      checkpointLinked: true,
      objectUnchangedSinceReadback: true,
      databaseLinked: true,
      errors: [],
    });
    expect(complete()).toBe(true);
  });
  it('never calls an incomplete, duplicate or empty scope complete', () => {
    expect(complete([], ['complete'], 1, 256)).toBe(false);
    expect(complete([verified()], ['complete'], 2, 512)).toBe(false);
    expect(complete([verified(), verified()], ['complete'], 2, 512)).toBe(false);
    expect(complete([], ['complete'], 0, 0)).toBe(false);
  });
  it('requires exact scope bytes and completed batch status', () => {
    expect(complete([verified()], ['complete'], 1, 255)).toBe(false);
    expect(complete([verified()], ['running'])).toBe(false);
    expect(complete([verified()], ['complete', 'stopped'])).toBe(false);
    expect(complete([verified()], [])).toBe(false);
  });
  it('does not accept HEAD metadata as a substitute for full readback proof', () => {
    const pending = observeArchiveItem(item, undefined, row, head);
    expect(pending.checkpointVerified).toBe(false);
    expect(pending.objectUnchangedSinceReadback).toBe(false);
    expect(complete([pending])).toBe(false);
  });
  it('rejects absent or malformed checksum, ETag, verification and link dates', () => {
    for (const changed of [
      { ...state, sha256: undefined },
      { ...state, sha256: 'bad' },
      { ...state, etag: undefined },
      { ...state, verifiedAt: 'bad' },
      { ...state, linkedAt: undefined },
      { ...state, linkedAt: 'bad' },
      { ...state, linkedAt: '2026-09-04T20:59:59.000Z' },
    ])
      expect(complete([observeArchiveItem(item, changed, row, head)])).toBe(false);
  });
  it('fails closed when an object HEAD is missing or inaccessible', () => {
    const observation = observeArchiveItem(item, state, row);
    expect(observation.errors).toContain('object-head-unavailable');
    expect(complete([observation])).toBe(false);
  });
  it.each([
    ['size', { ...head, ContentLength: 255 }],
    ['mime', { ...head, ContentType: 'text/html' }],
    ['etag', { ...head, ETag: 'other' }],
    ['sha256', { ...head, Metadata: { ...head.Metadata, sha256: 'c'.repeat(64) } }],
    ['source-sha256', { ...head, Metadata: { ...head.Metadata, 'source-sha256': 'c'.repeat(64) } }],
  ])('rejects an object whose %s changed after full readback', (reason, changed) => {
    const observation = observeArchiveItem(item, state, row, changed as HeadObjectCommandOutput);
    expect(observation.errors).toContain(`object-${reason}`);
    expect(complete([observation])).toBe(false);
  });
  it('rejects missing rows and any changed source identity', () => {
    for (const changed of [
      undefined,
      { ...row, id: 'other' },
      { ...row, show_id: 'other' },
      { ...row, rss_guid: 'other' },
      { ...row, audio_url: 'https://example.com/other.mp3' },
      { ...row, source_url: 'https://example.com/other.mp3' },
    ]) {
      const observation = observeArchiveItem(item, state, changed, head);
      expect(observation.errors).toContain('development-source-provenance');
      expect(complete([observation])).toBe(false);
    }
  });
  it('detects cleared or manually replaced database keys without editing them', () => {
    for (const changed of [
      { ...row, audio_key: null },
      { ...row, audio_key: 'episodes/manual.mp3' },
    ]) {
      const before = structuredClone(changed);
      const observation = observeArchiveItem(item, state, changed, head);
      expect(observation.errors).toContain('development-audio-key');
      expect(complete([observation])).toBe(false);
      expect(changed).toEqual(before);
    }
  });
});
