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

export interface HomeSummary {
  /** ISO timestamp the snapshot was assembled. */
  asOf: string;
  shows: Show[];
  latestEpisodes: PublicEpisode[];
  latestArticles: PublishedArticleSummary[];
}
