import { PlayerProvider } from '@/components/player';
import { anonymousCustomerFixture } from '@/test/customer-fixture';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => vi.unstubAllGlobals());

describe('WeeklyEpisodeCard', () => {
  it('links to the episode and renders its programme and publication details', async () => {
    vi.stubGlobal('React', React);
    const { WeeklyEpisodeCard } = await import('./weekly-episodes');
    const html = renderToStaticMarkup(
      React.createElement(PlayerProvider, {
        children: React.createElement(WeeklyEpisodeCard, {
          episode: {
            id: 'ep/recent',
            showId: 'show-1',
            showTitleAr: 'بترولي',
            titleAr: 'حلقة هذا الأسبوع',
            showNotesAr: '',
            durationSec: 3_120,
            episodeNumber: 14,
            premium: false,
            publishAt: '2026-09-01T09:00:00.000Z',
          },
        }),
      }),
    );

    expect(html).toContain('href="/episodes/ep%2Frecent"');
    expect(html).toContain('بترولي');
    expect(html).toContain('حلقة هذا الأسبوع');
    expect(html).toContain('الحلقة 14');
    expect(html).toContain('dateTime="2026-09-01T09:00:00.000Z">');
    expect(html).not.toMatch(/audio(?:Key|Url|Src)/);
    expect(html).not.toContain('aria-label="تشغيل حلقة حصرية"');
  });

  it('labels premium episodes without exposing a playback control', async () => {
    vi.stubGlobal('React', React);
    const { WeeklyEpisodeCard } = await import('./weekly-episodes');
    const html = renderToStaticMarkup(
      React.createElement(PlayerProvider, {
        children: React.createElement(WeeklyEpisodeCard, {
          episode: {
            id: 'ep-premium',
            showId: 'show-2',
            showTitleAr: 'إذاعة مختلف',
            titleAr: 'حلقة حصرية',
            showNotesAr: '',
            durationSec: 1_800,
            episodeNumber: 2,
            premium: true,
            publishAt: '2026-09-02T09:00:00.000Z',
          },
        }),
      }),
    );

    expect(html).toContain('إذاعة مختلف');
    expect(html).toContain('حصرية');
    expect(html).not.toContain('<audio src=');
    expect(html).not.toContain('aria-label="تشغيل حلقة حصرية"');
  });
});

vi.mock('@/components/customer-provider', () => ({ useCustomer: () => anonymousCustomerFixture }));
