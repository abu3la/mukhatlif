import { describe, expect, it } from 'vitest';
import type { Episode, PaginatedList, Show, StudioSummary } from '@mukhtalif/types';
import { escapeSearchPattern } from './repo/list-query';
import type { Env } from './env';
import app from './index';

const localEnv: Env = {
  APP_ENV: 'development',
  ALLOW_DEV_AUTH: 'true',
  CORS_ALLOWED_ORIGINS: 'http://localhost:3001',
};

function request(path: string, identityId?: string) {
  const headers = new Headers();
  if (identityId) headers.set('x-dev-user', identityId);
  return app.request(path, { headers }, localEnv);
}

describe('opt-in list paging', () => {
  it('returns a bare array when neither page nor perPage is supplied', async () => {
    const shows = await (await request('/shows', 'usr-admin-1')).json();
    expect(Array.isArray(shows)).toBe(true);
  });

  it('returns the envelope as soon as one paging parameter is supplied', async () => {
    const page = (await (await request('/shows?perPage=2', 'usr-admin-1')).json()) as PaginatedList<Show>;
    expect(page.items.length).toBeLessThanOrEqual(2);
    expect(page.pageInfo).toMatchObject({ page: 1, perPage: 2, hasPreviousPage: false });
    expect(page.pageInfo.total).toBeGreaterThan(page.items.length - 1);
  });

  it('keeps search available in the legacy array mode without changing the shape', async () => {
    const result = await (await request('/shows?search=zzzznomatch', 'usr-admin-1')).json();
    // Search alone never switches the response shape.
    expect(Array.isArray(result)).toBe(true);
  });

  it('walks pages without repeating or dropping a record', async () => {
    const all = (await (await request('/episodes', 'usr-admin-1')).json()) as Episode[];
    const collected: string[] = [];
    let page = 1;
    for (;;) {
      const response = (await (
        await request(`/episodes?page=${page}&perPage=2`, 'usr-admin-1')
      ).json()) as PaginatedList<Episode>;
      collected.push(...response.items.map((episode) => episode.id));
      expect(response.pageInfo.total).toBe(all.length);
      if (!response.pageInfo.hasNextPage) break;
      page += 1;
    }
    expect(new Set(collected).size).toBe(all.length);
  });

  it('reports an empty last page consistently when the page is past the end', async () => {
    const page = (await (
      await request('/shows?page=9999&perPage=5', 'usr-admin-1')
    ).json()) as PaginatedList<Show>;
    expect(page.items).toEqual([]);
    expect(page.pageInfo.hasNextPage).toBe(false);
    expect(page.pageInfo.hasPreviousPage).toBe(true);
  });

  it('rejects a page size beyond the documented maximum and a non-positive page', async () => {
    expect((await request('/shows?perPage=101', 'usr-admin-1')).status).toBe(400);
    expect((await request('/shows?page=0', 'usr-admin-1')).status).toBe(400);
    expect((await request('/shows?page=abc', 'usr-admin-1')).status).toBe(400);
  });

  it('never lets an unauthenticated caller page past the published catalogue', async () => {
    const page = (await (
      await request('/episodes?page=1&perPage=100')
    ).json()) as PaginatedList<Episode>;
    expect(page.items.every((episode) => episode.status === 'published')).toBe(true);
  });
});

describe('search term escaping', () => {
  it('neutralizes PostgREST filter separators so a term cannot add clauses', () => {
    expect(escapeSearchPattern('a,b(c)"d*')).toBe('a b c  d');
    expect(escapeSearchPattern('50%_off')).toBe('50\\%\\_off');
    expect(escapeSearchPattern('back\\slash')).toBe('back\\\\slash');
  });
});

describe('studio summary', () => {
  it('requires authentication', async () => {
    expect((await request('/studio/summary')).status).toBe(401);
  });

  it('gives an administrator every section', async () => {
    const summary = (await (await request('/studio/summary', 'usr-admin-1')).json()) as StudioSummary;
    expect(summary.asOf).toEqual(expect.any(String));
    expect(summary.content?.episodes.total).toBeGreaterThan(0);
    expect(summary.content?.shows).toBeGreaterThan(0);
    expect(summary.audience?.users).toBeGreaterThan(0);
    expect(summary.audience?.monthlyRecurringRevenueMinor).toBeGreaterThan(0);
    expect(summary.recentEpisodes?.length).toBeGreaterThan(0);
    expect(summary.recentArticles?.length).toBeGreaterThan(0);
  });

  it('omits the audience section for an editor rather than reporting zeros', async () => {
    const summary = (await (
      await request('/studio/summary', 'usr-editor-1')
    ).json()) as StudioSummary;
    expect(summary.audience).toBeUndefined();
    expect(summary.content).toBeDefined();
    expect(summary.recentEpisodes).toBeDefined();
  });

  it('never exposes article source or newsletter state in the recent list', async () => {
    const summary = (await (await request('/studio/summary', 'usr-admin-1')).json()) as StudioSummary;
    for (const article of summary.recentArticles ?? []) {
      expect(article).not.toHaveProperty('content');
      expect(article).not.toHaveProperty('newsletter');
      expect(article).not.toHaveProperty('contentHtml');
    }
  });

  it('caps the recent lists at five records', async () => {
    const summary = (await (await request('/studio/summary', 'usr-admin-1')).json()) as StudioSummary;
    expect(summary.recentEpisodes?.length).toBeLessThanOrEqual(5);
    expect(summary.recentArticles?.length).toBeLessThanOrEqual(5);
  });
});
