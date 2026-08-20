import { Hono } from 'hono';
import type {
  HomeSummary,
  PublicEpisode,
  PublishedArticleSummary,
  Article,
  Episode,
} from '@mukhtalif/types';
import type { AppEnv } from '../auth';
import { getRepository } from '../repo';

const SHOW_LIMIT = 12;
const EPISODE_LIMIT = 8;
const ARTICLE_LIMIT = 6;

/** Strips Studio-only episode fields, including the private R2 object key. */
function toPublicEpisode(episode: Episode): PublicEpisode {
  return {
    id: episode.id,
    showId: episode.showId,
    titleAr: episode.titleAr,
    titleEn: episode.titleEn,
    showNotesAr: episode.showNotesAr,
    durationSec: episode.durationSec,
    episodeNumber: episode.episodeNumber,
    premium: episode.premium,
    publishAt: episode.publishAt,
  };
}

/** Listing projection: no editor JSON, rendered HTML, or newsletter state. */
function toArticleSummary(article: Article): PublishedArticleSummary {
  return {
    id: article.id,
    slug: article.slug,
    titleAr: article.titleAr,
    titleEn: article.titleEn,
    excerptAr: article.excerptAr,
    coverUrl: article.coverUrl,
    coverAlt: article.coverAlt,
    publishedAt: article.publishedAt,
    author: { displayName: article.author.displayName },
  };
}

/**
 * Anonymous home-page read for the public site.
 *
 * The site renders on the server, so one request avoids a three-way waterfall.
 * Everything returned is already-published content and no field depends on the
 * caller, which keeps the response safe to cache at the edge.
 */
export const publicHomeRoute = new Hono<AppEnv>().get('/', async (c) => {
  const repo = getRepository(c.env);
  const [shows, episodes, articles] = await Promise.all([
    repo.listShowsPage({ page: 1, perPage: SHOW_LIMIT }),
    repo.listEpisodesPage({ status: 'published' }, { page: 1, perPage: EPISODE_LIMIT }),
    repo.listArticlesPage({ status: 'published' }, { page: 1, perPage: ARTICLE_LIMIT }),
  ]);
  const summary: HomeSummary = {
    asOf: new Date().toISOString(),
    shows: shows.items,
    latestEpisodes: episodes.items.map(toPublicEpisode),
    latestArticles: articles.items.map(toArticleSummary),
  };
  return c.json(summary);
});
