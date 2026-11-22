import type { Episode, PaginatedList, Show } from '@mukhtalif/types';
import type * as Api from '@/lib/api';
import { PlayerProvider } from '@/components/player';
import { anonymousCustomerFixture } from '@/test/customer-fixture';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const show = (id: string, slug: string, titleAr: string, artworkUrl?: string): Show => ({
  id,
  slug,
  titleAr,
  descriptionAr: '',
  hostName: '',
  artworkUrl,
  category: 'careers',
  premium: false,
  createdAt: '2020-01-01T00:00:00Z',
});
const shows = [
  show('shw-munawib', 'munawib', 'مناوب'),
  show('shw-petroly', 'petroly', 'بترولي'),
  show('shw-elsewhere', 'elsewhere', 'برنامج آخر', 'https://cdn.test/elsewhere.jpg'),
];
const episode = (
  showId: string,
  episodeNumber: number,
  overrides: Partial<Episode> = {},
): Episode => ({
  id: `${showId}-${episodeNumber}`,
  showId,
  titleAr: `حلقة ${episodeNumber}`,
  showNotesAr: '',
  youtubeVideoId: 'abcdefghijk',
  durationSec: 5311,
  episodeNumber,
  premium: false,
  status: 'published',
  publishAt: '2026-09-04T12:00:00Z',
  createdAt: '2026-09-04T12:00:00Z',
  ...overrides,
});
const list = (items: Episode[], total: number, perPage = 12): PaginatedList<Episode> => ({
  items,
  pageInfo: {
    page: 1,
    perPage,
    total,
    totalPages: Math.ceil(total / perPage),
    hasNextPage: total > perPage,
    hasPreviousPage: false,
  },
});
const calls: Parameters<typeof Api.listEpisodes>[0][] = [];

vi.mock('@/lib/config', () => ({
  apiOrigin: () => 'https://api.test',
  absoluteUrl: (path: string) => 'https://site.test' + path,
}));
vi.mock('@/components/customer-provider', () => ({ useCustomer: () => anonymousCustomerFixture }));
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof Api>()),
  listShows: async () => shows,
  listEpisodes: async (options: Parameters<typeof Api.listEpisodes>[0]) => {
    calls.push(options);
    if (options.perPage === 1) return list([episode('shw-munawib', 58)], 847, 1);
    if (options.showId === 'shw-petroly')
      return list(
        [389, 388, 387, 386, 385, 384, 383, 382].map((n) => episode('shw-petroly', n)),
        8,
      );
    if (options.search) return list([episode('shw-petroly', 337), episode('shw-munawib', 40)], 10);
    return list(
      [58, 57, 56, 55, 54, 53, 52, 51, 50, 49, 48, 47].map((n) => episode('shw-munawib', n)),
      847,
    );
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  calls.length = 0;
});

/** The whole opening tag of the link to `href`, whatever its attribute order. */
const anchor = (html: string, href: string) =>
  html.match(new RegExp(`<a[^>]*href="${href.replace(/[?#&]/g, (c) => '\\' + c)}"[^>]*>`))?.[0] ??
  '';

async function render(searchParams: Record<string, string> = {}) {
  vi.stubGlobal('React', React);
  const { default: EpisodesPage } = await import('./page');
  const page = await EpisodesPage({ searchParams: Promise.resolve(searchParams) });
  return renderToStaticMarkup(React.createElement(PlayerProvider, { children: page }));
}

describe('«استمع», the episodes index (D-24)', () => {
  it('crosses the newest episode onto the sheet and lists the whole catalogue', async () => {
    const html = await render();
    expect(html).toContain('class="stage-page listen-page has-cross"');
    expect(html).toContain('847 حلقة من ثلاثة برامج.');
    expect(html).toContain('https://i.ytimg.com/vi/abcdefghijk/maxresdefault.jpg');
    expect(html).toContain('href="/programmes/munawib">مناوب</a>');
    expect(html).toContain('الحلقة 58');
    expect(html).toContain('استمع الآن');
    // Every programme is a choice that reloads the list where it stands.
    expect(anchor(html, '/episodes#all')).toContain('aria-current="true"');
    expect(html).toContain('href="/episodes?showId=shw-petroly#all"');
    expect(html).toContain('src="/communities/programmes/petroly.jpg"');
    expect(html).toContain('src="https://cdn.test/elsewhere.jpg"');
    expect(html).toContain('href="/episodes?sort=shortest#all"');
    expect(html).toContain('<p class="listen-count">847 حلقة</p>');
    expect(html.match(/class="handoff-episode-card"/g)).toHaveLength(12);
    expect(html).toContain('href="/episodes?page=2#all"');
    expect(html).not.toMatch(/[·•]/);
    // One request: the list's own total is the catalogue's.
    expect(calls).toHaveLength(1);
  });

  it('keeps the chosen programme, its newest episode and the catalogue count', async () => {
    const html = await render({ showId: 'shw-petroly' });
    expect(anchor(html, '/episodes?showId=shw-petroly#all')).toContain('aria-current="true"');
    expect(anchor(html, '/episodes#all')).not.toContain('aria-current');
    expect(html).toContain('href="/programmes/petroly">بترولي</a>');
    expect(html).toContain('الحلقة 389');
    expect(html).toContain('847 حلقة من ثلاثة برامج.');
    expect(html).toContain('<p class="listen-count">ثماني حلقات</p>');
    expect(html).toContain('href="/episodes?showId=shw-petroly&amp;sort=longest#all"');
    expect(html).toContain('<input type="hidden" name="showId" value="shw-petroly"/>');
    expect(calls.some((options) => options.perPage === 1)).toBe(true);
  });

  it('shows a search as the list alone, with a way back', async () => {
    const html = await render({ search: 'التسويق' });
    expect(html).toContain('class="stage-page listen-page"');
    expect(html).not.toContain('featured-title');
    expect(html).toContain('عشر حلقات للبحث عن «التسويق»');
    expect(html).toContain('href="/episodes#all">مسح البحث</a>');
    expect(html).toContain('action="/episodes#all"');
  });
});
