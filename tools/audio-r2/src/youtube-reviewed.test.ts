import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { reviewedMatch } from './youtube-reviewed.ts';
import { applyVerifiedMatches } from './youtube-apply.ts';

const guest = 'أحمد الخطيب';
const episode = {
  id: 'ep-review-1',
  guid: 'guid-review-1',
  title: `الحياة المهنية مع ${guest}`,
  durationSec: 4000,
  publishedAt: '2026-08-31T12:00:00.000Z',
  episodeType: 'full',
};
const show = { id: 'shw-review', slug: 'review', title: 'مختلف', episodes: [episode] };
const video = {
  id: 'LyxZez5Nixk',
  title: `المسار المهني مع ${guest}`,
  duration: 4000,
  channel_id: 'UC8vdjzu_0QMQlG9qNT5D_AQ',
  availability: 'public',
  upload_date: '20260831',
};
const pair = {
  episodeId: episode.id,
  videoId: video.id,
  guest,
  rationale:
    'The curator reviewed both source records and confirmed the same guest, topic, date and exact full duration.',
};

describe('manually reviewed episode matches', () => {
  it('supports explicit short-title and removed-subtitle reviews, not fuzzy guesses', () => {
    const review = { ...pair, reviewMode: 'title' as const, guest: undefined };
    for (const [rss, yt] of [
      ['الطالب التاجر', 'الطالب التاجر | بودكاست بترولي'],
      ['رحلة ما بعد التخرج', 'رحلة مابعد التخرج | بودكاست بترولي'],
      ['كيف تتعلم بذكاء: هكذا تصل إلى التفوق الدراسي', 'كيف تتعلم بذكاء | بودكاست مناوب'],
    ])
      expect(
        reviewedMatch(review, show, { ...episode, title: rss }, { ...video, title: yt }).videoId,
      ).toBe(video.id);
    for (const title of ['الطالب الناجح', 'التاجر', 'كيف تتعلم'])
      expect(() =>
        reviewedMatch(review, show, { ...episode, title: 'الطالب التاجر' }, { ...video, title }),
      ).toThrow();
    expect(() =>
      reviewedMatch(review, show, episode, { ...video, title: episode.title, duration: 4003 }),
    ).toThrow();
    expect(() =>
      reviewedMatch(review, show, episode, {
        ...video,
        title: episode.title,
        upload_date: '20250101',
      }),
    ).toThrow();
  });
  it('requires supporting guest, duration, date and public-channel evidence', () => {
    expect(reviewedMatch(pair, show, episode, video).videoId).toBe(video.id);
    for (const patch of [
      { channel_id: 'another-channel' },
      { availability: 'private' },
      { duration: 4200 },
      { upload_date: '20260101' },
      { upload_date: 'invalid' },
      { title: 'Different guest entirely' },
      { live_status: 'is_upcoming' },
    ])
      expect(() => reviewedMatch(pair, show, episode, { ...video, ...patch })).toThrow();
    expect(() => reviewedMatch({ ...pair, rationale: '' }, show, episode, video)).toThrow();
    expect(() =>
      reviewedMatch(pair, show, { ...episode, episodeType: 'trailer' }, video),
    ).toThrow();
  });
  it('handles Arabic compound-name spacing without inventing a different guest', () => {
    const review = { ...pair, guest: 'عبدالعزيز الأسود' };
    expect(
      reviewedMatch(
        review,
        show,
        { ...episode, title: 'لقاء عبدالعزيز الأسود' },
        { ...video, title: 'لقاء عبد العزيز الاسود' },
      ).videoId,
    ).toBe(video.id);
    expect(() =>
      reviewedMatch(
        review,
        show,
        { ...episode, title: 'لقاء عبدالعزيز الأسود' },
        { ...video, title: 'لقاء عبد العزيز الاحمر' },
      ),
    ).toThrow();
  });
  it('rejects production credentials before any network request', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'mukhtalif-video-review-test-'));
    const env = path.join(dir, 'test.env');
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    try {
      await writeFile(
        env,
        'SUPABASE_URL=https://pacpdxvujkjvnaeeuute.supabase.co\nSUPABASE_SERVICE_ROLE_KEY=test-only\n',
        { mode: 0o600 },
      );
      await expect(
        applyVerifiedMatches([], env, path.join(dir, 'result.json'), 'a'.repeat(64)),
      ).rejects.toThrow('pinned development');
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      fetchMock.mockRestore();
      await rm(dir, { recursive: true });
    }
  });
  it('preserves a video already assigned to another database row', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'mukhtalif-video-review-test-'));
    const env = path.join(dir, 'test.env');
    const output = path.join(dir, 'result.json');
    const row = {
      id: episode.id,
      show_id: show.id,
      rss_guid: episode.guid,
      title_ar: episode.title,
      duration_sec: episode.durationSec,
      premium: false,
      youtube_video_id: null,
    };
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify([row, { ...row, id: 'ep-someone-else', youtube_video_id: video.id }]),
          { status: 200 },
        ),
      );
    try {
      await writeFile(
        env,
        'SUPABASE_URL=https://acomtixjibgkauzeltsn.supabase.co\nSUPABASE_SERVICE_ROLE_KEY=test-only\n',
        { mode: 0o600 },
      );
      await applyVerifiedMatches(
        [reviewedMatch(pair, show, episode, video)],
        env,
        output,
        'a'.repeat(64),
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(JSON.parse(await readFile(output, 'utf8'))).toMatchObject({
        linked: [],
        conflicts: [episode.id],
        complete: true,
      });
    } finally {
      fetchMock.mockRestore();
      await rm(dir, { recursive: true });
    }
  });
});
