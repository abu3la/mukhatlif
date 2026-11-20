import { PlayerProvider } from '@/components/player';
import { COMMUNITIES } from '@/lib/communities';
import { anonymousCustomerFixture } from '@/test/customer-fixture';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/config', () => ({
  apiOrigin: () => 'https://api.test',
  publicEpisodeAudioSrc: (id: string) => 'https://api.test/episodes/' + id + '/audio',
}));
vi.mock('@/components/customer-provider', () => ({ useCustomer: () => anonymousCustomerFixture }));
vi.mock('@/lib/community-episodes', () => ({
  latestEpisodesOf: async () => ({ episodes: [], shows: new Map() }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

async function renderCommunity(slug: string) {
  vi.stubGlobal('React', React);
  const { default: CommunityPage } = await import('./page');
  const page = await CommunityPage({ params: Promise.resolve({ slug }) });
  return renderToStaticMarkup(React.createElement(PlayerProvider, { children: page }));
}

describe('a community page (D-24)', () => {
  it('names the community on the stage, with the route arriving at its full stop', async () => {
    const html = await renderCommunity('idhaa');
    expect(html).toMatch(/<h1 id="community-title" class="community-hero__title">إذاعة مختلف<svg/);
    // Both compositions are drawn, each over a trace that needs no motion.
    expect(html.match(/class="stage-route__trace"/g)).toHaveLength(2);
    expect(html).toContain('تسعة برامج ونشرتان.');
    expect(html).toContain('href="https://www.youtube.com/@Mukhtalif_Career" target="_blank"');
  });

  it('shows every programme whole and leads to every other community', async () => {
    const html = await renderCommunity('idhaa');
    const idhaa = COMMUNITIES.find((community) => community.slug === 'idhaa')!;
    for (const programme of idhaa.programmes) {
      expect(html).toContain(`<span class="programme-tile__name">${programme.name}</span>`);
    }
    for (const other of COMMUNITIES) {
      const link = `href="/communities/${other.slug}"`;
      if (other.slug === 'idhaa') expect(html).not.toContain(link);
      else expect(html).toContain(link);
    }
  });

  it('leaves out what a community does not have yet, without empty sections', async () => {
    const html = await renderCommunity('tarbawi');
    expect(html).not.toContain('id="community-programmes"');
    expect(html).not.toContain('id="community-newsletters"');
    expect(html).not.toContain('class="community-hero__fact"');
    expect(html).toContain('id="community-others"');
  });
});
