import type {
  Article,
  ArticleStatus,
  Episode,
  EpisodeStatus,
  Follow,
  Plan,
  PlaybackProgress,
  Show,
  Subscription,
  SubscriptionStatus,
  User,
} from '@mukhtalif/types';
import type {
  CreateArticleInput,
  CreateEpisodeInput,
  CreateShowInput,
  CreateSubscriptionInput,
  UpdateArticleInput,
  UpdateEpisodeInput,
  UpdateShowInput,
} from '@mukhtalif/validation';

export interface EpisodeFilter {
  showId?: string;
  status?: EpisodeStatus;
}

export interface ArticleFilter {
  status?: ArticleStatus;
}

export interface Repository {
  getUser(id: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  listUsers(): Promise<User[]>;

  listShows(): Promise<Show[]>;
  getShow(id: string): Promise<Show | null>;
  getShowBySlug(slug: string): Promise<Show | null>;
  createShow(input: CreateShowInput): Promise<Show>;
  updateShow(id: string, input: UpdateShowInput): Promise<Show | null>;

  listEpisodes(filter: EpisodeFilter): Promise<Episode[]>;
  getEpisode(id: string): Promise<Episode | null>;
  createEpisode(input: CreateEpisodeInput): Promise<Episode>;
  updateEpisode(id: string, input: UpdateEpisodeInput): Promise<Episode | null>;
  updateEpisodeStatus(
    id: string,
    status: EpisodeStatus,
    publishAt?: string,
  ): Promise<Episode | null>;
  setEpisodeAudioKey(id: string, audioKey: string): Promise<Episode | null>;

  listArticles(filter: ArticleFilter): Promise<Article[]>;
  getArticle(id: string): Promise<Article | null>;
  getArticleBySlug(slug: string): Promise<Article | null>;
  createArticle(input: CreateArticleInput): Promise<Article>;
  updateArticle(id: string, input: UpdateArticleInput): Promise<Article | null>;
  updateArticleStatus(
    id: string,
    status: ArticleStatus,
    publishedAt?: string,
  ): Promise<Article | null>;

  listPlans(): Promise<Plan[]>;
  getPlan(id: string): Promise<Plan | null>;

  listSubscriptions(): Promise<Subscription[]>;
  getSubscriptionForUser(userId: string): Promise<Subscription | null>;
  createSubscription(
    input: CreateSubscriptionInput,
    priceMinor: number,
    currency: string,
    currentPeriodEnd: string,
  ): Promise<Subscription>;
  updateSubscriptionStatus(id: string, status: SubscriptionStatus): Promise<Subscription | null>;
  getSubscription(id: string): Promise<Subscription | null>;

  listFollows(userId: string): Promise<Follow[]>;
  createFollow(userId: string, showId: string): Promise<Follow>;
  deleteFollow(userId: string, showId: string): Promise<boolean>;

  listProgress(userId: string): Promise<PlaybackProgress[]>;
  upsertProgress(
    userId: string,
    episodeId: string,
    positionSec: number,
  ): Promise<PlaybackProgress>;
}
