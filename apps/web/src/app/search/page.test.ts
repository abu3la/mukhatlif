import type { Episode, PaginatedList, PublicGuest, PublishedArticle } from '@mukhtalif/types';
import type * as Api from '@/lib/api';
import { PlayerProvider } from '@/components/player';
import { anonymousCustomerFixture } from '@/test/customer-fixture';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const page = <T>(items: T[], total = items.length): PaginatedList<T> => ({
  items,
  pageInfo: {
    page: 1,
    perPage: 6,
    total,
    totalPages: Math.ceil(total / 6) || 1,
    hasNextPage: total > 6,
    hasPreviousPage: false,
  },
});
const guest = (id: string, name: string, role: string, city: string, episodeCount: number) =>
  ({ id, slug: id, name, role, city, bio: '', episodeCount }) satisfies PublicGuest;
let found = true;

vi.mock('@/lib/config', () => ({
  apiOrigin: () => 'https://api.test',
  absoluteUrl: (path: string) => 'https://site.test' + path,
}));
vi.mock('@/components/customer-provider', () => ({ useCustomer: () => anonymousCustomerFixture }));
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof Api>()),
  listShows: async () => [],
  listEpisodes: async () =>
    page<Episode>(
      found
        ? [
            {
              id: 'ep-1',
              showId: 'shw-petroly',
              titleAr: 'أسرار التسويق العقاري',
              showNotesAr: '',
              youtubeVideoId: 'abcdefghijk',
              durationSec: 4380,
              episodeNumber: 395,
              premium: false,
              status: 'published',
              publishAt: '2026-08-01T00:00:00Z',
              createdAt: '2026-08-01T00:00:00Z',
            },
          ]
        : [],
      found ? 10 : 0,
    ),
  listGuests: async () =>
    page(
      found
        ? [
            guest('g-1', 'إبراهيم عمر', 'مختص في التسويق', 'الرياض', 2),
            guest('g-2', 'رضوان الجلواح', '', '', 1),
          ]
        : [],
    ),
  listArticles: async () =>
    page<PublishedArticle>(
      found
        ? [
            {
              id: 'art-1',
              slug: 'marketing',
              titleAr: 'هل نحن ضحايا التسويق؟',
              excerptAr: '',
              coverUrl: 'https://cdn.test/cover.jpg',
              publishedAt: '2025-07-26T00:00:00Z',
              author: { displayName: 'فاطمة' },
            } as PublishedArticle,
          ]
        : [],
    ),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  found = true;
});

async function render(searchParams: Record<string, string> = {}) {
  vi.stubGlobal('React', React);
  const { default: SearchPage } = await import('./page');
  const view = await SearchPage({ searchParams: Promise.resolve(searchParams) });
  return renderToStaticMarkup(React.createElement(PlayerProvider, { children: view }));
}

describe('search on the presentation site (D-24)', () => {
  it('asks the question on the stage and offers topics before a search', async () => {
    const html = await render();
    expect(html).toContain('class="stage-page search-page"');
    expect(html).toContain('ما الذي يشغلك؟');
    expect(html).toContain('ابدأ بموضوع');
    expect(html).toContain('href="/search?q=%D8%A7%D9%84%D9%85%D9%87%D9%86"');
    expect(html).not.toContain('search-kinds');
  });

  it('counts each kind at the stage edge and answers by kind on the sheet', async () => {
    const html = await render({ q: 'التسويق' });
    // 10 episodes, one programme (وكالة), 2 guests and 1 article.
    expect(html).toContain('14 نتيجة للبحث عن «التسويق»');
    expect(html).toMatch(/aria-current="page"[^>]*>الكل<bdi>14<\/bdi>/);
    expect(html).toContain('الحلقات<bdi>10</bdi>');
    expect(html).toContain('href="/programmes/wakala"');
    expect(html).toContain(
      'href="/episodes?search=%D8%A7%D9%84%D8%AA%D8%B3%D9%88%D9%8A%D9%82#all"',
    );
    // Guests by name: what they do keeps its slot when it is missing.
    expect(html).toContain('مختص في التسويق، الرياض');
    expect(html).toContain('حلقتان');
    expect(html).toContain('class="search-guest__role" aria-hidden="true"');
    expect(html).toContain('هل نحن ضحايا التسويق؟');
    expect(html).not.toMatch(/[·•]/);
  });

  it('mutes a kind with nothing in it and shows that kind alone when chosen', async () => {
    // No programme is called «qqq»; the mocked catalogue answers anyway.
    const html = await render({ q: 'qqq', type: 'guests' });
    expect(html).toMatch(/data-empty="true"[^>]*>البرامج<bdi>0<\/bdi>/);
    expect(html).toContain('نتيجتان للبحث عن «qqq»');
    expect(html).toContain('<input type="hidden" name="type" value="guests"/>');
    expect(html).toContain('id="search-guests"');
    expect(html).not.toContain('id="search-episodes"');
  });

  it('says plainly when nothing was found, without empty kinds', async () => {
    found = false;
    const html = await render({ q: 'zqxw' });
    expect(html).toContain('لا نتائج للبحث عن «zqxw»');
    expect(html).toContain('لم نجد نتائج لـ«zqxw»');
    expect(html).not.toContain('search-kinds');
  });
});
