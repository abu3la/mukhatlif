import { describe, expect, it } from 'vitest';
import type { HomeSummary, PaginatedList, PublishedArticle } from '@mukhtalif/types';
import type { Env } from './env';
import app from './index';
import { createMemoryRepository } from './repo/memory';

const localEnv: Env = {
  APP_ENV: 'development',
  ALLOW_DEV_AUTH: 'true',
  CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
};

const anonymous = (path: string) => app.request(path, {}, localEnv);

describe('public home summary', () => {
  it('is readable without authentication', async () => {
    const response = await anonymous('/home');
    expect(response.status).toBe(200);
  });

  it('returns shows, latest episodes, and article summaries in one read', async () => {
    const summary = (await (await anonymous('/home')).json()) as HomeSummary;
    expect(summary.asOf).toEqual(expect.any(String));
    expect(summary.shows.length).toBeGreaterThan(0);
    expect(summary.latestEpisodes.length).toBeGreaterThan(0);
    expect(summary.latestArticles.length).toBeGreaterThan(0);
  });

  it('publishes only published episodes and never a playback source', async () => {
    const summary = (await (await anonymous('/home')).json()) as HomeSummary;
    for (const episode of summary.latestEpisodes) {
      expect(episode).not.toHaveProperty('audioKey');
      expect(episode).not.toHaveProperty('audioUrl');
      expect(episode).not.toHaveProperty('status');
    }
    const raw = JSON.stringify(summary);
    expect(raw).not.toContain('audioKey');
    expect(raw).not.toContain('audioUrl');
  });

  it('omits article bodies from the home listing', async () => {
    const summary = (await (await anonymous('/home')).json()) as HomeSummary;
    for (const article of summary.latestArticles) {
      expect(article).not.toHaveProperty('contentHtml');
      expect(article).not.toHaveProperty('content');
      expect(article).not.toHaveProperty('newsletter');
      expect(article.author.displayName).toEqual(expect.any(String));
    }
  });
});

describe('public article reads', () => {
  it('returns only published articles and keeps the legacy array shape', async () => {
    const articles = (await (await anonymous('/articles')).json()) as PublishedArticle[];
    expect(Array.isArray(articles)).toBe(true);
    expect(articles.every((article) => article.status === 'published')).toBe(true);
  });

  it('serves server-rendered HTML rather than editor source', async () => {
    const articles = (await (await anonymous('/articles')).json()) as PublishedArticle[];
    for (const article of articles) {
      expect(typeof article.contentHtml).toBe('string');
      expect(article).not.toHaveProperty('content');
      expect(article).not.toHaveProperty('newsletter');
      expect(article).not.toHaveProperty('version');
    }
  });

  it('supports the same opt-in paging envelope as the Studio lists', async () => {
    const page = (await (
      await anonymous('/articles?page=1&perPage=1')
    ).json()) as PaginatedList<PublishedArticle>;
    expect(page.items).toHaveLength(1);
    expect(page.pageInfo.perPage).toBe(1);
    expect(page.items[0].status).toBe('published');
  });

  it('returns 404 for an unknown or unpublished slug', async () => {
    expect((await anonymous('/articles/does-not-exist')).status).toBe(404);
  });
});

describe('public catalogue reads', () => {
  it('never lets an anonymous caller filter to unpublished episodes', async () => {
    const episodes = (await (await anonymous('/episodes?status=draft')).json()) as {
      status: string;
    }[];
    expect(episodes.every((episode) => episode.status === 'published')).toBe(true);
  });

  it('resolves a show by slug for the public site', async () => {
    const shows = (await (await anonymous('/shows')).json()) as { slug: string }[];
    const response = await anonymous(`/shows/${shows[0].slug}`);
    expect(response.status).toBe(200);
  });

  it('returns 404 for an unknown show', async () => {
    expect((await anonymous('/shows/no-such-show')).status).toBe(404);
  });

  it('never exposes an audio source from episode list or detail reads', async () => {
    await createMemoryRepository().setEpisodeAudioKey(
      'ep-1001',
      'episodes/private-storage-key.mp3',
    );

    for (const path of ['/episodes', '/episodes?page=1&perPage=2', '/episodes/ep-1001']) {
      const response = await anonymous(path);
      expect(response.status, path).toBe(200);
      const body = await response.text();
      expect(body, path).not.toContain('audioKey');
      expect(body, path).not.toContain('audioUrl');
      expect(body, path).not.toContain('private-storage-key');
      expect(body, path).not.toContain('SoundHelix-Song-1.mp3');
    }
  });
});
