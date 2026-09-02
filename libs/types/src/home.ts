import type { PublishedArticleSummary } from './article';
import type { Episode } from './episode';
import type { Show } from './show';

/**
 * One server-rendered read for the public home page.
 *
 * The public site renders on the server, so a single request avoids a waterfall
 * of three round trips. Every collection here is already-published content: the
 * endpoint is anonymous and applies no viewer-specific filtering.
 */
export type PublicEpisode = Pick<
  Episode,
  | 'id'
  | 'showId'
  | 'titleAr'
  | 'titleEn'
  | 'showNotesAr'
  | 'durationSec'
  | 'episodeNumber'
  | 'premium'
  | 'publishAt'
>;

export const HOMEPAGE_WEEKLY_EPISODES_WINDOW_DAYS = 7 as const;
export const DEFAULT_HOMEPAGE_WEEKLY_EPISODES_TITLE =
  'حلقات آخر أسبوع من مختلف' as const;

/** Studio-managed presentation settings for the trailing-week home section. */
export interface HomepageWeeklyEpisodesSettings {
  enabled: boolean;
  title: string;
  windowDays: typeof HOMEPAGE_WEEKLY_EPISODES_WINDOW_DAYS;
  /** Monotonic value used for optimistic concurrency in Studio. */
  version: number;
  /** ISO timestamp of the latest settings update. */
  updatedAt: string;
}

/** Weekly card projection includes its programme name independent of home-page show limits. */
export interface HomepageWeeklyEpisode extends PublicEpisode {
  showTitleAr: string;
}

/** Anonymous home-page projection. Playback source fields are absent by type. */
export interface HomepageWeeklyEpisodesSection {
  title: string;
  windowDays: typeof HOMEPAGE_WEEKLY_EPISODES_WINDOW_DAYS;
  episodes: HomepageWeeklyEpisode[];
}

export interface HomeSummary {
  /** ISO timestamp the snapshot was assembled. */
  asOf: string;
  shows: Show[];
  latestEpisodes: PublicEpisode[];
  /** Null when disabled or when no episode was published in the trailing window. */
  weeklyEpisodes: HomepageWeeklyEpisodesSection | null;
  latestArticles: PublishedArticleSummary[];
}
