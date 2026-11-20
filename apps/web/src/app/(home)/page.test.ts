import { PlayerProvider } from '@/components/player';
import { COMMUNITIES } from '@/lib/communities';
import { MANIFESTO, SERVICES, TEAM } from '@/lib/site-facts';
import { anonymousCustomerFixture } from '@/test/customer-fixture';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/config', () => ({
  apiOrigin: () => 'https://api.test',
  publicEpisodeAudioSrc: (id: string) => 'https://api.test/episodes/' + id + '/audio',
}));
vi.mock('@/components/customer-provider', () => ({ useCustomer: () => anonymousCustomerFixture }));

afterEach(() => {
  vi.unstubAllGlobals();
});

async function renderHome() {
  vi.stubGlobal('React', React);
  const { default: HomePage } = await import('./page');
  return renderToStaticMarkup(React.createElement(PlayerProvider, { children: HomePage() }));
}

describe('the presentation home (D-24)', () => {
  it('tells the story in order: stage, sheet, then the floor', async () => {
    const html = await renderHome();
    const order = [
      '<h1 id="home-title"',
      'class="home-manifesto"',
      'class="home-story"',
      'id="home-programmes-title"',
      'id="home-ways-title"',
      'class="newsletter-signup"',
      'id="home-services-title"',
      'id="home-credits-title"',
    ].map((marker) => html.indexOf(marker));
    expect(order.every((index) => index > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain('لمسار مهني');
    expect(html).toContain('يشبهك');
  });

  it('shows every phrase of «قضيتنا» without waiting for the scroll', async () => {
    const html = await renderHome();
    for (const phrase of MANIFESTO) expect(html).toContain(phrase);
    // Two phrases are lit at rest; the rest stay readable in the unlit ink.
    expect(html.match(/class="is-lit"/g)).toHaveLength(2);
  });

  it('draws every route over a trace that needs no motion', async () => {
    const html = await renderHome();
    expect(html.match(/class="stage-route__trace"/g)?.length).toBeGreaterThanOrEqual(3);
    expect(html.match(/class="stage-route__ink"/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('leads to every community from the picker and from the phone slides', async () => {
    const html = await renderHome();
    for (const community of COMMUNITIES) {
      expect(html).toContain(`>${community.name}</button>`);
      expect(html).toContain(`href="/communities/${community.slug}"`);
    }
    expect(html).toContain('id="home-communities-rail" class="stage-rail stage-rail--communities"');
    expect(html).toContain('aria-pressed="true"');
  });

  it('names the team, offers each production format, and keeps one newsletter form', async () => {
    const html = await renderHome();
    for (const [name, role] of TEAM) {
      expect(html).toContain(`<dt>${role}</dt><dd>${name}</dd>`);
    }
    for (const [title] of SERVICES) {
      expect(html).toContain(`href="/prodservice?service=${encodeURIComponent(title)}"`);
    }
    expect(html.match(/class="newsletter-signup"/g)).toHaveLength(1);
  });

  it('waits to show rail arrows, preloads nothing below the fold, and uses no dot separators', async () => {
    const html = await renderHome();
    expect(html).toMatch(/<div class="public-rail-controls" role="group"[^>]*hidden=""/);
    expect(html).not.toContain('rel="preload"');
    expect(html).not.toContain(' · ');
  });

  it('keeps the newsletter out of the shared footer, which carries the wordmark', async () => {
    const { SiteFooter } = await import('@/components/site-chrome');
    const footer = renderToStaticMarkup(React.createElement(SiteFooter));
    expect(footer).not.toContain('newsletter-signup');
    expect(footer).toContain('class="site-floor__wordmark"');
    expect(footer).toContain('href="/mission"');
  });
});
