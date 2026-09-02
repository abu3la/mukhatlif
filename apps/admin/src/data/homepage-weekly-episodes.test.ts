import { describe, expect, it } from 'vitest';
import { createFixtureAdminRepository } from './fixture-admin-repository';
import { createHonoAdminRepository } from './hono-admin-repository';

const SETTINGS = {
  enabled: true,
  title: 'حلقات آخر أسبوع من مختلف',
  windowDays: 7,
  version: 3,
  updatedAt: '2026-09-02T12:00:00.000Z',
};

const SHOW = {
  id: 'show-1',
  slug: 'show-one',
  titleAr: 'برنامج',
  descriptionAr: 'وصف',
  hostName: 'مضيف',
  category: 'حوار',
  premium: false,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const EPISODE = {
  id: 'episode-1',
  showId: 'show-1',
  titleAr: 'حلقة',
  showNotesAr: '',
  durationSec: 1_800,
  episodeNumber: 1,
  premium: false,
  status: 'published',
  publishAt: '2026-09-01T00:00:00.000Z',
  createdAt: '2026-08-31T00:00:00.000Z',
};

describe('homepage weekly episode settings repositories', () => {
  it('loads the settings as part of the Hono content workspace', async () => {
    const repository = createHonoAdminRepository({
      baseUrl: 'https://api.example.test',
      fetch: (async (input: RequestInfo | URL) => {
        const path = new URL(String(input)).pathname;
        if (path === '/studio/shows') return Response.json([SHOW]);
        if (path === '/studio/episodes') return Response.json([EPISODE]);
        if (path === '/studio/articles') return Response.json([]);
        if (path === '/studio/homepage/weekly-episodes') return Response.json(SETTINGS);
        return Response.json({ error: 'not found' }, { status: 404 });
      }) as typeof fetch,
    });

    await expect(repository.readContentWorkspace()).resolves.toMatchObject({
      homepageWeeklyEpisodesSettings: SETTINGS,
    });
  });

  it('sends the expected version and rejects malformed settings responses', async () => {
    let requestBody = '';
    const repository = createHonoAdminRepository({
      baseUrl: 'https://api.example.test',
      fetch: (async (_input: RequestInfo | URL, init?: RequestInit) => {
        requestBody = String(init?.body ?? '');
        return Response.json({ ...SETTINGS, windowDays: 30 });
      }) as typeof fetch,
    });

    await expect(
      repository.updateHomepageWeeklyEpisodesSettings({
        enabled: false,
        title: 'حصاد مختلف',
        expectedVersion: 3,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(JSON.parse(requestBody)).toEqual({
      enabled: false,
      title: 'حصاد مختلف',
      expectedVersion: 3,
    });
  });

  it('enforces optimistic concurrency in the fixture repository', async () => {
    const repository = createFixtureAdminRepository();
    const current = (await repository.readContentWorkspace())
      .homepageWeeklyEpisodesSettings;
    const updated = await repository.updateHomepageWeeklyEpisodesSettings({
      enabled: false,
      title: 'حصاد مختلف',
      expectedVersion: current.version,
    });
    expect(updated).toMatchObject({ enabled: false, version: current.version + 1 });

    await expect(
      repository.updateHomepageWeeklyEpisodesSettings({
        enabled: true,
        title: 'نسخة قديمة',
        expectedVersion: current.version,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
