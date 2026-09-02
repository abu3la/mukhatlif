import type { Article } from './article';
import type { Episode, EpisodeStatus } from './episode';
import type { ArticleStatus } from './article';
import type { SubscriptionStatus } from './subscription';

/**
 * The Studio overview snapshot.
 *
 * Every section is independently permission-gated and therefore optional: an
 * editor without `subscribers.view` receives the same document without the
 * `audience` section, rather than a section full of zeros that would read as
 * real revenue data.
 */
export interface StudioContentSummary {
  shows: number;
  guests: number;
  episodes: Record<EpisodeStatus, number> & { total: number };
  articles: Record<ArticleStatus, number> & { total: number };
}

export interface StudioAudienceSummary {
  users: number;
  subscriptions: Record<SubscriptionStatus, number> & { total: number };
  /** Recurring revenue in minor units (halalas), summed over active plans. */
  monthlyRecurringRevenueMinor: number;
  currency: string;
}

export type StudioSummaryEpisode = Pick<
  Episode,
  'id' | 'showId' | 'titleAr' | 'status' | 'episodeNumber' | 'publishAt' | 'createdAt'
>;

export type StudioSummaryArticle = Pick<
  Article,
  'id' | 'slug' | 'titleAr' | 'status' | 'publishedAt' | 'updatedAt'
>;

export interface StudioSummary {
  /** ISO timestamp the snapshot was computed. */
  asOf: string;
  content?: StudioContentSummary;
  audience?: StudioAudienceSummary;
  recentEpisodes?: StudioSummaryEpisode[];
  recentArticles?: StudioSummaryArticle[];
}
