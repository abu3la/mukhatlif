import { Hono } from 'hono';
import type {
  HomeSummary,
  PublicEpisode,
  HomepageWeeklyEpisode,
  PublishedArticleSummary,
  Article,
  Episode,
} from '@mukhtalif/types';
import { HOMEPAGE_WEEKLY_EPISODES_WINDOW_DAYS } from '@mukhtalif/types';
import type { AppEnv } from '../auth';
import { getMediaPublicOrigin } from '../env';
import { rebaseTrustedMediaUrl } from '../publishing/media-public-url';
import { getRepository } from '../repo';

const SHOW_LIMIT = 12;
const EPISODE_LIMIT = 8;
const ARTICLE_LIMIT = 6;

/** Strips all playback source fields; audio is requested through the API route. */
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

function toHomepageWeeklyEpisode(
  episode: Episode,
  showsById: ReadonlyMap<string, string>,
): HomepageWeeklyEpisode {
  const showTitleAr = showsById.get(episode.showId);
  if (!showTitleAr) throw new Error(`Published episode ${episode.id} has no show`);
  return { ...toPublicEpisode(episode), showTitleAr };
}

/** Listing projection: no editor JSON, rendered HTML, or newsletter state. */
function toArticleSummary(article: Article, mediaOrigin: string | null): PublishedArticleSummary {
  return {
    id: article.id,
    slug: article.slug,
    titleAr: article.titleAr,
    titleEn: article.titleEn,
    excerptAr: article.excerptAr,
    coverUrl: rebaseTrustedMediaUrl(article.coverUrl, mediaOrigin),
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
  const mediaOrigin = getMediaPublicOrigin(c.env, new URL(c.req.url).origin);
  const asOf = new Date();
  const publishedFrom = new Date(
    asOf.getTime() - HOMEPAGE_WEEKLY_EPISODES_WINDOW_DAYS * 24 * 60 * 60 * 1_000,
  ).toISOString();
  const [allShows, episodes, articles, weeklySettings, weeklyEpisodes] = await Promise.all([
    repo.listShows(),
    repo.listEpisodesPage({ status: 'published' }, { page: 1, perPage: EPISODE_LIMIT }),
    repo.listArticlesPage({ status: 'published' }, { page: 1, perPage: ARTICLE_LIMIT }),
    repo.getHomepageWeeklyEpisodesSettings(),
    repo.listEpisodes({
      status: 'published',
      publishedFrom,
      publishedTo: asOf.toISOString(),
    }),
  ]);
  const showsById = new Map(allShows.map((show) => [show.id, show.titleAr]));
  const publicWeeklyEpisodes = weeklyEpisodes.map((episode) =>
    toHomepageWeeklyEpisode(episode, showsById),
  );
  const summary: HomeSummary = {
    asOf: asOf.toISOString(),
    shows: allShows.slice(0, SHOW_LIMIT),
    latestEpisodes: episodes.items.map(toPublicEpisode),
    weeklyEpisodes:
      weeklySettings.enabled && publicWeeklyEpisodes.length > 0
        ? {
            title: weeklySettings.title,
            windowDays: HOMEPAGE_WEEKLY_EPISODES_WINDOW_DAYS,
            episodes: publicWeeklyEpisodes,
          }
        : null,
    latestArticles: articles.items.map((article) => toArticleSummary(article, mediaOrigin)),
  };
  return c.json(summary);
});
