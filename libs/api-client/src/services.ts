import type {
  Article,
  ArticleAuthorCandidate,
  ArticleStatus,
  AccessAuditLog,
  AuthenticatedStudioMember,
  AuthenticatedUser,
  Episode,
  EpisodeStatus,
  Follow,
  Plan,
  PlaybackProgress,
  Show,
  SubscriberUser,
  Subscription,
  RolePermissionMatrix,
  RolePermissionSet,
  RoleId,
  StudioRole,
  StudioMemberAccess,
  MailchimpCapability,
  NewsletterCampaignResult,
  NewsletterPreview,
  NewsletterSendResult,
  PublishedArticle,
  MediaAsset,
  MediaUploadReservation,
} from '@mukhtalif/types';
import type {
  CreateStudioRoleInput,
  CreateArticleInput,
  CreateEpisodeInput,
  CreateShowInput,
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
  CreateMediaUploadInput,
} from '@mukhtalif/validation';
import { apiUrl, request, uploadRequest } from './client';

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

function updateStudioRolePermissions(
  roleId: RoleId,
  input: UpdateRolePermissionsInput,
): Promise<StudioRole> {
  return request<StudioRole>(`/permissions/${encodeURIComponent(roleId)}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
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
  list: () => request<PublishedArticle[]>('/articles'),
  get: (slug: string) => request<PublishedArticle>(`/articles/${encodeURIComponent(slug)}`),
};

export const studioArticlesService = {
  list: (filter: ArticleFilter = {}) => request<Article[]>(`/studio/articles${toQuery(filter)}`),
  listAuthorCandidates: () => request<ArticleAuthorCandidate[]>('/studio/articles/authors'),
  get: (idOrSlug: string) => request<Article>(`/studio/articles/${encodeURIComponent(idOrSlug)}`),
  create: (input: CreateArticleInput) =>
    request<Article>('/studio/articles', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: UpdateArticleInput) =>
    request<Article>(`/studio/articles/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  updateStatus: (id: string, input: { status: Article['status']; expectedVersion: number }) =>
    request<Article>(`/studio/articles/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  mailchimpCapability: () => request<MailchimpCapability>('/studio/articles/mailchimp/capability'),
  previewNewsletter: (id: string) =>
    request<NewsletterPreview>(`/studio/articles/${encodeURIComponent(id)}/newsletter/preview`, {
      method: 'POST',
    }),
  syncNewsletterCampaign: (id: string, expectedVersion: number) =>
    request<NewsletterCampaignResult>(
      `/studio/articles/${encodeURIComponent(id)}/newsletter/campaign`,
      { method: 'POST', body: JSON.stringify({ expectedVersion }) },
    ),
  sendNewsletter: (
    id: string,
    audienceConfirmationToken: string,
    expectedVersion: number,
    expectedCampaignId: string,
  ) =>
    request<NewsletterSendResult>(`/studio/articles/${encodeURIComponent(id)}/newsletter/send`, {
      method: 'POST',
      body: JSON.stringify({
        confirmation: 'SEND_NEWSLETTER',
        audienceConfirmationToken,
        expectedVersion,
        expectedCampaignId,
      }),
    }),
  reconcileNewsletter: (id: string) =>
    request<NewsletterSendResult>(
      `/studio/articles/${encodeURIComponent(id)}/newsletter/reconcile`,
      { method: 'POST' },
    ),
};

export const studioMediaService = {
  list: () => request<MediaAsset[]>('/studio/media'),
  reserveUpload: (input: CreateMediaUploadInput) =>
    request<MediaUploadReservation>('/studio/media/uploads', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  uploadContent: (
    uploadUrl: string,
    file: Blob,
    onProgress?: (uploadedBytes: number, totalBytes: number) => void,
  ) => uploadRequest<MediaAsset>(uploadUrl, file, onProgress),
  publicUrl: (id: string) => apiUrl(`/media/${encodeURIComponent(id)}`),
};

export const plansService = {
  list: () => request<Plan[]>('/plans'),
};

export const subscriptionsService = {
  list: () => request<Subscription[]>('/subscriptions'),
  listSubscriberUsers: () => request<SubscriberUser[]>('/subscriber-users'),
  create: (input: CreateSubscriptionInput) =>
    request<Subscription>('/subscriptions', { method: 'POST', body: JSON.stringify(input) }),
  updateStatus: (id: string, input: UpdateSubscriptionStatusInput) =>
    request<Subscription>(`/subscriptions/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
};

export const meService = {
  profile: () => request<AuthenticatedUser>('/me'),
  subscription: () => request<Subscription | null>('/me/subscription'),
};

export const studioMeService = {
  profile: () => request<AuthenticatedStudioMember>('/studio/me'),
};

export const studioMembersService = {
  list: () => request<StudioMemberAccess[]>('/studio-members'),
  invite: (input: InviteStudioMemberInput) =>
    request<StudioMemberAccess>('/studio-members', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateRole: (id: string, input: UpdateStudioMemberRoleInput) =>
    request<StudioMemberAccess>(`/studio-members/${encodeURIComponent(id)}/role`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
};

export const auditService = {
  listStudioAccess: () => request<AccessAuditLog[]>('/audit-logs'),
};

export const permissionsService = {
  matrix: () => request<RolePermissionMatrix>('/permissions'),
  updateRole: async (role: RoleId, input: UpdateRolePermissionsInput) => {
    const updated = await updateStudioRolePermissions(role, input);
    return {
      role: updated.id,
      permissions: updated.permissions,
    } satisfies RolePermissionSet;
  },
};

export const rolesService = {
  list: () => request<StudioRole[]>('/roles'),
  get: (roleId: RoleId) => request<StudioRole>(`/roles/${encodeURIComponent(roleId)}`),
  create: (input: CreateStudioRoleInput) =>
    request<StudioRole>('/roles', { method: 'POST', body: JSON.stringify(input) }),
  updatePermissions: (roleId: RoleId, input: UpdateRolePermissionsInput) =>
    updateStudioRolePermissions(roleId, input),
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
