import type { Episode, Show } from '@mukhtalif/types';
import type * as Api from '@/lib/api';
import { PlayerProvider } from '@/components/player';
import { anonymousCustomerFixture } from '@/test/customer-fixture';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const show: Show = {
  id: 'show-petroly',
  slug: 'petroly',
  titleAr: 'بودكاست بترولي',
  descriptionAr: '',
  hostName: '',
  category: 'careers',
  premium: false,
  createdAt: '2020-01-01T00:00:00Z',
};
const episode = (overrides: Partial<Episode> = {}): Episode => ({
  id: 'ep-389',
  showId: show.id,
  titleAr: 'تجارة تفسير الأحلام',
  showNotesAr: 'هل تحولت الأحلام إلى تجارة؟\n\nحوار صريح عن الرؤى وتفسيرها.',
  youtubeVideoId: 'abcdefghijk',
  durationSec: 4860,
  episodeNumber: 389,
  premium: false,
  status: 'published',
  publishAt: '2026-09-03T12:00:00Z',
  createdAt: '2026-09-03T12:00:00Z',
  ...overrides,
});
let current = episode();

vi.mock('@/lib/config', () => ({
  apiOrigin: () => 'https://api.test',
  absoluteUrl: (path: string) => 'https://site.test' + path,
}));
vi.mock('@/components/customer-provider', () => ({ useCustomer: () => anonymousCustomerFixture }));
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof Api>()),
  getEpisode: async () => current,
  getShow: async () => show,
  listEpisodes: async () => ({
    items: [current, episode({ id: 'ep-388', episodeNumber: 388 })],
    pageInfo: { page: 1, perPage: 7, total: 2, totalPages: 1 },
  }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  current = episode();
});

async function renderEpisode() {
  vi.stubGlobal('React', React);
  const { default: EpisodePage } = await import('./page');
  const page = await EpisodePage({
    params: Promise.resolve({ id: current.id }),
    searchParams: Promise.resolve({}),
  });
  return renderToStaticMarkup(React.createElement(PlayerProvider, { children: page }));
}

describe('an episode page (D-24)', () => {
  it('stands on its programme cover with the video there from the start', async () => {
    const html = await renderEpisode();
    expect(html).toContain('--cover-ground:var(--mk-cover-petroly-ground)');
    expect(html).toContain('class="cover-page episode-page has-cross"');
    expect(html).toContain('href="/programmes/petroly">بترولي</a>');
    expect(html).toContain('الحلقة 389');
    // The video is embedded, not behind a reveal, and keeps its heading.
    expect(html).toContain('https://www.youtube-nocookie.com/embed/abcdefghijk');
    expect(html).toContain('مشاهدة الحلقة');
    expect(html).toContain('استمع الآن');
    // The first paragraph stands under the title; the rest is «عن الحلقة».
    expect(html.indexOf('هل تحولت الأحلام')).toBeLessThan(html.indexOf('id="episode-notes-title"'));
    expect(html.indexOf('حوار صريح')).toBeGreaterThan(html.indexOf('id="episode-notes-title"'));
    expect(html).toContain('href="/episodes/ep-388"');
  });

  it('separates its facts with space and icons, never with dots', async () => {
    const html = await renderEpisode();
    expect(html).not.toMatch(/[·•]/);
  });

  it('keeps a premium episode closed: no video, no player, a plain note', async () => {
    current = episode({ premium: true });
    const html = await renderEpisode();
    expect(html).not.toContain('youtube-nocookie.com');
    expect(html).not.toContain('استمع الآن');
    expect(html).not.toContain('has-cross');
    expect(html).toContain('حصرية للمشتركين');
  });
});
