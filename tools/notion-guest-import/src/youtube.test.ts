import { describe, expect, it, vi } from 'vitest';
import {
  enrichYouTubeOEmbedCache,
  parseYouTubeOEmbedCache,
  youtubeEvidenceMap,
  type YouTubeOEmbedCache,
} from './youtube.ts';

const empty: YouTubeOEmbedCache = { schemaVersion: 1, entries: [] };

describe('YouTube oEmbed evidence cache', () => {
  it('accepts only the exact cache schema and rejects duplicate video IDs', () => {
    const entry = {
      videoId: 'abcDEF_1234',
      status: 'ok' as const,
      httpStatus: 200,
      title: 'عنوان الحلقة',
      authorName: 'إذاعة مختلف',
      checkedAt: '2026-09-02T00:00:00.000Z',
    };
    expect(parseYouTubeOEmbedCache({ schemaVersion: 1, entries: [entry] }).entries).toEqual([
      entry,
    ]);
    expect(() => parseYouTubeOEmbedCache({ schemaVersion: 1, entries: [entry, entry] })).toThrow(
      /duplicate video IDs/i,
    );
    expect(() =>
      parseYouTubeOEmbedCache({ schemaVersion: 1, entries: [{ ...entry, extra: true }] }),
    ).toThrow(/unknown fields/i);
    expect(() =>
      parseYouTubeOEmbedCache({ schemaVersion: 1, entries: [], unexpected: true }),
    ).toThrow(/unknown fields/i);
  });

  it('fetches only missing IDs and exposes successful evidence', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ title: 'عنوان يوتيوب', author_name: 'إذاعة مختلف' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    const cache = await enrichYouTubeOEmbedCache(['video_12345', 'video_12345'], empty, {
      concurrency: 2,
      fetcher: fetcher as typeof fetch,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(cache.entries).toHaveLength(1);
    expect(youtubeEvidenceMap(cache).get('video_12345')).toEqual({
      videoId: 'video_12345',
      title: 'عنوان يوتيوب',
      authorName: 'إذاعة مختلف',
    });

    await enrichYouTubeOEmbedCache(['video_12345'], cache, {
      fetcher: fetcher as typeof fetch,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('records a missing video without manufacturing evidence', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 404 }));
    const cache = await enrichYouTubeOEmbedCache(['missing_123'], empty, {
      fetcher: fetcher as typeof fetch,
    });
    expect(cache.entries[0]).toMatchObject({
      videoId: 'missing_123',
      status: 'not_found',
      httpStatus: 404,
      title: null,
      authorName: null,
    });
    expect(youtubeEvidenceMap(cache).size).toBe(0);
  });

  it('retries transient cached errors but retains definitive evidence', async () => {
    const errored: YouTubeOEmbedCache = {
      schemaVersion: 1,
      entries: [
        {
          videoId: 'retry_12345',
          status: 'error',
          httpStatus: 503,
          title: null,
          authorName: null,
          checkedAt: '2026-09-02T00:00:00.000Z',
        },
      ],
    };
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ title: 'تعافى الطلب', author_name: 'إذاعة مختلف' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    const recovered = await enrichYouTubeOEmbedCache(['retry_12345'], errored, {
      fetcher: fetcher as typeof fetch,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(recovered.entries[0]).toMatchObject({ status: 'ok', title: 'تعافى الطلب' });
  });
});
