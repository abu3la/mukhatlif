import { describe, expect, it } from 'vitest';
import {
  audioObjectKey,
  buildAudioMigrationPlan,
  summarizeAudioPlan,
  type DatabaseEpisode,
} from './core.ts';

function manifest(
  url = 'https://anchor.fm/s/example/podcast/play/1/https%3A%2F%2Fcdn.example%2Fa.mp3',
) {
  return {
    schemaVersion: 1,
    snapshot: 'test',
    manifestChecksumSha256: 'a'.repeat(64),
    shows: [
      {
        id: 'show-rss-sample',
        slug: 'sample',
        title: 'برنامج',
        episodes: [
          {
            id: 'ep-rss-sample-one',
            guid: 'guid-1',
            title: 'حلقة',
            durationSec: 100,
            enclosure: { url, mimeType: 'audio/mpeg', lengthBytes: 1_000_000 },
          },
        ],
      },
    ],
  };
}

function row(patch: Partial<DatabaseEpisode> = {}): DatabaseEpisode {
  const source = manifest().shows[0]!.episodes[0]!.enclosure.url;
  return {
    id: 'ep-rss-sample-one',
    show_id: 'show-rss-sample',
    rss_guid: 'guid-1',
    audio_key: null,
    audio_url: source,
    source_url: source,
    ...patch,
  };
}

describe('audio R2 migration plan', () => {
  it('creates a deterministic immutable source key and a ready CAS plan', () => {
    const [item] = buildAudioMigrationPlan(manifest(), [row()]);
    expect(item?.databaseState).toBe('ready');
    expect(item?.key).toBe(audioObjectKey(item!.sourceUrl, 'mp3'));
    expect(item?.key).toMatch(/^legacy\/podcasts\/source\/[a-f0-9]{64}\.mp3$/);
    expect(item?.approximateBitrateKbps).toBe(80);
  });

  it('preserves Studio audio URLs and audio keys', () => {
    expect(
      buildAudioMigrationPlan(manifest(), [row({ audio_url: 'https://anchor.fm/changed.mp3' })])[0]
        ?.databaseState,
    ).toBe('studio-audio-url-preserved');
    expect(
      buildAudioMigrationPlan(manifest(), [row({ audio_key: 'studio/custom.mp3' })])[0]
        ?.databaseState,
    ).toBe('studio-audio-key-preserved');
  });

  it('is idempotent when the desired key is already linked', () => {
    const source = manifest().shows[0]!.episodes[0]!.enclosure.url;
    const key = audioObjectKey(source, 'mp3');
    expect(buildAudioMigrationPlan(manifest(), [row({ audio_key: key })])[0]?.databaseState).toBe(
      'already-linked',
    );
  });

  it('summarizes sizes, formats, and duplicate source URLs', () => {
    const value = manifest();
    const duplicate = structuredClone(value.shows[0]!.episodes[0]!);
    duplicate.id = 'ep-rss-sample-two';
    duplicate.guid = 'guid-2';
    duplicate.enclosure.lengthBytes = 3_000_000;
    value.shows[0]!.episodes.push(duplicate);
    const rows = [row(), row({ id: duplicate.id, rss_guid: duplicate.guid })];
    const stats = summarizeAudioPlan(buildAudioMigrationPlan(value, rows));
    expect(stats.episodeCount).toBe(2);
    expect(stats.totalBytes).toBe(4_000_000);
    expect(stats.sizeBytes.median).toBe(1_000_000);
    expect(stats.duplicateSourceUrls[0]?.count).toBe(2);
  });

  it('rejects non-Anchor sources without creating a writable plan', () => {
    const [item] = buildAudioMigrationPlan(manifest('https://localhost/audio.mp3'), [row()]);
    expect(item?.databaseState).toBe('invalid-source');
  });
});
