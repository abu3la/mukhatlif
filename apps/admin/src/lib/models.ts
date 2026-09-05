import {
  ARTICLE_STATUSES as API_ARTICLE_STATUSES,
  EPISODE_STATUSES as API_EPISODE_STATUSES,
  SUBSCRIPTION_STATUSES as API_SUBSCRIPTION_STATUSES,
  type ArticleStatus as ApiArticleStatus,
  type ArticleAuthor as ApiArticleAuthor,
  type ArticleAuthorCandidate as ApiArticleAuthorCandidate,
  type ArticleAuthorPlacement as ApiArticleAuthorPlacement,
  DEFAULT_ARTICLE_AUTHOR_PLACEMENT as API_DEFAULT_ARTICLE_AUTHOR_PLACEMENT,
  type ArticleNewsletter as ApiArticleNewsletter,
  type ArticleSeo as ApiArticleSeo,
  type EpisodeStatus as ApiEpisodeStatus,
  type HomepageWeeklyEpisodesSettings as ApiHomepageWeeklyEpisodesSettings,
  type MailchimpCapability as ApiMailchimpCapability,
  type NewsletterPreview as ApiNewsletterPreview,
  type NewsletterCampaignResult as ApiNewsletterCampaignResult,
  type NewsletterSendResult as ApiNewsletterSendResult,
  type NewsletterStatus as ApiNewsletterStatus,
  type PermissionId as ApiPermissionId,
  type RichTextDocument as ApiRichTextDocument,
  type RichTextNode as ApiRichTextNode,
  type RolePermissionMatrix as ApiRolePermissionMatrix,
  type StudioPageId as ApiStudioPageId,
  type SubscriptionStatus as ApiSubscriptionStatus,
} from '@mukhtalif/types';

/** Canonical status vocabulary is owned by the shared API contracts. */
export const EPISODE_STATUSES = API_EPISODE_STATUSES;
export type EpisodeStatus = ApiEpisodeStatus;

export const ARTICLE_STATUSES = API_ARTICLE_STATUSES;
export type ArticleStatus = ApiArticleStatus;
export type ArticleAuthor = ApiArticleAuthor;
export type ArticleAuthorCandidate = ApiArticleAuthorCandidate;
export type ArticleAuthorPlacement = ApiArticleAuthorPlacement;
export const DEFAULT_ARTICLE_AUTHOR_PLACEMENT = API_DEFAULT_ARTICLE_AUTHOR_PLACEMENT;
export type ArticleSeo = ApiArticleSeo;
export type ArticleNewsletter = ApiArticleNewsletter;
export type NewsletterStatus = ApiNewsletterStatus;
export type RichTextDocument = ApiRichTextDocument;
export type RichTextNode = ApiRichTextNode;
export type MailchimpCapability = ApiMailchimpCapability;
export type NewsletterPreview = ApiNewsletterPreview;
export type NewsletterCampaignResult = ApiNewsletterCampaignResult;
export type NewsletterSendResult = ApiNewsletterSendResult;
export type HomepageWeeklyEpisodesSettings = ApiHomepageWeeklyEpisodesSettings;

export const SUBSCRIPTION_STATUSES = API_SUBSCRIPTION_STATUSES;
export type SubscriptionStatus = ApiSubscriptionStatus;

export const SOCIAL_PLATFORMS = ['x', 'linkedin', 'instagram', 'youtube', 'website'] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export type ShowId = `show_${string}`;
export type EpisodeId = `episode_${string}`;
export type ArticleId = `article_${string}`;
export type GuestId = `guest_${string}`;
export type GuestSocialId = `guest_social_${string}`;
export type UserId = `user_${string}`;
export type StudioMemberId = `studio_member_${string}`;
export type SubscriptionId = `subscription_${string}`;
export type PlusPlanId = `plan_${string}`;

/**
 * Role identifiers are data, not a closed UI enum. The three shared values are
 * only the system seeds; administrators can create additional role IDs.
 */
export type RoleId = string;
export type AdminUserRole = RoleId;
export type PermissionId = ApiPermissionId;
export type RolePermissionMatrix = ApiRolePermissionMatrix;
export type StudioPageId = ApiStudioPageId;

/** ISO-8601 timestamp. Runtime validation happens at API and lifecycle boundaries. */
export type IsoDateTime = string;

export interface AdminViewer {
  id: StudioMemberId;
  name: string;
  email: string;
  role: AdminUserRole;
  roleName: string;
  permissions: PermissionId[];
  avatarInitial: string;
}

export interface Show {
  id: ShowId;
  slug: string;
  name: string;
  host: string;
  category: string;
  premium: boolean;
  artworkUrl?: string;
  createdAt: IsoDateTime;
}

export interface Episode {
  id: EpisodeId;
  /** Canonical API identifier, distinct from the Studio's encoded UI id. */
  remoteId?: string;
  title: string;
  showId: ShowId;
  episodeNumber: number | null;
  durationMinutes: number | null;
  status: EpisodeStatus;
  premium: boolean;
  notes: string;
  audioFileName?: string;
  youtubeVideoId?: string | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  scheduledAt?: IsoDateTime;
  publishedAt?: IsoDateTime;
  archivedAt?: IsoDateTime;
}

export interface Article {
  id: ArticleId;
  slug: string;
  title: string;
  author: ArticleAuthor;
  authorPlacement: ArticleAuthorPlacement;
  summary: string;
  excerpt: string;
  coverUrl?: string;
  coverAlt?: string;
  content: RichTextDocument;
  contentHtml: string;
  body: string;
  seo: ArticleSeo;
  status: ArticleStatus;
  newsletter: ArticleNewsletter;
  version: number;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  publishedAt?: IsoDateTime;
}

export interface Guest {
  id: GuestId;
  slug: string;
  name: string;
  role: string;
  city: string;
  email: string;
  bio: string;
  photoUrl?: string;
  createdAt: IsoDateTime;
}

export interface GuestSocial {
  id: GuestSocialId;
  guestId: GuestId;
  platform: SocialPlatform;
  handle: string;
}

export interface GuestAppearance {
  guestId: GuestId;
  episodeId: EpisodeId;
}

/** An application user. App users never carry Studio roles or permissions. */
export interface User {
  id: UserId;
  name: string;
  email: string;
  joinedAt: IsoDateTime;
}

export type SubscriberUser = User;

/** A member who can sign in to the administration Studio. */
export interface StudioMember {
  id: StudioMemberId;
  name: string;
  email: string;
  role: AdminUserRole;
  roleName: string;
  joinedAt: IsoDateTime;
}

export interface PlusPlan {
  id: PlusPlanId;
  name: string;
  priceHalalas: number;
  currency: 'SAR';
  interval: 'month';
}

export interface Subscription {
  id: SubscriptionId;
  userId: UserId;
  planId: PlusPlanId;
  status: SubscriptionStatus;
  priceHalalas: number;
  startedAt: IsoDateTime;
  updatedAt: IsoDateTime;
  renewAt?: IsoDateTime;
  paymentFailedAt?: IsoDateTime;
  canceledAt?: IsoDateTime;
}

export interface StudioRole {
  id: RoleId;
  name: string;
  description: string;
  isSystem: boolean;
  isProtected: boolean;
  permissions: PermissionId[];
  memberCount: number;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface AdminStudioData {
  /** The reference date used by the supplied design handoff. */
  asOf: IsoDateTime;
  viewer: AdminViewer;
  plusPlan: PlusPlan;
  shows: Show[];
  episodes: Episode[];
  articles: Article[];
  homepageWeeklyEpisodesSettings: HomepageWeeklyEpisodesSettings;
  guests: Guest[];
  guestSocials: GuestSocial[];
  guestAppearances: GuestAppearance[];
  studioMembers: StudioMember[];
  users: User[];
  subscriptions: Subscription[];
}

export type AdminContentWorkspace = Pick<
  AdminStudioData,
  'asOf' | 'shows' | 'episodes' | 'articles' | 'homepageWeeklyEpisodesSettings'
>;

export type AdminGuestDirectory = Pick<
  AdminStudioData,
  'guests' | 'guestSocials' | 'guestAppearances'
>;

export type AdminStudioContentData = AdminContentWorkspace & {
  /** Null when the configured repository does not expose guest management. */
  readonly guestDirectory: AdminGuestDirectory | null;
};

export interface AdminSubscriberDirectory {
  plusPlan: PlusPlan;
  users: SubscriberUser[];
  subscriptions: Subscription[];
}

export type AdminStudioMemberDirectory = Pick<AdminStudioData, 'studioMembers'>;
