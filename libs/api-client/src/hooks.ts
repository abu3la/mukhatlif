import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateArticleInput,
  CreateEpisodeInput,
  CreateShowInput,
  CreateStudioRoleInput,
  CreateSubscriptionInput,
  InviteStudioMemberInput,
  UpdateArticleInput,
  UpdateEpisodeInput,
  UpdateEpisodeStatusInput,
  UpdateShowInput,
  UpdateSubscriptionStatusInput,
  UpdateStudioMemberRoleInput,
  UpdateRolePermissionsInput,
  UpsertProgressInput,
} from '@mukhtalif/validation';
import type { ArticleStatus, RoleId } from '@mukhtalif/types';
import {
  auditService,
  studioArticlesService,
  episodesService,
  followsService,
  meService,
  plansService,
  permissionsService,
  progressService,
  rolesService,
  showsService,
  studioMeService,
  studioMembersService,
  subscriptionsService,
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
    queryFn: () => studioArticlesService.list(filter),
  });
}

export function useArticle(slug: string) {
  return useQuery({
    queryKey: ['articles', slug],
    queryFn: () => studioArticlesService.get(slug),
  });
}

export function useCreateArticle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateArticleInput) => studioArticlesService.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['articles'] }),
  });
}

export function useUpdateArticle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateArticleInput & { id: string }) =>
      studioArticlesService.update(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['articles'] }),
  });
}

export function useUpdateArticleStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      status,
      expectedVersion,
    }: {
      id: string;
      status: ArticleStatus;
      expectedVersion: number;
    }) => studioArticlesService.updateStatus(id, { status, expectedVersion }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['articles'] }),
  });
}

export function usePlans() {
  return useQuery({ queryKey: ['plans'], queryFn: plansService.list });
}

export function useSubscriptions() {
  return useQuery({ queryKey: ['subscriptions'], queryFn: subscriptionsService.list });
}

export function useSubscriberUsers() {
  return useQuery({
    queryKey: ['subscriber-users'],
    queryFn: subscriptionsService.listSubscriberUsers,
  });
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

export function useStudioMe() {
  return useQuery({ queryKey: ['studio', 'me'], queryFn: studioMeService.profile });
}

export function useMySubscription() {
  return useQuery({ queryKey: ['me', 'subscription'], queryFn: meService.subscription });
}

export function useStudioMembers() {
  return useQuery({ queryKey: ['studio-members'], queryFn: studioMembersService.list });
}

export function useInviteStudioMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: InviteStudioMemberInput) => studioMembersService.invite(input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['studio-members'] }),
        queryClient.invalidateQueries({ queryKey: ['roles'] }),
        queryClient.invalidateQueries({ queryKey: ['audit-logs', 'studio-access'] }),
      ]);
    },
  });
}

export function useUpdateStudioMemberRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateStudioMemberRoleInput & { id: string }) =>
      studioMembersService.updateRole(id, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['studio-members'] }),
        queryClient.invalidateQueries({ queryKey: ['roles'] }),
        queryClient.invalidateQueries({ queryKey: ['audit-logs', 'studio-access'] }),
      ]);
    },
  });
}

export function useStudioAccessAuditLogs() {
  return useQuery({
    queryKey: ['audit-logs', 'studio-access'],
    queryFn: auditService.listStudioAccess,
  });
}

export function useRolePermissionMatrix() {
  return useQuery({ queryKey: ['permissions'], queryFn: permissionsService.matrix });
}

export function useUpdateRolePermissions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ role, permissions }: UpdateRolePermissionsInput & { role: RoleId }) =>
      permissionsService.updateRole(role, { permissions }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['permissions'] }),
        queryClient.invalidateQueries({ queryKey: ['roles'] }),
        queryClient.invalidateQueries({ queryKey: ['audit-logs', 'studio-access'] }),
      ]);
    },
  });
}

export function useRoles() {
  return useQuery({ queryKey: ['roles'], queryFn: rolesService.list });
}

export function useRole(roleId: RoleId) {
  return useQuery({
    queryKey: ['roles', roleId],
    queryFn: () => rolesService.get(roleId),
  });
}

export function useCreateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateStudioRoleInput) => rolesService.create(input),
    onSuccess: async (role) => {
      queryClient.setQueryData(['roles', role.id], role);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['roles'] }),
        queryClient.invalidateQueries({ queryKey: ['permissions'] }),
        queryClient.invalidateQueries({ queryKey: ['audit-logs', 'studio-access'] }),
      ]);
    },
  });
}

export function useUpdateStudioRolePermissions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ roleId, permissions }: UpdateRolePermissionsInput & { roleId: RoleId }) =>
      rolesService.updatePermissions(roleId, { permissions }),
    onSuccess: async (role) => {
      queryClient.setQueryData(['roles', role.id], role);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['roles'] }),
        queryClient.invalidateQueries({ queryKey: ['permissions'] }),
        queryClient.invalidateQueries({ queryKey: ['audit-logs', 'studio-access'] }),
      ]);
    },
  });
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
