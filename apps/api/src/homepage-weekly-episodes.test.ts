import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_HOMEPAGE_WEEKLY_EPISODES_TITLE,
  type HomeSummary,
  type HomepageWeeklyEpisodesSettings,
} from '@mukhtalif/types';
import type { Env } from './env';
import app from './index';
import { createMemoryRepository } from './repo/memory';

const env: Env = {
  APP_ENV: 'development',
  ALLOW_DEV_AUTH: 'true',
  CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
};
const jsonHeaders = { 'Content-Type': 'application/json' };

function request(path: string, userId?: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (userId) headers.set('x-dev-user', userId);
  return app.request(path, { ...init, headers }, env);
}

describe.sequential('homepage weekly episode section', () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-02T12:00:00.000Z'));
  });

  afterAll(async () => {
    const repository = createMemoryRepository();
    const current = await repository.getHomepageWeeklyEpisodesSettings();
    await repository.updateHomepageWeeklyEpisodesSettings({
      enabled: true,
      title: DEFAULT_HOMEPAGE_WEEKLY_EPISODES_TITLE,
      expectedVersion: current.version,
    });
    vi.useRealTimers();
  });

  it('requires show permissions and rejects a stale Studio update', async () => {
    expect((await request('/studio/homepage/weekly-episodes')).status).toBe(401);
    expect(
      (await request('/studio/homepage/weekly-episodes', 'usr-listener-1')).status,
    ).toBe(403);

    const currentResponse = await request(
      '/studio/homepage/weekly-episodes',
      'usr-editor-1',
    );
    const current = (await currentResponse.json()) as HomepageWeeklyEpisodesSettings;
    expect(current).toMatchObject({
      enabled: true,
      title: 'حلقات آخر أسبوع من مختلف',
      windowDays: 7,
      version: 1,
    });

    const update = await request('/studio/homepage/weekly-episodes', 'usr-editor-1', {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify({
        enabled: true,
        title: '  حصاد الأسبوع  ',
        expectedVersion: current.version,
      }),
    });
    expect(update.status).toBe(200);
    expect(await update.json()).toMatchObject({ title: 'حصاد الأسبوع', version: 2 });

    const stale = await request('/studio/homepage/weekly-episodes', 'usr-editor-1', {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify({
        enabled: false,
        title: 'نسخة قديمة',
        expectedVersion: current.version,
      }),
    });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({
      code: 'VERSION_CONFLICT',
      current: { title: 'حصاد الأسبوع', version: 2 },
    });
  });

  it('returns all and only published episodes inside the trailing 7-day window', async () => {
    const repository = createMemoryRepository();
    const recent = await repository.createEpisode({
      showId: 'shw-petroly',
      titleAr: 'حلقة هذا الأسبوع',
      showNotesAr: '',
      durationSec: 1_800,
      episodeNumber: 90,
      premium: false,
    });
    const old = await repository.createEpisode({
      showId: 'shw-gilaf',
      titleAr: 'حلقة قديمة',
      showNotesAr: '',
      durationSec: 1_800,
      episodeNumber: 91,
      premium: false,
    });
    const future = await repository.createEpisode({
      showId: 'shw-shaqla',
      titleAr: 'حلقة مستقبلية',
      showNotesAr: '',
      durationSec: 1_800,
      episodeNumber: 92,
      premium: false,
    });
    await repository.updateEpisodeStatus(recent.id, 'published', '2026-09-01T09:00:00.000Z');
    await repository.updateEpisodeStatus(old.id, 'published', '2026-08-20T09:00:00.000Z');
    await repository.updateEpisodeStatus(future.id, 'published', '2026-09-03T09:00:00.000Z');

    const response = await request('/home');
    const summary = (await response.json()) as HomeSummary;
    expect(summary.weeklyEpisodes).toMatchObject({
      title: 'حصاد الأسبوع',
      windowDays: 7,
    });
    expect(summary.weeklyEpisodes?.episodes.map((episode) => episode.id)).toEqual([
      recent.id,
    ]);
    expect(summary.weeklyEpisodes?.episodes[0]?.showTitleAr).toBe('بترولي');
    expect(JSON.stringify(summary.weeklyEpisodes)).not.toMatch(/audio(?:Key|Url)/);
  });

  it('includes a show name even when that show falls outside the home show limit', async () => {
    const repository = createMemoryRepository();
    let thirteenthShowId = '';
    for (let index = 6; index <= 13; index += 1) {
      const show = await repository.createShow({
        slug: `weekly-show-${index}`,
        titleAr: `برنامج الأسبوع ${index}`,
        descriptionAr: 'برنامج تجريبي',
        hostName: 'فريق مختلف',
        category: 'حوار',
        premium: false,
      });
      thirteenthShowId = show.id;
    }
    const episode = await repository.createEpisode({
      showId: thirteenthShowId,
      titleAr: 'حلقة من برنامج خارج القائمة',
      showNotesAr: '',
      durationSec: 1_200,
      episodeNumber: 1,
      premium: false,
    });
    await repository.updateEpisodeStatus(episode.id, 'published', '2026-09-02T08:00:00.000Z');

    const summary = (await (await request('/home')).json()) as HomeSummary;
    expect(summary.shows).toHaveLength(12);
    expect(summary.shows.some((show) => show.id === thirteenthShowId)).toBe(false);
    expect(
      summary.weeklyEpisodes?.episodes.find((candidate) => candidate.id === episode.id),
    ).toMatchObject({ showTitleAr: 'برنامج الأسبوع 13' });
  });

  it('includes the exact 7-day boundary and orders timestamp ties by id', async () => {
    const repository = createMemoryRepository();
    const createPublished = async (title: string, publishAt: string) => {
      const episode = await repository.createEpisode({
        showId: 'shw-petroly',
        titleAr: title,
        showNotesAr: '',
        durationSec: 900,
        episodeNumber: 93,
        premium: false,
      });
      await repository.updateEpisodeStatus(episode.id, 'published', publishAt);
      return episode;
    };
    const boundary = await createPublished(
      'حلقة عند حد الأسبوع',
      '2026-08-26T12:00:00.000Z',
    );
    const tieA = await createPublished('حلقة متساوية أ', '2026-09-01T10:00:00.000Z');
    const tieB = await createPublished('حلقة متساوية ب', '2026-09-01T10:00:00.000Z');

    const summary = (await (await request('/home')).json()) as HomeSummary;
    expect(summary.weeklyEpisodes?.episodes.some(({ id }) => id === boundary.id)).toBe(true);
    const tieIds = new Set([tieA.id, tieB.id]);
    const actualTieOrder =
      summary.weeklyEpisodes?.episodes
        .map(({ id }) => id)
        .filter((id) => tieIds.has(id)) ?? [];
    expect(actualTieOrder).toEqual([tieA.id, tieB.id].sort((a, b) => a.localeCompare(b)));
  });

  it('returns null while the section is disabled even when recent episodes exist', async () => {
    const repository = createMemoryRepository();
    const current = await repository.getHomepageWeeklyEpisodesSettings();
    await repository.updateHomepageWeeklyEpisodesSettings({
      enabled: false,
      title: current.title,
      expectedVersion: current.version,
    });

    const summary = (await (await request('/home')).json()) as HomeSummary;
    expect(summary.weeklyEpisodes).toBeNull();
  });
});
