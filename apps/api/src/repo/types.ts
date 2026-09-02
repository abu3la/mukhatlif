import type {
  ArticleAuthorCandidate,
  Article,
  ArticleStatus,
  Episode,
  EpisodeStatus,
  Follow,
  FormNotificationStatus,
  FormSubmission,
  FormSubmissionPayloadByType,
  FormSubmissionSourceMetadata,
  FormSubmissionStatus,
  FormSubmissionType,
  Guest,
  GuestAppearance,
  GuestDirectory,
  GuestSocial,
  HomepageWeeklyEpisodesSettings,
  ListQuery,
  NewsletterConsentEvent,
  NewsletterConsentEventKind,
  NewsletterSubscriberListItem,
  NewsletterSubscription,
  NewsletterSubscriptionRequestRecord,
  NewsletterSubscriptionSourceMetadata,
  NewsletterSubscriptionSyncStatus,
  PageResult,
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
  StudioAudienceSummary,
  StudioContentSummary,
  StudioRole,
  SubscriberUser,
  Subscription,
  SubscriptionStatus,
  User,
} from '@mukhtalif/types';
import type {
  CreateEpisodeInput,
  CreateGuestInput,
  CreateGuestSocialInput,
  CreateShowInput,
  CreateStudioRoleInput,
  CreateSubscriptionInput,
  InviteStudioMemberInput,
  UpdateEpisodeInput,
  UpdateGuestInput,
  UpdateGuestSocialInput,
  UpdateFormSubmissionInput,
  UpdateHomepageWeeklyEpisodesSettingsInput,
  UpdateShowInput,
} from '@mukhtalif/validation';
import type {
  ResolvedCreateArticleInput,
  ResolvedUpdateArticleInput,
} from '../publishing/article-record';

export interface EpisodeFilter {
  showId?: string;
  status?: EpisodeStatus;
  /** Inclusive ISO lower bound for publishAt. */
  publishedFrom?: string;
  /** Inclusive ISO upper bound for publishAt. */
  publishedTo?: string;
}

export type UpdateHomepageWeeklyEpisodesSettingsResult =
  | { status: 'updated'; settings: HomepageWeeklyEpisodesSettings }
  | { status: 'conflict'; settings: HomepageWeeklyEpisodesSettings };

export interface ArticleFilter {
  status?: ArticleStatus;
}

/** Storage-facing record used to build a privacy-safe public guest card. */
export interface PublishedGuestSummaryRecord {
  guest: Guest;
  episodeCount: number;
}

/**
 * Storage-facing public profile source. Repositories guarantee every episode
 * is published; the route still owns the final field allowlist.
 */
export interface PublishedGuestProfileRecord {
  guest: Guest;
  socials: GuestSocial[];
  episodes: Episode[];
}

export interface FormSubmissionFilter {
  type?: FormSubmissionType;
  status?: FormSubmissionStatus;
  assigneeId?: string;
}

export interface NewsletterSubscriberFilter {
  localStatus?: NewsletterConsentEventKind;
  mailchimpStatus?: NewsletterSubscriptionSyncStatus;
}

export type LegacyRedirectStatusCode = 301 | 302 | 307 | 308;

/**
 * The only redirect fields allowed to cross the public API boundary.
 * Import provenance, source labels, row IDs, and timestamps stay private.
 */
export interface LegacyRedirectResolution {
  destination: string;
  statusCode: LegacyRedirectStatusCode;
}

export type CreateFormSubmissionRecordInput = {
  [Type in FormSubmissionType]: {
    type: Type;
    payload: FormSubmissionPayloadByType[Type];
    sourceMetadata: FormSubmissionSourceMetadata;
  };
}[FormSubmissionType];

export interface CreateNewsletterSubscriptionRequestRecordInput {
  email: string;
  firstName?: string;
  consentAcceptedAt: string;
  sourceMetadata: NewsletterSubscriptionSourceMetadata;
}

export type CompletedNewsletterSubscriptionSyncStatus = Extract<
  NewsletterSubscriptionSyncStatus,
  'synced' | 'failed' | 'unconfigured'
>;

export interface FormNotificationClaim {
  submission: FormSubmission;
  claimToken: string;
}

export interface FormSubmissionRateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export type CompletedFormNotificationStatus = Exclude<
  FormNotificationStatus,
  'pending' | 'sending'
>;

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

export type CreateGuestSocialResult =
  { status: 'created'; social: GuestSocial } | { status: 'guest_not_found' | 'duplicate_platform' };

export type UpdateGuestSocialResult =
  { status: 'updated'; social: GuestSocial } | { status: 'not_found' | 'duplicate_platform' };

export type LinkGuestAppearanceResult =
  | { status: 'linked' | 'already_linked'; appearance: GuestAppearance }
  | { status: 'guest_not_found' | 'episode_not_found' };

export type AcceptStudioInvitationResult =
  | { status: 'accepted'; member: StudioMemberAccess }
  | { status: 'not_found' | 'already_active' | 'failed' };

export interface Repository {
  /** Exact, active-only lookup for a canonical legacy request path. */
  resolveLegacyRedirect(sourcePath: string): Promise<LegacyRedirectResolution | null>;

  /** Application-user identity and subscriber data. */
  getUser(id: string): Promise<User | null>;
  getUserByAuthId(authUserId: string): Promise<User | null>;
  listSubscriberUsers(): Promise<SubscriberUser[]>;
  listSubscriberUsersPage(query: ListQuery): Promise<PageResult<SubscriberUser>>;

  /** Studio membership and access administration. */
  getStudioMember(id: string): Promise<StudioMember | null>;
  getStudioMemberByAuthId(authUserId: string): Promise<StudioMember | null>;
  listStudioMembers(): Promise<StudioMemberAccess[]>;
  listStudioMembersPage(query: ListQuery): Promise<PageResult<StudioMemberAccess>>;
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
  /**
   * Resolves the Studio membership for a verified Auth identity so the
   * acceptance screen can render before any password is submitted.
   */
  getStudioMemberAccessByAuthId(authUserId: string): Promise<StudioMemberAccess | null>;
  /**
   * Marks the invitation accepted. The password must already have been set
   * through Supabase Auth, so a failure here leaves a retryable pending row
   * rather than an active member who cannot sign in.
   */
  acceptStudioInvitation(
    authUserId: string,
    requestId: string,
  ): Promise<AcceptStudioInvitationResult>;
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
  /** Paged and searchable variant used by the opt-in list envelope. */
  listShowsPage(query: ListQuery): Promise<PageResult<Show>>;
  getShow(id: string): Promise<Show | null>;
  getShowBySlug(slug: string): Promise<Show | null>;
  createShow(input: CreateShowInput): Promise<Show>;
  updateShow(id: string, input: UpdateShowInput): Promise<Show | null>;

  getHomepageWeeklyEpisodesSettings(): Promise<HomepageWeeklyEpisodesSettings>;
  updateHomepageWeeklyEpisodesSettings(
    input: UpdateHomepageWeeklyEpisodesSettingsInput,
  ): Promise<UpdateHomepageWeeklyEpisodesSettingsResult>;

  listEpisodes(filter: EpisodeFilter): Promise<Episode[]>;
  listEpisodesPage(filter: EpisodeFilter, query: ListQuery): Promise<PageResult<Episode>>;
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

  /**
   * Guests. The directory read returns all three collections together because
   * the Studio renders a guest, its links, and its appearances as one view.
   */
  readGuestDirectory(): Promise<GuestDirectory>;
  listGuestsPage(query: ListQuery): Promise<PageResult<Guest>>;
  listPublishedGuestsPage(query: ListQuery): Promise<PageResult<PublishedGuestSummaryRecord>>;
  getPublishedGuestProfile(idOrSlug: string): Promise<PublishedGuestProfileRecord | null>;
  getGuest(id: string): Promise<Guest | null>;
  getGuestBySlug(slug: string): Promise<Guest | null>;
  createGuest(slug: string, input: CreateGuestInput): Promise<Guest>;
  updateGuest(id: string, input: UpdateGuestInput): Promise<Guest | null>;
  listGuestSocials(guestId: string): Promise<GuestSocial[]>;
  getGuestSocial(id: string): Promise<GuestSocial | null>;
  createGuestSocial(
    guestId: string,
    input: CreateGuestSocialInput,
  ): Promise<CreateGuestSocialResult>;
  updateGuestSocial(id: string, input: UpdateGuestSocialInput): Promise<UpdateGuestSocialResult>;
  deleteGuestSocial(id: string): Promise<boolean>;
  listGuestAppearances(guestId: string): Promise<GuestAppearance[]>;
  listEpisodeGuests(episodeId: string): Promise<Guest[]>;
  linkGuestAppearance(guestId: string, episodeId: string): Promise<LinkGuestAppearanceResult>;
  unlinkGuestAppearance(guestId: string, episodeId: string): Promise<boolean>;

  /** Public intake plus the private Studio inbox. */
  listFormSubmissions(filter: FormSubmissionFilter): Promise<FormSubmission[]>;
  listFormSubmissionsPage(
    filter: FormSubmissionFilter,
    query: ListQuery,
  ): Promise<PageResult<FormSubmission>>;
  getFormSubmission(id: string): Promise<FormSubmission | null>;
  createFormSubmission(input: CreateFormSubmissionRecordInput): Promise<FormSubmission>;
  updateFormSubmission(
    id: string,
    input: UpdateFormSubmissionInput,
  ): Promise<FormSubmission | null>;
  claimFormSubmissionRateLimit(
    keyHash: string,
    limit: number,
    windowSeconds: number,
  ): Promise<FormSubmissionRateLimitResult>;
  claimFormSubmissionNotification(
    id: string,
    staleBefore: string,
  ): Promise<FormNotificationClaim | null>;
  completeFormSubmissionNotification(
    id: string,
    claimToken: string,
    status: CompletedFormNotificationStatus,
    errorCode?: string,
    providerMessageId?: string,
  ): Promise<FormSubmission | null>;

  /** Public newsletter consent intake and provider-sync state. */
  recordNewsletterSubscriptionRequest(
    input: CreateNewsletterSubscriptionRequestRecordInput,
  ): Promise<NewsletterSubscriptionRequestRecord>;
  getNewsletterSubscriptionByEmail(email: string): Promise<NewsletterSubscription | null>;
  listNewsletterSubscribersPage(
    filter: NewsletterSubscriberFilter,
    query: ListQuery,
  ): Promise<PageResult<NewsletterSubscriberListItem>>;
  listNewsletterConsentEvents(subscriptionId: string): Promise<NewsletterConsentEvent[]>;
  completeNewsletterSubscriptionSync(
    subscriptionId: string,
    consentEventId: string,
    status: CompletedNewsletterSubscriptionSyncStatus,
    errorCode?: string,
  ): Promise<NewsletterSubscription | null>;

  /** Aggregate counts for the Studio overview, computed without loading rows. */
  getContentSummary(): Promise<StudioContentSummary>;
  getAudienceSummary(): Promise<StudioAudienceSummary>;

  listArticles(filter: ArticleFilter): Promise<Article[]>;
  listArticlesPage(filter: ArticleFilter, query: ListQuery): Promise<PageResult<Article>>;
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
