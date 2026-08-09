import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import type { ArticleStatus } from '@mukhtalif/types';
import {
  articlesService,
  episodesService,
  followsService,
  meService,
  plansService,
  progressService,
  showsService,
  subscriptionsService,
  usersService,
  type ArticleFilter,
  type EpisodeFilter,
} from './services';

export function useShows() {
  return useQuery({ queryKey: ['shows'], queryFn: showsService.list });
}

export function useShow(idOrSlug: string) {
  return useQuery({ queryKey: ['shows', idOrSlug], queryFn: () => showsService.get(idOrSlug) });
}

export function useCreateShow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateShowInput) => showsService.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shows'] }),
  });
}

export function useUpdateShow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateShowInput & { id: string }) =>
      showsService.update(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shows'] }),
  });
}

export function useEpisodes(filter: EpisodeFilter = {}) {
  return useQuery({
    queryKey: ['episodes', filter],
    queryFn: () => episodesService.list(filter),
  });
}

export function useEpisode(id: string) {
  return useQuery({ queryKey: ['episodes', id], queryFn: () => episodesService.get(id) });
}

export function useCreateEpisode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEpisodeInput) => episodesService.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['episodes'] }),
  });
}

export function useUpdateEpisode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateEpisodeInput & { id: string }) =>
      episodesService.update(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['episodes'] }),
  });
}

export function useUpdateEpisodeStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateEpisodeStatusInput & { id: string }) =>
      episodesService.updateStatus(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['episodes'] }),
  });
}

export function useArticles(filter: ArticleFilter = {}) {
  return useQuery({
    queryKey: ['articles', filter],
    queryFn: () => articlesService.list(filter),
  });
}

export function useArticle(slug: string) {
  return useQuery({ queryKey: ['articles', slug], queryFn: () => articlesService.get(slug) });
}

export function useCreateArticle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateArticleInput) => articlesService.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['articles'] }),
  });
}

export function useUpdateArticle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateArticleInput & { id: string }) =>
      articlesService.update(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['articles'] }),
  });
}

export function useUpdateArticleStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ArticleStatus }) =>
      articlesService.updateStatus(id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['articles'] }),
  });
}

export function usePlans() {
  return useQuery({ queryKey: ['plans'], queryFn: plansService.list });
}

export function useSubscriptions() {
  return useQuery({ queryKey: ['subscriptions'], queryFn: subscriptionsService.list });
}

export function useCreateSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSubscriptionInput) => subscriptionsService.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['subscriptions'] }),
  });
}

export function useUpdateSubscriptionStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateSubscriptionStatusInput & { id: string }) =>
      subscriptionsService.updateStatus(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['subscriptions'] }),
  });
}

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: meService.profile });
}

export function useMySubscription() {
  return useQuery({ queryKey: ['me', 'subscription'], queryFn: meService.subscription });
}

export function useUsers() {
  return useQuery({ queryKey: ['users'], queryFn: usersService.list });
}

export function useFollows() {
  return useQuery({ queryKey: ['follows'], queryFn: followsService.list });
}

export function useFollow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (showId: string) => followsService.create(showId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['follows'] }),
  });
}

export function useUnfollow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (showId: string) => followsService.remove(showId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['follows'] }),
  });
}

export function useProgress() {
  return useQuery({ queryKey: ['progress'], queryFn: progressService.list });
}

export function useUpsertProgress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertProgressInput) => progressService.upsert(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['progress'] }),
  });
}
