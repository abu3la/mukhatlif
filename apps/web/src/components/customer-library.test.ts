// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CustomerLibrary, Episode, PublishedArticle, Show } from '@mukhtalif/types';
import { emptyCustomerLibrary } from '@/lib/customer-utils';

const fake = vi.hoisted(() => ({
  customer: null as unknown as Record<string, unknown>,
  episodes: [] as Episode[],
  shows: [] as Show[],
  replace: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: fake.replace }) }));
vi.mock('./customer-provider', () => ({ useCustomer: () => fake.customer }));
vi.mock('./player', async () => {
  const { createElement: h } = await import('react');
  return {
    usePlayer: () => ({ toggle: vi.fn() }),
    PlayEpisodeButton: ({ idleLabel = 'استمع الآن', initialSeconds = 0 }) =>
      h('button', { 'data-from': initialSeconds }, idleLabel),
  };
});
vi.mock('./episode-library-actions', () => ({
  EpisodeLibraryActions: () => null,
  EpisodeProgress: () => null,
}));
vi.mock('./public-content-controls', () => ({ RailControls: () => null }));
vi.mock('./customer-content', () => ({
  useCustomerEpisodes: (ids: string[]) => ({
    episodes: fake.episodes.filter((episode) => ids.includes(episode.id)),
    shows: fake.shows,
    unavailable: [],
    error: '',
    loading: false,
  }),
  customerPlayerEpisode: (episode: Episode) => ({ id: episode.id, title: episode.titleAr }),
  CustomerEpisodeList: () => null,
  CustomerEpisodeRow: () => null,
}));

import { CustomerLibraryPage } from './customer-library';

const show = (id: string, slug: string, titleAr: string): Show => ({
  id,
  slug,
  titleAr,
  descriptionAr: '',
  hostName: '',
  category: 'careers',
  premium: false,
  createdAt: '2020-01-01T00:00:00Z',
});
const episode = (id: string, showId: string, episodeNumber: number, durationSec: number) =>
  ({
    id,
    showId,
    titleAr: `حلقة ${episodeNumber}`,
    showNotesAr: '',
    youtubeVideoId: `video${String(episodeNumber).padStart(6, '0')}`,
    durationSec,
    episodeNumber,
    premium: false,
    status: 'published',
    publishAt: '2026-09-01T00:00:00Z',
    createdAt: '2026-09-01T00:00:00Z',
  }) as Episode;
const article = {
  id: 'art-1',
  slug: 'leader',
  titleAr: 'لماذا العربي أفضل قائد في العالم؟',
  coverUrl: 'https://cdn.test/leader.jpg',
  publishedAt: '2026-07-25T00:00:00Z',
  author: { displayName: 'ابراهيم' },
} as PublishedArticle;

const sample = (): CustomerLibrary => ({
  ...emptyCustomerLibrary(),
  savedEpisodeIds: ['m-57', 'p-389'],
  savedArticleIds: ['art-1'],
  followedShowIds: ['shw-petroly', 'shw-munawib'],
  playlists: [
    {
      id: 'pl-road',
      name: 'للطريق',
      description: '',
      episodeIds: ['p-387', 'p-386', 'm-57', 'p-389', 'p-388'],
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-02T00:00:00Z',
    },
    {
      id: 'pl-one',
      name: 'للأحد',
      description: '',
      episodeIds: ['m-57'],
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-02T00:00:00Z',
    },
  ],
  bookmarks: [
    {
      id: 'bm-1',
      episodeId: 'p-387',
      positionSec: 2052,
      label: 'لماذا يكون السعر الأقل فخًّا',
      createdAt: '2026-09-03T00:00:00Z',
    },
  ],
  progress: [
    // Finished: skipped for the one the listener stopped in.
    { userId: 'u', episodeId: 'p-386', positionSec: 4210, updatedAt: '2026-09-05T00:00:00Z' },
    { userId: 'u', episodeId: 'p-388', positionSec: 4350, updatedAt: '2026-09-04T00:00:00Z' },
  ],
});

let root: Root;
let container: HTMLDivElement;
async function mount(tab?: string) {
  await act(async () => root.render(createElement(CustomerLibraryPage, { tab })));
  // Let the shows and saved articles resolve.
  await act(async () => undefined);
}
function signedIn(library: CustomerLibrary) {
  fake.customer = {
    user: { id: 'u', email: 'listener@example.com' },
    profile: { id: 'u', onboarded: true },
    loading: false,
    error: null,
    library,
    config: { apiOrigin: 'https://api.test', supabaseUrl: '', supabaseAnonKey: '' },
    publicRead: async (path: string) => (path === '/shows' ? fake.shows : article),
    notify: vi.fn(),
    refresh: vi.fn(),
    mutateLibrary: vi.fn(),
    toggleSaved: vi.fn(),
    toggleFollow: vi.fn(),
  };
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  fake.shows = [
    show('shw-petroly', 'petroly', 'بودكاست بترولي'),
    show('shw-munawib', 'munawib', 'مناوب'),
  ];
  fake.episodes = [
    episode('p-389', 'shw-petroly', 389, 4854),
    episode('p-388', 'shw-petroly', 388, 10197),
    episode('p-387', 'shw-petroly', 387, 9309),
    episode('p-386', 'shw-petroly', 386, 4212),
    episode('m-57', 'shw-munawib', 57, 5554),
  ];
  signedIn(sample());
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  fake.replace.mockReset();
});

describe('«مكتبتي» (D-24)', () => {
  it('crosses the episode the listener stopped in, with how far they got', async () => {
    await mount();
    expect(container.querySelector('h1')?.textContent).toBe('مكتبتي');
    expect(container.querySelector('.library-page.has-cross')).not.toBeNull();
    const done = container.querySelector<HTMLElement>('.library-resume__done');
    expect(parseFloat(done!.style.width)).toBeCloseTo((4350 / 10197) * 100, 1);
    const where = container.querySelector('.library-resume__where')?.textContent;
    expect(where).toBe('بترولي، الحلقة 388. وصلت إلى 1:12:30 وبقي 1 س 37 د');
    expect(container.querySelector('#library-resume')?.textContent).toBe('حلقة 388');
    expect(container.textContent).toContain('أكمل الاستماع');
  });

  it('shows what was saved, followed, collected and marked', async () => {
    await mount();
    expect(container.querySelectorAll('#library-saved-rail .handoff-episode-card')).toHaveLength(2);
    const follows = [...container.querySelectorAll('.library-follow__name')].map(
      (x) => x.textContent,
    );
    expect(follows).toEqual(['بترولي', 'مناوب']);
    const lists = container.querySelectorAll('.library-list');
    expect(lists[0].querySelectorAll('.library-list__art--four img')).toHaveLength(4);
    expect(lists[0].querySelector('.library-list__count')?.textContent).toBe('5 حلقات');
    expect(lists[1].querySelectorAll('img')).toHaveLength(1);
    const moment = container.querySelector('.library-moment');
    expect(moment?.querySelector('.library-moment__at')?.textContent).toBe('34:12');
    expect(moment?.textContent).toContain('بترولي، الحلقة 387: حلقة 387');
    expect(moment?.querySelector('button')?.getAttribute('data-from')).toBe('2052');
    expect(moment?.querySelector('button')?.textContent).toBe('استمع من هنا');
    expect(container.querySelector('.article-tile__title')?.textContent).toBe(article.titleAr);
    const links = [...container.querySelectorAll('.library-more a')].map((a) =>
      a.getAttribute('href'),
    );
    expect(links).toEqual([
      '/library?tab=history',
      '/library?tab=interests',
      '/library/courses',
      '/account',
    ]);
  });

  it('invites a first save when the library is empty, and keeps playlists', async () => {
    signedIn(emptyCustomerLibrary());
    await mount();
    expect(container.querySelector('.library-page.has-cross')).toBeNull();
    expect(container.querySelector('#library-start')?.textContent).toBe('لم تحفظ شيئًا بعد');
    expect(container.querySelector('#library-saved')).toBeNull();
    expect(container.querySelector('#library-lists')).not.toBeNull();
    expect(container.textContent).toContain('قائمة جديدة');
  });

  it('opens each full list under the same stage', async () => {
    await mount('history');
    expect(container.querySelector('h1')?.textContent).toBe('سجل الاستماع');
    expect(container.querySelector('.stage-head__crumbs a')?.getAttribute('href')).toBe('/library');
    expect(container.querySelector('.library-view')).not.toBeNull();
  });

  it('asks a signed-out visitor to sign in, on the sheet', async () => {
    fake.customer = { ...fake.customer, user: null, profile: null };
    await mount();
    expect(container.querySelector('h1')?.textContent).toBe('مكتبتي');
    expect(container.querySelector('.customer-empty h2')?.textContent).toBe(
      'تسجيل الدخول إلى المكتبة',
    );
    expect(fake.replace).toHaveBeenCalledWith(expect.stringMatching(/^\/login\?next=/));
  });
});
