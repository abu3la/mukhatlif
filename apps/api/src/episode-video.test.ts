import { describe, expect, it } from 'vitest';
import { createEpisodeSchema, updateEpisodeSchema } from '@mukhtalif/validation';
import type { Episode } from '@mukhtalif/types';
import { toPublicEpisode } from './public-episode';

describe('episode video contract', () => {
  it('accepts valid IDs, clears explicitly, and rejects URLs or injected paths', () => {
    expect(updateEpisodeSchema.safeParse({ youtubeVideoId: 'LyxZez5Nixk' }).success).toBe(true);
    expect(updateEpisodeSchema.parse({ youtubeVideoId: null }).youtubeVideoId).toBeNull();
    expect(updateEpisodeSchema.parse({})).not.toHaveProperty('youtubeVideoId');
    expect(
      createEpisodeSchema.shape.youtubeVideoId.safeParse('https://youtu.be/LyxZez5Nixk').success,
    ).toBe(false);
    expect(updateEpisodeSchema.safeParse({ youtubeVideoId: '../injected' }).success).toBe(false);
  });
  it('does not leak a premium video ID through the anonymous catalogue', () => {
    const base = {
      id: '1',
      titleAr: 'حلقة',
      premium: false,
      youtubeVideoId: 'LyxZez5Nixk',
    } as Episode;
    expect(toPublicEpisode(base).youtubeVideoId).toBe(base.youtubeVideoId);
    expect(toPublicEpisode({ ...base, premium: true }).youtubeVideoId).toBeUndefined();
  });
});
