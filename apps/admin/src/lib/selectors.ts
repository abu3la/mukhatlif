import { matchesArabicSearch } from './arabic';
import type {
  AdminStudioData,
  Article,
  ArticleStatus,
  Episode,
  EpisodeId,
  EpisodeStatus,
  GuestId,
  GuestSocial,
  Show,
  ShowId,
  SocialPlatform,
  Subscription,
  UserId,
} from './models';

export interface OverviewMetrics {
  showCount: number;
  publishedEpisodeCount: number;
  activeSubscriberCount: number;
}

export function getOverviewMetrics(data: Readonly<AdminStudioData>): OverviewMetrics {
  return {
    showCount: data.shows.length,
    publishedEpisodeCount: data.episodes.filter((episode) => episode.status === 'published').length,
    activeSubscriberCount: data.subscriptions.filter(
      (subscription) => subscription.status === 'active',
    ).length,
  };
}

export function getLatestPublishedEpisodes(episodes: readonly Episode[], limit = 4): Episode[] {
  return episodes
    .filter((episode) => episode.status === 'published')
    .slice()
    .sort(
      (left, right) =>
        new Date(right.publishedAt ?? right.updatedAt).getTime() -
        new Date(left.publishedAt ?? left.updatedAt).getTime(),
    )
    .slice(0, Math.max(0, limit));
}

export interface EpisodeStatusCounts extends Record<EpisodeStatus, number> {
  all: number;
}

export function getEpisodeStatusCounts(episodes: readonly Episode[]): EpisodeStatusCounts {
  const counts: EpisodeStatusCounts = {
    all: episodes.length,
    draft: 0,
    scheduled: 0,
    published: 0,
    archived: 0,
  };
  for (const episode of episodes) counts[episode.status] += 1;
  return counts;
}

export interface ArticleStatusCounts extends Record<ArticleStatus, number> {
  all: number;
}

export function getArticleStatusCounts(articles: readonly Article[]): ArticleStatusCounts {
  const counts: ArticleStatusCounts = { all: articles.length, draft: 0, published: 0 };
  for (const article of articles) counts[article.status] += 1;
  return counts;
}

export interface EpisodeFilters {
  status?: EpisodeStatus | 'all';
  showId?: ShowId | 'all';
  query?: string;
}

export function filterEpisodes(
  data: Pick<AdminStudioData, 'episodes' | 'shows'>,
  filters: EpisodeFilters = {},
): Episode[] {
  const showNames = new Map(data.shows.map((show) => [show.id, show.name]));
  return data.episodes.filter((episode) => {
    const statusMatches =
      !filters.status || filters.status === 'all' || episode.status === filters.status;
    const showMatches =
      !filters.showId || filters.showId === 'all' || episode.showId === filters.showId;
    const queryMatches = matchesArabicSearch(
      filters.query ?? '',
      episode.title,
      showNames.get(episode.showId),
      episode.episodeNumber,
    );
    return statusMatches && showMatches && queryMatches;
  });
}

export interface ArticleFilters {
  status?: ArticleStatus | 'all';
  query?: string;
}

export function filterArticles(
  articles: readonly Article[],
  filters: ArticleFilters = {},
): Article[] {
  return articles.filter(
    (article) =>
      (!filters.status || filters.status === 'all' || article.status === filters.status) &&
      matchesArabicSearch(filters.query ?? '', article.title, article.author.displayName),
  );
}

export interface ShowMetrics {
  show: Show;
  episodeCount: number;
  publishedCount: number;
}

export function getShowMetrics(data: Pick<AdminStudioData, 'shows' | 'episodes'>): ShowMetrics[] {
  return data.shows.map((show) => {
    const episodes = data.episodes.filter((episode) => episode.showId === show.id);
    return {
      show,
      episodeCount: episodes.length,
      publishedCount: episodes.filter((episode) => episode.status === 'published').length,
    };
  });
}

export function getGuestEpisodeIds(
  appearances: readonly { guestId: GuestId; episodeId: EpisodeId }[],
  guestId: GuestId,
): EpisodeId[] {
  return appearances
    .filter((appearance) => appearance.guestId === guestId)
    .map((appearance) => appearance.episodeId);
}

export function getGuestEpisodes(
  data: Pick<AdminStudioData, 'episodes' | 'guestAppearances'>,
  guestId: GuestId,
): Episode[] {
  const linked = new Set(getGuestEpisodeIds(data.guestAppearances, guestId));
  return data.episodes.filter((episode) => linked.has(episode.id));
}

export function getGuestAppearanceCount(
  appearances: readonly { guestId: GuestId }[],
  guestId: GuestId,
): number {
  return appearances.filter((appearance) => appearance.guestId === guestId).length;
}

export function getSubscriptionForUser(
  subscriptions: readonly Subscription[],
  userId: UserId,
): Subscription | undefined {
  return subscriptions.find((subscription) => subscription.userId === userId);
}

/** Active and past-due subscribers retain a Plus account label in the handoff. */
export function hasPlusAccount(subscription: Subscription | undefined): boolean {
  return subscription?.status === 'active' || subscription?.status === 'past_due';
}

export function hasActivePlusSubscription(subscription: Subscription | undefined): boolean {
  return subscription?.status === 'active';
}

export const SOCIAL_PLATFORM_LABELS = {
  x: 'إكس',
  linkedin: 'لينكدإن',
  instagram: 'إنستغرام',
  youtube: 'يوتيوب',
  website: 'الموقع',
} as const satisfies Record<SocialPlatform, string>;

const SOCIAL_BASE_URLS = {
  x: 'https://x.com/',
  linkedin: 'https://linkedin.com/',
  instagram: 'https://instagram.com/',
  youtube: 'https://youtube.com/',
  website: 'https://',
} as const satisfies Record<SocialPlatform, string>;

export function socialProfileUrl(social: Pick<GuestSocial, 'platform' | 'handle'>): string {
  const handle = social.handle.trim();
  if (social.platform === 'website' && /^https?:\/\//i.test(handle)) return handle;
  return `${SOCIAL_BASE_URLS[social.platform]}${handle.replace(/^@/, '').replace(/^\//, '')}`;
}
