import type {
  ArticleAuthorCandidate,
  Article,
  ArticleStatus,
  Episode,
  EpisodeStatus,
  Follow,
  Plan,
  MediaAsset,
  ImageMediaMimeType,
  PlaybackProgress,
  PermissionId,
  RoleCreatedAuditLog,
  RoleId,
  RolePermissionAuditLog,
  RolePermissionMatrix,
  Show,
  StudioMember,
  StudioMemberAccess,
  StudioMemberAccessAuditLog,
  StudioMemberInvitationAuditLog,
  StudioRole,
  SubscriberUser,
  Subscription,
  SubscriptionStatus,
  User,
} from '@mukhtalif/types';
import type {
  CreateEpisodeInput,
  CreateShowInput,
  CreateStudioRoleInput,
  CreateSubscriptionInput,
  InviteStudioMemberInput,
  UpdateEpisodeInput,
  UpdateShowInput,
} from '@mukhtalif/validation';
import type {
  ResolvedCreateArticleInput,
  ResolvedUpdateArticleInput,
} from '../publishing/article-record';

export interface EpisodeFilter {
  showId?: string;
  status?: EpisodeStatus;
}

export interface ArticleFilter {
  status?: ArticleStatus;
}

export interface StoredMediaAsset extends Omit<MediaAsset, 'status' | 'publicUrl'> {
  /** Private R2 key. Routes must strip this field before serializing. */
  storageKey: string;
  status: 'pending' | 'uploading' | 'ready';
  expectedByteSize: number;
  uploadStartedAt?: string;
  uploadToken?: string;
}

export interface MediaUploadClaim {
  asset: StoredMediaAsset;
  uploadToken: string;
}

export interface CreateMediaUploadRecordInput {
  id: string;
  mimeType: ImageMediaMimeType;
  fileName: string;
  storageKey: string;
  expectedByteSize: number;
  width: number;
  height: number;
  defaultAlt: string;
  defaultCaption?: string;
  createdAt: string;
}

export type NewsletterSendClaimResult =
  | { status: 'claimed'; article: Article; sendToken: string }
  | { status: 'already_sent'; article: Article }
  | {
      status:
        'not_found' | 'not_ready' | 'sync_required' | 'send_in_progress' | 'confirmation_stale';
      article?: Article;
    };

export type NewsletterSyncClaimResult =
  | { status: 'claimed'; article: Article; syncToken: string }
  | {
      status:
        | 'not_found'
        | 'not_ready'
        | 'sync_in_progress'
        | 'sync_unknown'
        | 'sent'
        | 'version_conflict';
      article?: Article;
    };

export type ChangeStudioMemberRoleResult =
  | { status: 'updated' | 'unchanged'; member: StudioMemberAccess }
  | {
      status:
        | 'forbidden'
        | 'not_found'
        | 'role_not_found'
        | 'protected_role'
        | 'self_demotion'
        | 'last_admin';
    };

export type ChangeRolePermissionsResult =
  | { status: 'updated' | 'unchanged'; role: StudioRole }
  | { status: 'forbidden' | 'not_found' | 'immutable_role' | 'invalid_permissions' };

export type CreateRoleResult =
  | { status: 'created'; role: StudioRole }
  | { status: 'forbidden' | 'duplicate_name' | 'invalid_input' | 'invalid_permissions' };

export type InviteStudioMemberResult =
  | { status: 'created'; member: StudioMemberAccess }
  | {
      status:
        | 'forbidden'
        | 'duplicate_email'
        | 'auth_identity_exists'
        | 'unavailable'
        | 'invite_failed'
        | 'provision_failed'
        | 'partial_failure'
        | 'role_not_found'
        | 'protected_role';
    };

export interface Repository {
  /** Application-user identity and subscriber data. */
  getUser(id: string): Promise<User | null>;
  getUserByAuthId(authUserId: string): Promise<User | null>;
  listSubscriberUsers(): Promise<SubscriberUser[]>;

  /** Studio membership and access administration. */
  getStudioMember(id: string): Promise<StudioMember | null>;
  getStudioMemberByAuthId(authUserId: string): Promise<StudioMember | null>;
  listStudioMembers(): Promise<StudioMemberAccess[]>;
  inviteStudioMember(
    actorStudioMemberId: string,
    input: InviteStudioMemberInput,
    requestId: string,
    redirectTo?: string,
  ): Promise<InviteStudioMemberResult>;
  changeStudioMemberRole(
    actorStudioMemberId: string,
    targetStudioMemberId: string,
    role: RoleId,
    requestId: string,
  ): Promise<ChangeStudioMemberRoleResult>;
  listStudioMemberAccessAuditLogs(): Promise<StudioMemberAccessAuditLog[]>;
  listStudioMemberInvitationAuditLogs(): Promise<StudioMemberInvitationAuditLog[]>;

  listRoles(): Promise<StudioRole[]>;
  getRole(roleId: RoleId): Promise<StudioRole | null>;
  createRole(
    actorStudioMemberId: string,
    input: CreateStudioRoleInput,
    requestId: string,
  ): Promise<CreateRoleResult>;
  resolveRolePermissions(role: RoleId): Promise<PermissionId[]>;
  getRolePermissionMatrix(): Promise<RolePermissionMatrix>;
  changeRolePermissions(
    actorStudioMemberId: string,
    role: RoleId,
    permissions: PermissionId[],
    requestId: string,
  ): Promise<ChangeRolePermissionsResult>;
  listRoleCreatedAuditLogs(): Promise<RoleCreatedAuditLog[]>;
  listRolePermissionAuditLogs(): Promise<RolePermissionAuditLog[]>;

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

  listReadyMediaAssets(): Promise<StoredMediaAsset[]>;
  getMediaAsset(id: string): Promise<StoredMediaAsset | null>;
  createMediaUpload(input: CreateMediaUploadRecordInput): Promise<StoredMediaAsset>;
  claimMediaUpload(id: string, staleBefore: string): Promise<MediaUploadClaim | null>;
  completeMediaUpload(
    id: string,
    byteSize: number,
    uploadToken: string,
    storageKey: string,
  ): Promise<StoredMediaAsset | null>;
  releaseMediaUpload(id: string, uploadToken: string): Promise<void>;

  listArticles(filter: ArticleFilter): Promise<Article[]>;
  listArticleAuthorCandidates(): Promise<ArticleAuthorCandidate[]>;
  getArticle(id: string): Promise<Article | null>;
  getArticleBySlug(slug: string): Promise<Article | null>;
  createArticle(input: ResolvedCreateArticleInput): Promise<Article>;
  updateArticle(id: string, input: ResolvedUpdateArticleInput): Promise<Article | null>;
  updateArticleStatus(
    id: string,
    status: ArticleStatus,
    expectedVersion: number,
    publishedAt?: string,
  ): Promise<Article | null>;
  claimArticleNewsletterSync(
    id: string,
    expectedVersion: number,
  ): Promise<NewsletterSyncClaimResult>;
  setArticleNewsletterCampaign(
    id: string,
    campaignId: string,
    syncToken: string,
  ): Promise<Article | null>;
  markArticleNewsletterSynced(
    id: string,
    campaignId: string,
    expectedVersion: number,
    syncToken: string,
  ): Promise<Article | null>;
  claimArticleNewsletterSend(
    id: string,
    expectedVersion: number,
    expectedCampaignId: string,
  ): Promise<NewsletterSendClaimResult>;
  touchArticleNewsletterSendLease(id: string, sendToken: string): Promise<Article | null>;
  completeArticleNewsletterSend(
    id: string,
    sentAt: string,
    sendToken: string,
  ): Promise<Article | null>;
  reconcileArticleNewsletterSent(id: string, sentAt: string): Promise<Article | null>;
  releaseArticleNewsletterSend(id: string, sendToken: string): Promise<Article | null>;
  recoverStaleArticleNewsletterSend(id: string, staleBefore: string): Promise<Article | null>;
  releaseArticleNewsletterSync(id: string, syncToken: string): Promise<Article | null>;
  markArticleNewsletterSyncUnknown(id: string, syncToken: string): Promise<Article | null>;

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
  upsertProgress(userId: string, episodeId: string, positionSec: number): Promise<PlaybackProgress>;
}
