import { PlayerProvider } from '@/components/player';
import { anonymousCustomerFixture } from '@/test/customer-fixture';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockGetHomeSummary } = vi.hoisted(() => ({
  mockGetHomeSummary: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  ApiUnavailableError: class ApiUnavailableError extends Error {},
  getHomeSummary: mockGetHomeSummary,
}));

vi.mock('@/lib/config', () => ({
  apiOrigin: () => 'https://api.test',
  publicEpisodeAudioSrc: (id: string) => 'https://api.test/episodes/' + id + '/audio',
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('HomePage weekly episodes placement', () => {
  it('places the weekly episodes section directly after the hero', async () => {
    vi.stubGlobal('React', React);
    mockGetHomeSummary.mockResolvedValue({
      asOf: '2026-09-02T12:00:00.000Z',
      shows: [],
      latestEpisodes: [],
      weeklyEpisodes: {
        title: 'حلقات آخر أسبوع من مختلف',
        windowDays: 7,
        episodes: [
          {
            id: 'ep-weekly',
            showId: 'show-1',
            showTitleAr: 'بترولي',
            titleAr: 'حلقة هذا الأسبوع',
            showNotesAr: '',
            durationSec: 2_400,
            episodeNumber: 8,
            premium: false,
            publishAt: '2026-09-01T12:00:00.000Z',
          },
        ],
      },
      latestArticles: [],
    });

    const { default: HomePage } = await import('./page');
    const html = renderToStaticMarkup(
      React.createElement(PlayerProvider, { children: await HomePage() }),
    );
    const heroEnd = html.indexOf('</section>');
    const weeklyStart = html.indexOf('<section class="content-section weekly-episodes"');

    expect(heroEnd).toBeGreaterThan(-1);
    expect(weeklyStart).toBe(heroEnd + '</section>'.length);
    expect(html).not.toContain('لا يوجد محتوى منشور بعد');
    expect(html).toContain('حلقة هذا الأسبوع · بترولي');
    expect(html.match(/class="newsletter-signup"/g)).toHaveLength(1);
  });

  it('keeps the newsletter on an empty home page and out of the shared footer', async () => {
    vi.stubGlobal('React', React);
    mockGetHomeSummary.mockResolvedValue({ shows: [], latestEpisodes: [], latestArticles: [] });
    const { default: HomePage } = await import('./page');
    const { SiteFooter } = await import('@/components/site-chrome');
    expect(
      renderToStaticMarkup(React.createElement(PlayerProvider, { children: await HomePage() })),
    ).toContain('newsletter-signup__form');
    expect(renderToStaticMarkup(React.createElement(SiteFooter))).not.toContain(
      'newsletter-signup',
    );
  });
});

vi.mock('@/components/customer-provider', () => ({ useCustomer: () => anonymousCustomerFixture }));
