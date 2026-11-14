import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  listShows: vi.fn(),
  listEpisodes: vi.fn(),
  listArticles: vi.fn(),
  listGuests: vi.fn(),
  listCourses: vi.fn(),
}));
vi.mock('./api', () => api);

import robots, { PRIVATE_PATHS } from '../app/robots';
import sitemap, { STATIC_PATHS } from '../app/sitemap';
import nextConfig from '../../next.config';

const page = <T>(items: T[], pageNumber = 1, totalPages = 1) => ({
  items,
  pageInfo: {
    page: pageNumber,
    perPage: 100,
    total: items.length,
    totalPages,
    hasNextPage: pageNumber < totalPages,
    hasPreviousPage: pageNumber > 1,
  },
});

const original = { ...process.env };
afterEach(() => {
  process.env = { ...original };
});

describe('robots.txt', () => {
  it('keeps staging and previews out of every crawler', () => {
    process.env.PUBLIC_WEB_URL = 'https://staging.mukhtalif.net';
    expect(robots()).toEqual({ rules: { userAgent: '*', disallow: '/' } });
  });

  it('opens the final host, closes account pages and points to the sitemap', () => {
    process.env.PUBLIC_WEB_URL = 'https://mukhtalif.net';
    const result = robots();
    expect(result.rules).toEqual({ userAgent: '*', allow: '/', disallow: PRIVATE_PATHS });
    expect(result.sitemap).toBe('https://mukhtalif.net/sitemap.xml');
    for (const path of ['/articles', '/shows', '/episodes', '/guests', '/courses']) {
      expect(PRIVATE_PATHS).not.toContain(path);
    }
  });
});

describe('sitemap.xml', () => {
  beforeEach(() => {
    process.env.PUBLIC_WEB_URL = 'https://mukhtalif.net';
    api.listShows.mockResolvedValue([{ slug: 'petroly' }]);
    api.listEpisodes.mockImplementation(async ({ page: n }: { page: number }) =>
      page([{ id: `ep-${n}`, publishAt: '2026-11-01T10:00:00.000Z' }], n, 2),
    );
    api.listArticles.mockResolvedValue(
      page([
        { slug: '12fdk', updatedAt: '2026-10-01T00:00:00.000Z', seo: {} },
        { slug: 'copy', updatedAt: null, seo: { canonicalUrl: 'https://example.com/a' } },
      ]),
    );
    api.listGuests.mockResolvedValue(page([{ slug: 'guest-1' }]));
    api.listCourses.mockResolvedValue([{ id: 'c-1' }]);
  });

  it('lists every public page once, on the configured host, across all pages of a list', async () => {
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls).toEqual(
      expect.arrayContaining([
        'https://mukhtalif.net/',
        'https://mukhtalif.net/shows/petroly',
        'https://mukhtalif.net/episodes/ep-1',
        'https://mukhtalif.net/episodes/ep-2',
        'https://mukhtalif.net/articles/12fdk',
        'https://mukhtalif.net/guests/guest-1',
        'https://mukhtalif.net/courses/c-1',
        'https://mukhtalif.net/communities/idhaa',
        'https://mukhtalif.net/presenters/ahmed-attar',
        'https://mukhtalif.net/newsletters/amyal',
      ]),
    );
    expect(new Set(urls).size).toBe(urls.length);
    expect(api.listEpisodes).toHaveBeenCalledTimes(2);
  });

  it('leaves out articles that name another canonical page, and account pages', async () => {
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls).not.toContain('https://mukhtalif.net/articles/copy');
    for (const path of PRIVATE_PATHS) expect(STATIC_PATHS).not.toContain(path);
  });

  it('dates episodes and articles', async () => {
    const entries = await sitemap();
    expect(entries.find((e) => e.url.endsWith('/episodes/ep-1'))?.lastModified).toEqual(
      new Date('2026-11-01T10:00:00.000Z'),
    );
    expect(entries.find((e) => e.url.endsWith('/articles/12fdk'))?.lastModified).toEqual(
      new Date('2026-10-01T00:00:00.000Z'),
    );
  });
});

describe('trailing slashes', () => {
  it('normalises only the app’s own sections, so old links reach the legacy route', async () => {
    expect(nextConfig.skipTrailingSlashRedirect).toBe(true);
    const [rule] = (await nextConfig.redirects!()) as { source: string; destination: string }[];
    const sections = rule.source.match(/\(([^)]+)\)/)![1].split('|');
    expect(sections).toEqual(expect.arrayContaining(['articles', 'shows', 'episodes', 'about']));
    expect(sections).not.toContain('petroly');
    expect(rule.destination).toBe('/:segment/:rest*');
  });
});
