import type {
  ImageMediaMimeType,
  MediaAsset,
} from '@mukhtalif/types';
import type { ArticleAuthorInput } from '@mukhtalif/validation';
import type {
  AdminStudioData,
  AdminStudioMemberDirectory,
  AdminContentWorkspace,
  AdminGuestDirectory,
  AdminSubscriberDirectory,
  AdminViewer,
  Article,
  ArticleAuthorCandidate,
  ArticleAuthorPlacement,
  ArticleId,
  ArticleStatus,
  Episode,
  EpisodeId,
  EpisodeStatus,
  Guest,
  GuestAppearance,
  GuestId,
  GuestSocial,
  GuestSocialId,
  IsoDateTime,
  MailchimpCapability,
  NewsletterPreview,
  PlusPlan,
  PermissionId,
  RoleId,
  RichTextDocument,
  Show,
  ShowId,
  SocialPlatform,
  Subscription,
  SubscriptionId,
  SubscriptionStatus,
  StudioMember,
  StudioMemberId,
  StudioRole,
  UserId,
} from '@/lib';

export type AdminRepositoryKind = 'fixture' | 'hono';

export type AdminRepositoryCapability =
  | 'core-dashboard'
  | 'content-mutations'
  | 'subscription-mutations'
  | 'episode-audio-upload'
  | 'guest-management'
  | 'admin-analytics'
  | 'access-management';

export type AdminRepositoryCapabilities = Readonly<
  Record<AdminRepositoryCapability, boolean>
>;

export type { AdminContentWorkspace, AdminGuestDirectory, AdminSubscriberDirectory } from '@/lib';

export interface AdminAnalyticsSnapshot {
  readonly asOf: IsoDateTime;
  readonly source: 'fixture-derived' | 'analytics-service';
  readonly newUsersLast30Days: number;
  readonly playbackStartsLast30Days: number | null;
  readonly freeToPlusConversionRate: number;
  readonly monthlyRecurringRevenueHalalas: number;
}

export interface AdminNewsletterCampaignResult {
  readonly article: Article;
  readonly operation: 'created' | 'updated';
}

export interface AdminNewsletterSendResult {
  readonly article: Article;
  readonly operation: 'accepted' | 'sent' | 'already_sent' | 'not_sent';
}

export interface CreateShowCommand {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly host: string;
  readonly category: string;
  readonly premium: boolean;
  readonly artworkUrl?: string;
}

export type UpdateShowCommand = Partial<CreateShowCommand>;

export interface CreateEpisodeCommand {
  readonly showId: ShowId;
  readonly title: string;
  readonly notes: string;
  readonly episodeNumber: number;
  readonly durationMinutes: number;
  readonly premium: boolean;
  readonly audioUrl?: string;
}

export type UpdateEpisodeCommand = Partial<Omit<CreateEpisodeCommand, 'showId'>>;

export interface EpisodeStatusCommand {
  readonly status: EpisodeStatus;
  readonly scheduledAt?: IsoDateTime;
}

export interface EpisodeAudioCommand {
  readonly body: Blob;
  readonly fileName: string;
  readonly contentType?: string;
}

export type ArticleImageMimeType = ImageMediaMimeType;

/**
 * Image metadata exposed to the Studio. Storage keys never cross this boundary;
 * the API provides a derived public URL only after the upload is ready.
 */
export type ArticleMediaAsset = MediaAsset;

export interface UploadArticleImageCommand {
  readonly body: Blob;
  readonly fileName: string;
  readonly mimeType: ArticleImageMimeType;
  readonly byteSize: number;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
  readonly caption?: string;
  readonly onProgress?: (percentage: number) => void;
}

export interface CreateArticleCommand {
  readonly slug: string;
  readonly title: string;
  readonly author: ArticleAuthorInput;
  readonly authorPlacement: ArticleAuthorPlacement;
  readonly excerpt?: string;
  readonly coverUrl?: string;
  readonly coverAlt?: string;
  readonly content: RichTextDocument;
  readonly seo: {
    readonly title?: string;
    readonly description?: string;
    readonly canonicalUrl?: string;
    readonly socialTitle?: string;
    readonly socialDescription?: string;
    readonly socialImageUrl?: string;
    readonly noIndex: boolean;
  };
  readonly newsletter: {
    readonly enabled: boolean;
    readonly subject?: string;
    readonly preheader?: string;
  };
}

export type UpdateArticleCommand = Partial<CreateArticleCommand> & {
  readonly expectedVersion: number;
};

export interface CreateSubscriptionCommand {
  readonly userId: UserId;
  readonly planId: PlusPlan['id'];
}

export interface CreateStudioMemberCommand {
  readonly name: string;
  readonly email: string;
  readonly role: RoleId;
  readonly locale: 'ar' | 'en';
}

/** What the acceptance screen learns about the caller's own invitation. */
export interface AdminInvitationState {
  readonly status: 'invited' | 'active' | 'none';
  readonly email?: string;
  readonly displayName?: string;
  readonly roleName?: string;
}

export interface CreateRoleCommand {
  readonly name: string;
  readonly description: string;
  readonly permissions: readonly PermissionId[];
}

export interface CreateGuestCommand {
  readonly name?: string;
  readonly role?: string;
  readonly city?: string;
  readonly email?: string;
  readonly bio?: string;
  readonly photoUrl?: string;
}

export type UpdateGuestCommand = Partial<CreateGuestCommand>;

export interface CreateGuestSocialCommand {
  readonly guestId: GuestId;
  readonly platform: SocialPlatform;
  readonly handle: string;
}

export interface UpdateGuestSocialCommand {
  readonly platform?: SocialPlatform;
  readonly handle?: string;
}

/**
 * Application-facing data contract for the admin studio.
 *
 * Core API data, guests, and analytics are intentionally separate reads. This
 * prevents a production adapter from disguising an absent endpoint with empty
 * fixture collections. `readDashboard` is the strict all-data convenience read.
 */
export interface AdminRepository {
  readonly kind: AdminRepositoryKind;
  readonly capabilities: AdminRepositoryCapabilities;

  readViewer(): Promise<AdminViewer>;
  readContentWorkspace(): Promise<AdminContentWorkspace>;
  readSubscriberDirectory(): Promise<AdminSubscriberDirectory>;
  readStudioMemberDirectory(): Promise<AdminStudioMemberDirectory>;
  readRoles(): Promise<StudioRole[]>;
  readRole(id: RoleId): Promise<StudioRole>;
  readGuestDirectory(): Promise<AdminGuestDirectory>;
  readAnalytics(): Promise<AdminAnalyticsSnapshot>;
  readDashboard(): Promise<AdminStudioData>;

  createShow(command: CreateShowCommand): Promise<Show>;
  updateShow(id: ShowId, command: UpdateShowCommand): Promise<Show>;

  createEpisode(command: CreateEpisodeCommand): Promise<Episode>;
  updateEpisode(id: EpisodeId, command: UpdateEpisodeCommand): Promise<Episode>;
  transitionEpisode(id: EpisodeId, command: EpisodeStatusCommand): Promise<Episode>;
  uploadEpisodeAudio(id: EpisodeId, command: EpisodeAudioCommand): Promise<Episode>;

  listArticleMedia(): Promise<ArticleMediaAsset[]>;
  listArticleAuthors(): Promise<ArticleAuthorCandidate[]>;
  uploadArticleImage(command: UploadArticleImageCommand): Promise<ArticleMediaAsset>;

  createArticle(command: CreateArticleCommand): Promise<Article>;
  updateArticle(id: ArticleId, command: UpdateArticleCommand): Promise<Article>;
  transitionArticle(
    id: ArticleId,
    status: ArticleStatus,
    expectedVersion: number,
  ): Promise<Article>;
  getMailchimpCapability(): Promise<MailchimpCapability>;
  previewArticleNewsletter(id: ArticleId): Promise<NewsletterPreview>;
  syncArticleNewsletterCampaign(
    id: ArticleId,
    expectedVersion: number,
  ): Promise<AdminNewsletterCampaignResult>;
  sendArticleNewsletter(
    id: ArticleId,
    audienceConfirmationToken: string,
    expectedVersion: number,
    expectedCampaignId: string,
  ): Promise<AdminNewsletterSendResult>;
  reconcileArticleNewsletter(id: ArticleId): Promise<AdminNewsletterSendResult>;

  createSubscription(command: CreateSubscriptionCommand): Promise<Subscription>;
  transitionSubscription(
    id: SubscriptionId,
    status: SubscriptionStatus,
  ): Promise<Subscription>;

  /**
   * Invitation acceptance. Both reads authenticate on the verified Auth
   * identity rather than a Studio permission, because an invitee holds none
   * until they accept.
   */
  readInvitation(): Promise<AdminInvitationState>;
  acceptInvitation(password: string): Promise<void>;

  createStudioMember(command: CreateStudioMemberCommand): Promise<StudioMember>;
  updateStudioMemberRole(id: StudioMemberId, role: RoleId): Promise<StudioMember>;
  createRole(command: CreateRoleCommand): Promise<StudioRole>;
  updateRolePermissions(
    role: RoleId,
    permissions: readonly PermissionId[],
  ): Promise<StudioRole>;

  createGuest(command?: CreateGuestCommand): Promise<Guest>;
  updateGuest(id: GuestId, command: UpdateGuestCommand): Promise<Guest>;
  createGuestSocial(command: CreateGuestSocialCommand): Promise<GuestSocial>;
  updateGuestSocial(
    id: GuestSocialId,
    command: UpdateGuestSocialCommand,
  ): Promise<GuestSocial>;
  removeGuestSocial(id: GuestSocialId): Promise<void>;
  linkGuestAppearance(guestId: GuestId, episodeId: EpisodeId): Promise<GuestAppearance>;
  unlinkGuestAppearance(guestId: GuestId, episodeId: EpisodeId): Promise<void>;
}

export type {
  AdminStudioMemberDirectory,
  AdminStudioData,
  AdminViewer,
  Article,
  ArticleId,
  Episode,
  EpisodeId,
  Guest,
  GuestId,
  GuestSocial,
  GuestSocialId,
  PlusPlan,
  MailchimpCapability,
  NewsletterPreview,
  RichTextDocument,
  RoleId,
  Show,
  ShowId,
  Subscription,
  SubscriptionId,
  StudioMember,
  StudioMemberId,
  StudioRole,
  UserId,
};
