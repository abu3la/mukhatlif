import { Hono } from 'hono';
import { DEFAULT_PAGE_SIZE, type StudioSummary } from '@mukhtalif/types';
import { hasPermission, requirePermission, type AppEnv } from '../auth';
import { getRepository } from '../repo';

const RECENT_LIMIT = 5;

/**
 * The Studio overview snapshot.
 *
 * Entry requires `overview.view`, then each section is gated on its own page
 * permission and omitted when the caller lacks it. Omitting a section is
 * deliberate: a zeroed `audience` block would read as real revenue data to an
 * editor who is simply not allowed to see it.
 */
export const studioSummaryRoute = new Hono<AppEnv>().get(
  '/',
  requirePermission('overview.view'),
  async (c) => {
    const repo = getRepository(c.env);
    const permissions = c.get('permissions');
    const canViewEpisodes = hasPermission(permissions, 'episodes.view');
    const canViewArticles = hasPermission(permissions, 'articles.view');
    const canViewSubscribers = hasPermission(permissions, 'subscribers.view');
    // The counts document covers shows, guests, episodes, and articles, so it
    // is only safe to return when the caller may read all four.
    const canViewContent =
      canViewEpisodes &&
      canViewArticles &&
      hasPermission(permissions, 'shows.view') &&
      hasPermission(permissions, 'guests.view');

    const recentQuery = { page: 1, perPage: RECENT_LIMIT, search: undefined };
    const [content, audience, recentEpisodes, recentArticles] = await Promise.all([
      canViewContent ? repo.getContentSummary() : Promise.resolve(undefined),
      canViewSubscribers ? repo.getAudienceSummary() : Promise.resolve(undefined),
      canViewEpisodes
        ? repo.listEpisodesPage({}, recentQuery)
        : Promise.resolve(undefined),
      canViewArticles
        ? repo.listArticlesPage({}, recentQuery)
        : Promise.resolve(undefined),
    ]);

    const summary: StudioSummary = {
      asOf: new Date().toISOString(),
      ...(content ? { content } : {}),
      ...(audience ? { audience } : {}),
      ...(recentEpisodes
        ? {
            recentEpisodes: recentEpisodes.items.map((episode) => ({
              id: episode.id,
              showId: episode.showId,
              titleAr: episode.titleAr,
              status: episode.status,
              episodeNumber: episode.episodeNumber,
              publishAt: episode.publishAt,
              createdAt: episode.createdAt,
            })),
          }
        : {}),
      ...(recentArticles
        ? {
            recentArticles: recentArticles.items.map((article) => ({
              id: article.id,
              slug: article.slug,
              titleAr: article.titleAr,
              status: article.status,
              publishedAt: article.publishedAt,
              updatedAt: article.updatedAt,
            })),
          }
        : {}),
    };
    return c.json(summary);
  },
);

/** Exported for tests that assert the default list size stays in sync. */
export const SUMMARY_DEFAULTS = { recentLimit: RECENT_LIMIT, defaultPageSize: DEFAULT_PAGE_SIZE };
