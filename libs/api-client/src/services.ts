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
  User,
} from '@mukhtalif/types';
import type {
  CreateArticleInput,
  CreateEpisodeInput,
  CreateShowInput,
  CreateSubscriptionInput,
  UpdateArticleInput,
  UpdateEpisodeInput,
  UpdateEpisodeStatusInput,
  UpdateShowInput,
  UpdateSubscriptionStatusInput,
  UpsertProgressInput,
} from '@mukhtalif/validation';
import { apiUrl, request } from './client';

export interface EpisodeFilter {
  showId?: string;
  status?: EpisodeStatus;
}

export interface ArticleFilter {
  status?: ArticleStatus;
}

function toQuery(filter: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filter)) {
    if (typeof value === 'string' && value) params.set(key, value);
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

export const showsService = {
  list: () => request<Show[]>('/shows'),
  get: (idOrSlug: string) => request<Show>(`/shows/${idOrSlug}`),
  create: (input: CreateShowInput) =>
    request<Show>('/shows', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: UpdateShowInput) =>
    request<Show>(`/shows/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
};

export const episodesService = {
  list: (filter: EpisodeFilter = {}) => request<Episode[]>(`/episodes${toQuery(filter)}`),
  get: (id: string) => request<Episode>(`/episodes/${id}`),
  create: (input: CreateEpisodeInput) =>
    request<Episode>('/episodes', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: UpdateEpisodeInput) =>
    request<Episode>(`/episodes/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  updateStatus: (id: string, input: UpdateEpisodeStatusInput) =>
    request<Episode>(`/episodes/${id}/status`, { method: 'PATCH', body: JSON.stringify(input) }),
  /** Stream URL for players; the API redirects or serves from R2. */
  audioUrl: (id: string) => apiUrl(`/episodes/${id}/audio`),
};

export const articlesService = {
  list: (filter: ArticleFilter = {}) => request<Article[]>(`/articles${toQuery(filter)}`),
  get: (slug: string) => request<Article>(`/articles/${slug}`),
  create: (input: CreateArticleInput) =>
    request<Article>('/articles', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: UpdateArticleInput) =>
    request<Article>(`/articles/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  updateStatus: (id: string, input: { status: Article['status'] }) =>
    request<Article>(`/articles/${id}/status`, { method: 'PATCH', body: JSON.stringify(input) }),
};

export const plansService = {
  list: () => request<Plan[]>('/plans'),
};

export const subscriptionsService = {
  list: () => request<Subscription[]>('/subscriptions'),
  create: (input: CreateSubscriptionInput) =>
    request<Subscription>('/subscriptions', { method: 'POST', body: JSON.stringify(input) }),
  updateStatus: (id: string, input: UpdateSubscriptionStatusInput) =>
    request<Subscription>(`/subscriptions/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
};

export const meService = {
  profile: () => request<User>('/me'),
  subscription: () => request<Subscription | null>('/me/subscription'),
};

export const usersService = {
  list: () => request<User[]>('/users'),
};

export const followsService = {
  list: () => request<Follow[]>('/follows'),
  create: (showId: string) =>
    request<Follow>('/follows', { method: 'POST', body: JSON.stringify({ showId }) }),
  remove: (showId: string) => request<void>(`/follows/${showId}`, { method: 'DELETE' }),
};

export const progressService = {
  list: () => request<PlaybackProgress[]>('/progress'),
  upsert: (input: UpsertProgressInput) =>
    request<PlaybackProgress>('/progress', { method: 'PUT', body: JSON.stringify(input) }),
};
