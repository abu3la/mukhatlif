import {
  NEWSLETTER_STATUSES,
  PERMISSION_IDS,
  isPermissionId,
  isSocialPlatform,
  resolveAudioMediaMimeType,
} from '@mukhtalif/types';
import {
  createStudioRoleSchema,
  richTextDocumentSchema,
  updateRolePermissionsSchema,
} from '@mukhtalif/validation';
import type {
  Article as ApiArticle,
  ArticleAuthor as ApiArticleAuthor,
  ArticleAuthorCandidate as ApiArticleAuthorCandidate,
  ArticleStatus as ApiArticleStatus,
  AuthenticatedStudioMember as ApiAuthenticatedStudioMember,
  Episode as ApiEpisode,
  EpisodeStatus as ApiEpisodeStatus,
  Guest as ApiGuest,
  GuestAppearance as ApiGuestAppearance,
  GuestDirectory as ApiGuestDirectory,
  GuestSocial as ApiGuestSocial,
  PermissionId as ApiPermissionId,
  Plan as ApiPlan,
  Show as ApiShow,
  SubscriberUser as ApiSubscriberUser,
  StudioMemberAccess as ApiStudioMemberAccess,
  Subscription as ApiSubscription,
  SubscriptionStatus as ApiSubscriptionStatus,
  User as ApiUser,
} from '@mukhtalif/types';
import type {
  AdminStudioMemberDirectory,
  AdminContentWorkspace,
  AdminStudioData,
  AdminSubscriberDirectory,
  AdminUserRole,
  AdminViewer,
  Article,
  ArticleAuthorCandidate,
  ArticleId,
  Episode,
  EpisodeId,
  Guest,
  GuestAppearance,
  GuestId,
  GuestSocial,
  GuestSocialId,
  MailchimpCapability,
  NewsletterPreview,
  PlusPlan,
  PermissionId,
  RoleId,
  StudioMember,
  StudioMemberId,
  StudioRole,
  Show,
  ShowId,
  Subscription,
  SubscriptionId,
  SubscriberUser,
  UserId,
} from '@/lib';
import type {
  AdminAnalyticsSnapshot,
  ArticleMediaAsset,
  AdminNewsletterCampaignResult,
  AdminNewsletterSendResult,
  AdminGuestDirectory,
  AdminRepository,
  CreateArticleCommand,
  CreateEpisodeCommand,
  CreateGuestCommand,
  CreateGuestSocialCommand,
  CreateShowCommand,
  CreateSubscriptionCommand,
  CreateStudioMemberCommand,
  CreateRoleCommand,
  EpisodeAudioCommand,
  EpisodeStatusCommand,
  UpdateArticleCommand,
  UpdateEpisodeCommand,
  UpdateGuestCommand,
  UpdateGuestSocialCommand,
  UpdateShowCommand,
  UploadArticleImageCommand,
} from './admin-repository';
import {
  AdminRepositoryError,
  isAdminRepositoryError,
  unsupportedCapability,
} from './repository-error';
import { normalizeCreateStudioMemberCommand } from './studio-member-command';

const HONO_CAPABILITIES = {
  'core-dashboard': true,
  'content-mutations': true,
  'subscription-mutations': true,
  'episode-audio-upload': true,
  'guest-management': true,
  'admin-analytics': false,
  'access-management': true,
} as const;

const EPISODE_STATUSES = new Set<ApiEpisodeStatus>([
  'draft',
  'scheduled',
  'published',
  'archived',
]);
const ARTICLE_STATUSES = new Set<ApiArticleStatus>(['draft', 'published']);
const NEWSLETTER_STATUS_SET = new Set<string>(NEWSLETTER_STATUSES);
const SUBSCRIPTION_STATUSES = new Set<ApiSubscriptionStatus>([
  'active',
  'past_due',
  'canceled',
]);

export interface HonoAdminRepositoryOptions {
  readonly baseUrl: string;
  readonly devUserId?: string;
  readonly getAccessToken?: () => string | null | Promise<string | null>;
  readonly fetch?: typeof fetch;
  readonly createUploadRequest?: () => XMLHttpRequest;
  readonly now?: () => Date;
}

type JsonRecord = Record<string, unknown>;

/**
 * The API accepts only allowlisted audio media types, so an octet-stream
 * fallback would be rejected. The file name is the documented fallback when the
 * browser leaves File.type empty, and audio/mpeg is the last resort for the
 * overwhelmingly common MP3 case.
 */
function audioContentType(command: EpisodeAudioCommand): string {
  return (
    resolveAudioMediaMimeType(command.contentType ?? command.body.type, command.fileName) ??
    'audio/mpeg'
  );
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasString(record: JsonRecord, key: string): boolean {
  return typeof record[key] === 'string';
}

function hasOptionalString(record: JsonRecord, key: string): boolean {
  return record[key] === undefined || typeof record[key] === 'string';
}

function isApiShow(value: unknown): value is ApiShow {
  if (!isRecord(value)) return false;
  return (
    hasString(value, 'id') &&
    hasString(value, 'slug') &&
    hasString(value, 'titleAr') &&
    hasOptionalString(value, 'titleEn') &&
    hasString(value, 'descriptionAr') &&
    hasOptionalString(value, 'descriptionEn') &&
    hasString(value, 'hostName') &&
    hasOptionalString(value, 'artworkUrl') &&
    hasString(value, 'category') &&
    typeof value.premium === 'boolean' &&
    hasString(value, 'createdAt')
  );
}

function isApiEpisode(value: unknown): value is ApiEpisode {
  if (!isRecord(value)) return false;
  return (
    hasString(value, 'id') &&
    hasString(value, 'showId') &&
    hasString(value, 'titleAr') &&
    hasOptionalString(value, 'titleEn') &&
    hasString(value, 'showNotesAr') &&
    hasOptionalString(value, 'showNotesEn') &&
    hasOptionalString(value, 'audioKey') &&
    hasOptionalString(value, 'audioUrl') &&
    typeof value.durationSec === 'number' &&
    typeof value.episodeNumber === 'number' &&
    typeof value.premium === 'boolean' &&
    typeof value.status === 'string' &&
    EPISODE_STATUSES.has(value.status as ApiEpisodeStatus) &&
    hasOptionalString(value, 'publishAt') &&
    hasString(value, 'createdAt')
  );
}

function isApiGuest(value: unknown): value is ApiGuest {
  if (!isRecord(value)) return false;
  return (
    hasString(value, 'id') &&
    hasString(value, 'slug') &&
    hasString(value, 'name') &&
    hasString(value, 'role') &&
    hasString(value, 'city') &&
    hasString(value, 'email') &&
    hasString(value, 'bio') &&
    hasOptionalString(value, 'photoUrl') &&
    hasString(value, 'createdAt')
  );
}

function isApiGuestSocial(value: unknown): value is ApiGuestSocial {
  if (!isRecord(value)) return false;
  return (
    hasString(value, 'id') &&
    hasString(value, 'guestId') &&
    typeof value.platform === 'string' &&
    isSocialPlatform(value.platform) &&
    hasString(value, 'handle')
  );
}

function isApiGuestAppearance(value: unknown): value is ApiGuestAppearance {
  return isRecord(value) && hasString(value, 'guestId') && hasString(value, 'episodeId');
}

function isApiGuestDirectory(value: unknown): value is ApiGuestDirectory {
  if (!isRecord(value)) return false;
  return (
    Array.isArray(value.guests) &&
    value.guests.every(isApiGuest) &&
    Array.isArray(value.socials) &&
    value.socials.every(isApiGuestSocial) &&
    Array.isArray(value.appearances) &&
    value.appearances.every(isApiGuestAppearance)
  );
}

function isApiArticle(value: unknown): value is ApiArticle {
  if (!isRecord(value)) return false;
  const content = value.content;
  const seo = value.seo;
  const newsletter = value.newsletter;
  return (
    hasString(value, 'id') &&
    hasString(value, 'slug') &&
    hasString(value, 'titleAr') &&
    isApiArticleAuthor(value.author) &&
    (value.authorPlacement === 'after_title' || value.authorPlacement === 'end') &&
    hasOptionalString(value, 'titleEn') &&
    hasOptionalString(value, 'excerptAr') &&
    hasOptionalString(value, 'coverAlt') &&
    richTextDocumentSchema.safeParse(content).success &&
    hasString(value, 'contentHtml') &&
    hasString(value, 'bodyAr') &&
    isRecord(seo) &&
    hasOptionalString(seo, 'title') &&
    hasOptionalString(seo, 'description') &&
    hasOptionalString(seo, 'canonicalUrl') &&
    hasOptionalString(seo, 'socialTitle') &&
    hasOptionalString(seo, 'socialDescription') &&
    hasOptionalString(seo, 'socialImageUrl') &&
    typeof seo.noIndex === 'boolean' &&
    hasOptionalString(value, 'coverUrl') &&
    typeof value.status === 'string' &&
    ARTICLE_STATUSES.has(value.status as ApiArticleStatus) &&
    isRecord(newsletter) &&
    typeof newsletter.enabled === 'boolean' &&
    hasString(newsletter, 'status') &&
    NEWSLETTER_STATUS_SET.has(newsletter.status as string) &&
    hasOptionalString(newsletter, 'subject') &&
    hasOptionalString(newsletter, 'preheader') &&
    hasOptionalString(newsletter, 'campaignId') &&
    (newsletter.syncedVersion === undefined ||
      (typeof newsletter.syncedVersion === 'number' &&
        Number.isInteger(newsletter.syncedVersion) &&
        newsletter.syncedVersion >= 1)) &&
    typeof newsletter.needsSync === 'boolean' &&
    hasOptionalString(newsletter, 'sentAt') &&
    typeof value.version === 'number' &&
    Number.isInteger(value.version) &&
    value.version >= 1 &&
    hasOptionalString(value, 'publishedAt') &&
    hasString(value, 'createdAt') &&
    hasString(value, 'updatedAt')
  );
}

function isApiArticleAuthor(value: unknown): value is ApiArticleAuthor {
  if (!isRecord(value) || !hasString(value, 'displayName')) return false;
  if (value.type === 'custom') return true;
  return value.type === 'studio_member' && hasString(value, 'studioMemberId');
}

function isApiArticleAuthorCandidate(value: unknown): value is ApiArticleAuthorCandidate {
  return isRecord(value) && hasString(value, 'studioMemberId') && hasString(value, 'displayName');
}

function isMailchimpCapability(value: unknown): value is MailchimpCapability {
  return (
    isRecord(value) &&
    typeof value.configured === 'boolean' &&
    (value.mode === 'live' || value.mode === 'simulation') &&
    hasOptionalString(value, 'fromName') &&
    hasOptionalString(value, 'replyTo') &&
    hasOptionalString(value, 'audienceName') &&
    hasOptionalString(value, 'audienceConfirmationToken') &&
    (value.audienceCount === undefined ||
      (typeof value.audienceCount === 'number' &&
        Number.isInteger(value.audienceCount) &&
        value.audienceCount >= 0))
  );
}

function isNewsletterPreview(value: unknown): value is NewsletterPreview {
  return (
    isRecord(value) &&
    hasString(value, 'subject') &&
    hasOptionalString(value, 'preheader') &&
    hasString(value, 'html') &&
    hasString(value, 'text')
  );
}

function isArticleMediaAsset(value: unknown): value is ArticleMediaAsset {
  if (!isRecord(value)) return false;
  return (
    hasString(value, 'id') &&
    value.kind === 'image' &&
    (value.mimeType === 'image/jpeg' || value.mimeType === 'image/png') &&
    hasString(value, 'fileName') &&
    typeof value.byteSize === 'number' &&
    Number.isInteger(value.byteSize) &&
    value.byteSize > 0 &&
    typeof value.width === 'number' &&
    Number.isInteger(value.width) &&
    value.width > 0 &&
    typeof value.height === 'number' &&
    Number.isInteger(value.height) &&
    value.height > 0 &&
    hasString(value, 'defaultAlt') &&
    hasOptionalString(value, 'defaultCaption') &&
    (value.status === 'pending' || value.status === 'ready') &&
    hasOptionalString(value, 'publicUrl') &&
    hasString(value, 'createdAt')
  );
}

function isMediaUploadReservation(
  value: unknown,
): value is { readonly asset: ArticleMediaAsset; readonly uploadUrl: string } {
  return (
    isRecord(value) &&
    isArticleMediaAsset(value.asset) &&
    value.asset.status === 'pending' &&
    hasString(value, 'uploadUrl')
  );
}

function isApiUser(value: unknown): value is ApiUser {
  if (!isRecord(value)) return false;
  return (
    hasString(value, 'id') &&
    hasString(value, 'email') &&
    hasString(value, 'displayName') &&
    (value.locale === 'ar' || value.locale === 'en') &&
    hasString(value, 'createdAt')
  );
}

function isApiStudioRole(value: unknown): value is JsonRecord & {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
  isProtected: boolean;
  permissions: ApiPermissionId[];
  memberCount: number;
  createdAt: string;
  updatedAt: string;
} {
  if (!isRecord(value)) return false;
  return (
    hasString(value, 'id') &&
    hasString(value, 'name') &&
    hasString(value, 'description') &&
    typeof value.isSystem === 'boolean' &&
    typeof value.isProtected === 'boolean' &&
    isCanonicalPermissionList(value.permissions, { allowAccess: true }) &&
    typeof value.memberCount === 'number' &&
    Number.isInteger(value.memberCount) &&
    value.memberCount >= 0 &&
    hasString(value, 'createdAt') &&
    hasString(value, 'updatedAt')
  );
}

function isApiSubscriberUser(value: unknown): value is ApiSubscriberUser {
  return isApiUser(value);
}

function isApiStudioMemberBase(
  value: unknown,
): value is ApiStudioMemberAccess | ApiAuthenticatedStudioMember {
  if (!isRecord(value)) return false;
  return (
    hasString(value, 'id') &&
    hasString(value, 'email') &&
    hasString(value, 'displayName') &&
    hasString(value, 'role') &&
    hasString(value, 'roleName') &&
    (value.locale === 'ar' || value.locale === 'en') &&
    hasString(value, 'createdAt')
  );
}

function isApiStudioMemberAccess(value: unknown): value is ApiStudioMemberAccess {
  return (
    isApiStudioMemberBase(value) &&
    isRecord(value) &&
    typeof value.authLinked === 'boolean'
  );
}

function isApiProvisionedStudioMember(value: unknown): value is ApiStudioMemberAccess {
  return (
    isApiStudioMemberAccess(value) &&
    value.authLinked === true &&
    value.id.trim().length > 0 &&
    value.displayName.trim().length > 0 &&
    value.email.trim().length > 0 &&
    Number.isFinite(Date.parse(value.createdAt))
  );
}

function isCanonicalPermissionList(
  value: unknown,
  options: { readonly allowAccess: boolean; readonly requireAll?: boolean },
): value is ApiPermissionId[] {
  if (!Array.isArray(value)) return false;
  if (
    !value.every((permission) =>
      typeof permission === 'string' ? isPermissionId(permission) : false,
    )
  ) {
    return false;
  }
  if (new Set(value).size !== value.length) return false;
  if (!options.allowAccess && value.some((permission) => permission.startsWith('access.'))) {
    return false;
  }
  const permissions = new Set<ApiPermissionId>(value);
  if (
    value.some(
      (permission) =>
        permission.endsWith('.manage') &&
        !permissions.has(permission.replace(/\.manage$/, '.view') as ApiPermissionId),
    )
  ) {
    return false;
  }
  if (options.requireAll) {
    return (
      value.length === PERMISSION_IDS.length &&
      value.every((permission, index) => permission === PERMISSION_IDS[index])
    );
  }
  return true;
}

function isApiAuthenticatedStudioMember(
  value: unknown,
): value is ApiAuthenticatedStudioMember {
  if (!isApiStudioMemberBase(value) || !isRecord(value)) return false;
  return value.role === 'admin'
    ? isCanonicalPermissionList(value.permissions, {
        allowAccess: true,
        requireAll: true,
      })
    : isCanonicalPermissionList(value.permissions, { allowAccess: true });
}

function isApiPlan(value: unknown): value is ApiPlan {
  if (!isRecord(value)) return false;
  return (
    hasString(value, 'id') &&
    hasString(value, 'nameAr') &&
    hasOptionalString(value, 'nameEn') &&
    typeof value.priceMinor === 'number' &&
    hasString(value, 'currency') &&
    (value.interval === 'month' || value.interval === 'year')
  );
}

function isApiSubscription(value: unknown): value is ApiSubscription {
  if (!isRecord(value)) return false;
  return (
    hasString(value, 'id') &&
    hasString(value, 'userId') &&
    hasString(value, 'planId') &&
    typeof value.status === 'string' &&
    SUBSCRIPTION_STATUSES.has(value.status as ApiSubscriptionStatus) &&
    typeof value.priceMinor === 'number' &&
    hasString(value, 'currency') &&
    hasString(value, 'currentPeriodEnd') &&
    hasString(value, 'createdAt')
  );
}

function expectEntity<T>(
  value: unknown,
  predicate: (candidate: unknown) => candidate is T,
  operation: string,
  entity: string,
): T {
  if (!predicate(value)) {
    throw new AdminRepositoryError({
      code: 'INVALID_RESPONSE',
      operation,
      message: `The API returned an invalid ${entity} payload.`,
      retryable: false,
      context: { entity },
    });
  }
  return value;
}

function expectCollection<T>(
  value: unknown,
  predicate: (candidate: unknown) => candidate is T,
  operation: string,
  entity: string,
): T[] {
  if (!Array.isArray(value) || !value.every(predicate)) {
    throw new AdminRepositoryError({
      code: 'INVALID_RESPONSE',
      operation,
      message: `The API returned an invalid ${entity} collection.`,
      retryable: false,
      context: { entity },
    });
  }
  return value;
}

function summarize(body: string): string {
  const normalized = body.replace(/\s+/g, ' ').trim();
  return normalized.length <= 180 ? normalized : `${normalized.slice(0, 177).trimEnd()}…`;
}

function optionalApiText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function nullableApiText(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function extractFileName(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const path = value.includes('://') ? new URL(value).pathname : value;
    return decodeURIComponent(path.split('/').filter(Boolean).at(-1) ?? '') || undefined;
  } catch {
    return undefined;
  }
}

/** Sends only the fields the API accepts; the slug stays server-owned. */
function guestBody(command: CreateGuestCommand | UpdateGuestCommand): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const key of ['name', 'role', 'city', 'email', 'bio', 'photoUrl'] as const) {
    const value = command[key];
    if (value !== undefined) body[key] = value;
  }
  return body;
}

function toAdminGuestSocial(social: ApiGuestSocial): GuestSocial {
  return {
    id: encodeId('guest_social', social.id) as GuestSocialId,
    guestId: encodeId('guest', social.guestId) as GuestId,
    platform: social.platform,
    handle: social.handle,
  };
}

function toAdminGuestAppearance(appearance: ApiGuestAppearance): GuestAppearance {
  return {
    guestId: encodeId('guest', appearance.guestId) as GuestId,
    episodeId: encodeId('episode', appearance.episodeId) as EpisodeId,
  };
}

function encodeId(prefix: string, remoteId: string): string {
  return `${prefix}_${encodeURIComponent(remoteId)}`;
}

function decodeId(adminId: string, prefix: string, operation: string): string {
  const marker = `${prefix}_`;
  if (!adminId.startsWith(marker) || adminId.length === marker.length) {
    throw new AdminRepositoryError({
      code: 'VALIDATION',
      operation,
      message: `Invalid ${prefix} identifier.`,
      retryable: false,
      context: { id: adminId },
    });
  }
  try {
    return decodeURIComponent(adminId.slice(marker.length));
  } catch (cause) {
    throw new AdminRepositoryError(
      {
        code: 'VALIDATION',
        operation,
        message: `Invalid encoded ${prefix} identifier.`,
        retryable: false,
        context: { id: adminId },
      },
      { cause },
    );
  }
}

/** Adapter for the deployed Hono API. It never imports fixture data. */
export class HonoAdminRepository implements AdminRepository {
  readonly kind = 'hono' as const;
  readonly capabilities = HONO_CAPABILITIES;

  private readonly baseUrl: string;
  private readonly devUserId?: string;
  private readonly getAccessToken?: HonoAdminRepositoryOptions['getAccessToken'];
  private readonly fetcher: typeof fetch;
  private readonly createUploadRequest: () => XMLHttpRequest;
  private readonly now: () => Date;

  constructor(options: HonoAdminRepositoryOptions) {
    const baseUrl = options.baseUrl.trim().replace(/\/+$/, '');
    if (!baseUrl) {
      throw new AdminRepositoryError({
        code: 'CONFIGURATION',
        operation: 'createHonoAdminRepository',
        message: 'A non-empty VITE_API_URL is required for the Hono repository.',
        retryable: false,
      });
    }
    this.baseUrl = baseUrl;
    this.devUserId = options.devUserId;
    this.getAccessToken = options.getAccessToken;
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.createUploadRequest =
      options.createUploadRequest ?? (() => new globalThis.XMLHttpRequest());
    this.now = options.now ?? (() => new Date());
  }

  async readViewer(): Promise<AdminViewer> {
    const operation = 'readViewer';
    const payload = await this.requestJson(operation, '/studio/me');
    return this.toAdminViewer(
      expectEntity(payload, isApiAuthenticatedStudioMember, operation, 'Studio viewer'),
    );
  }

  async readContentWorkspace(): Promise<AdminContentWorkspace> {
    const operation = 'readContentWorkspace';
    const [showsPayload, episodesPayload, articlesPayload] = await Promise.all([
      this.requestJson(operation, '/shows'),
      this.requestJson(operation, '/episodes'),
      this.requestJson(operation, '/studio/articles'),
    ]);
    const shows = expectCollection(showsPayload, isApiShow, operation, 'show');
    const episodes = expectCollection(episodesPayload, isApiEpisode, operation, 'episode');
    const articles = expectCollection(articlesPayload, isApiArticle, operation, 'article');
    return {
      asOf: this.now().toISOString(),
      shows: shows.map((show) => this.toAdminShow(show)),
      episodes: episodes.map((episode) => this.toAdminEpisode(episode)),
      articles: articles.map((article) => this.toAdminArticle(article)),
    };
  }

  async readSubscriberDirectory(): Promise<AdminSubscriberDirectory> {
    const operation = 'readSubscriberDirectory';
    const [plansPayload, usersPayload, subscriptionsPayload] = await Promise.all([
      this.requestJson(operation, '/plans'),
      this.requestJson(operation, '/subscriber-users'),
      this.requestJson(operation, '/subscriptions'),
    ]);
    const plans = expectCollection(plansPayload, isApiPlan, operation, 'plan');
    const users = expectCollection(
      usersPayload,
      isApiSubscriberUser,
      operation,
      'subscriber user',
    );
    const subscriptions = expectCollection(
      subscriptionsPayload,
      isApiSubscription,
      operation,
      'subscription',
    );
    const monthlySarPlan = plans.find(
      (plan) => plan.interval === 'month' && plan.currency.toUpperCase() === 'SAR',
    );
    if (!monthlySarPlan) {
      throw new AdminRepositoryError({
        code: 'INVALID_RESPONSE',
        operation,
        message: 'The API did not return the required monthly SAR Plus plan.',
        retryable: false,
      });
    }

    return {
      plusPlan: this.toAdminPlan(monthlySarPlan, operation),
      users: users.map((user) => this.toSubscriberUser(user)),
      subscriptions: subscriptions.map((subscription) =>
        this.toAdminSubscription(subscription, operation),
      ),
    };
  }

  async readStudioMemberDirectory(): Promise<AdminStudioMemberDirectory> {
    const operation = 'readStudioMemberDirectory';
    const payload = await this.requestJson(operation, '/studio-members');
    const members = expectCollection(
      payload,
      isApiStudioMemberAccess,
      operation,
      'Studio member',
    );
    return {
      studioMembers: members.map((member) => this.toStudioMember(member)),
    };
  }

  async readRoles(): Promise<StudioRole[]> {
    const operation = 'readRoles';
    const payload = await this.requestJson(operation, '/roles');
    return expectCollection(payload, isApiStudioRole, operation, 'studio role').map((role) =>
      this.toAdminRole(role),
    );
  }

  async readRole(id: RoleId): Promise<StudioRole> {
    const operation = 'readRole';
    const payload = await this.requestJson(
      operation,
      `/roles/${encodeURIComponent(id)}`,
    );
    return this.toAdminRole(
      expectEntity(payload, isApiStudioRole, operation, 'studio role'),
    );
  }

  async readGuestDirectory(): Promise<AdminGuestDirectory> {
    const operation = 'readGuestDirectory';
    // Without a paging parameter the API answers with the whole directory,
    // which is the shape this view renders.
    const payload = await this.requestJson(operation, '/studio/guests');
    const directory = expectEntity(payload, isApiGuestDirectory, operation, 'guest directory');
    return {
      guests: directory.guests.map((guest) => this.toAdminGuest(guest)),
      guestSocials: directory.socials.map((social) => toAdminGuestSocial(social)),
      guestAppearances: directory.appearances.map((appearance) =>
        toAdminGuestAppearance(appearance),
      ),
    };
  }

  readAnalytics(): Promise<AdminAnalyticsSnapshot> {
    return Promise.reject(unsupportedCapability('readAnalytics', 'admin-analytics'));
  }

  /**
   * The strict all-data read. It composes the narrower reads, so a caller
   * lacking subscriber or access permissions fails here rather than receiving a
   * document with silently empty collections.
   */
  async readDashboard(): Promise<AdminStudioData> {
    const [viewer, content, guests, members, subscribers] = await Promise.all([
      this.readViewer(),
      this.readContentWorkspace(),
      this.readGuestDirectory(),
      this.readStudioMemberDirectory(),
      this.readSubscriberDirectory(),
    ]);
    return {
      asOf: content.asOf,
      viewer,
      plusPlan: subscribers.plusPlan,
      shows: content.shows,
      episodes: content.episodes,
      articles: content.articles,
      guests: guests.guests,
      guestSocials: guests.guestSocials,
      guestAppearances: guests.guestAppearances,
      studioMembers: members.studioMembers,
      users: subscribers.users,
      subscriptions: subscribers.subscriptions,
    };
  }

  async createShow(command: CreateShowCommand): Promise<Show> {
    const operation = 'createShow';
    const payload = await this.requestJson(operation, '/shows', {
      method: 'POST',
      body: JSON.stringify({
        slug: command.slug,
        titleAr: command.name,
        descriptionAr: command.description,
        hostName: command.host,
        artworkUrl: command.artworkUrl,
        category: command.category,
        premium: command.premium,
      }),
    });
    return this.toAdminShow(expectEntity(payload, isApiShow, operation, 'show'));
  }

  async updateShow(id: ShowId, command: UpdateShowCommand): Promise<Show> {
    const operation = 'updateShow';
    const payload = await this.requestJson(
      operation,
      `/shows/${encodeURIComponent(decodeId(id, 'show', operation))}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          slug: command.slug,
          titleAr: command.name,
          descriptionAr: command.description,
          hostName: command.host,
          artworkUrl: command.artworkUrl,
          category: command.category,
          premium: command.premium,
        }),
      },
    );
    return this.toAdminShow(expectEntity(payload, isApiShow, operation, 'show'));
  }

  async createEpisode(command: CreateEpisodeCommand): Promise<Episode> {
    const operation = 'createEpisode';
    this.assertEpisodeCommand(command.episodeNumber, command.durationMinutes, operation);
    const payload = await this.requestJson(operation, '/episodes', {
      method: 'POST',
      body: JSON.stringify({
        showId: decodeId(command.showId, 'show', operation),
        titleAr: command.title,
        showNotesAr: command.notes,
        audioUrl: command.audioUrl,
        durationSec: Math.round(command.durationMinutes * 60),
        episodeNumber: command.episodeNumber,
        premium: command.premium,
      }),
    });
    return this.toAdminEpisode(expectEntity(payload, isApiEpisode, operation, 'episode'));
  }

  async updateEpisode(id: EpisodeId, command: UpdateEpisodeCommand): Promise<Episode> {
    const operation = 'updateEpisode';
    if (command.episodeNumber !== undefined || command.durationMinutes !== undefined) {
      this.assertEpisodeCommand(
        command.episodeNumber ?? 1,
        command.durationMinutes ?? 0,
        operation,
      );
    }
    const payload = await this.requestJson(
      operation,
      `/episodes/${encodeURIComponent(decodeId(id, 'episode', operation))}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          titleAr: command.title,
          showNotesAr: command.notes,
          audioUrl: command.audioUrl,
          durationSec:
            command.durationMinutes === undefined
              ? undefined
              : Math.round(command.durationMinutes * 60),
          episodeNumber: command.episodeNumber,
          premium: command.premium,
        }),
      },
    );
    return this.toAdminEpisode(expectEntity(payload, isApiEpisode, operation, 'episode'));
  }

  async transitionEpisode(id: EpisodeId, command: EpisodeStatusCommand): Promise<Episode> {
    const operation = 'transitionEpisode';
    const payload = await this.requestJson(
      operation,
      `/episodes/${encodeURIComponent(decodeId(id, 'episode', operation))}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status: command.status, publishAt: command.scheduledAt }),
      },
    );
    return this.toAdminEpisode(expectEntity(payload, isApiEpisode, operation, 'episode'));
  }

  async uploadEpisodeAudio(id: EpisodeId, command: EpisodeAudioCommand): Promise<Episode> {
    const operation = 'uploadEpisodeAudio';
    const payload = await this.requestJson(
      operation,
      `/episodes/${encodeURIComponent(decodeId(id, 'episode', operation))}/audio`,
      {
        method: 'PUT',
        body: command.body,
        // The API accepts only allowlisted audio types. Browsers leave
        // File.type empty for some containers, so fall back to the extension
        // rather than octet-stream, which the API refuses.
        headers: { 'content-type': audioContentType(command) },
      },
      false,
    );
    return {
      ...this.toAdminEpisode(expectEntity(payload, isApiEpisode, operation, 'episode')),
      audioFileName: command.fileName,
    };
  }

  async listArticleMedia(): Promise<ArticleMediaAsset[]> {
    const operation = 'listArticleMedia';
    const payload = await this.requestJson(operation, '/studio/media');
    return expectCollection(payload, isArticleMediaAsset, operation, 'article media').filter(
      (asset) => asset.status === 'ready',
    );
  }

  async listArticleAuthors(): Promise<ArticleAuthorCandidate[]> {
    const operation = 'listArticleAuthors';
    const payload = await this.requestJson(operation, '/studio/articles/authors');
    return expectCollection(
      payload,
      isApiArticleAuthorCandidate,
      operation,
      'article author',
    ).map(({ studioMemberId, displayName }) => ({
      studioMemberId: encodeId('studio_member', studioMemberId),
      displayName,
    }));
  }

  async uploadArticleImage(command: UploadArticleImageCommand): Promise<ArticleMediaAsset> {
    const operation = 'uploadArticleImage';
    const reservationPayload = await this.requestJson(
      operation,
      '/studio/media/uploads',
      {
        method: 'POST',
        body: JSON.stringify({
          fileName: command.fileName,
          mimeType: command.mimeType,
          byteSize: command.byteSize,
          defaultAlt: command.alt,
          defaultCaption: command.caption,
          width: command.width,
          height: command.height,
        }),
      },
      true,
      201,
    );
    if (!isMediaUploadReservation(reservationPayload)) {
      throw new AdminRepositoryError({
        code: 'INVALID_RESPONSE',
        operation,
        message: 'The API returned an invalid media upload reservation.',
        retryable: false,
      });
    }

    const uploadPath = reservationPayload.uploadUrl;
    const uploadUrl = new URL(uploadPath, `${this.baseUrl}/`).toString();
    const headers = await this.mediaUploadAuthHeaders(operation);
    const uploaded = await new Promise<unknown>((resolve, reject) => {
      const request = this.createUploadRequest();
      request.open('PUT', uploadUrl, true);
      request.setRequestHeader('accept', 'application/json');
      request.setRequestHeader('content-type', command.mimeType);
      headers.forEach((value, name) => request.setRequestHeader(name, value));
      request.upload.addEventListener('progress', (event) => {
        if (!event.lengthComputable || event.total <= 0) return;
        const percentage = Math.min(100, Math.max(0, Math.round((event.loaded / event.total) * 100)));
        command.onProgress?.(percentage);
      });
      request.addEventListener('error', () => {
        reject(
          new AdminRepositoryError({
            code: 'NETWORK',
            operation,
            message: 'The article image could not be uploaded.',
            retryable: true,
            context: { path: uploadPath },
          }),
        );
      });
      request.addEventListener('abort', () => {
        reject(
          new AdminRepositoryError({
            code: 'NETWORK',
            operation,
            message: 'The article image upload was canceled.',
            retryable: true,
            context: { path: uploadPath },
          }),
        );
      });
      request.addEventListener('load', () => {
        if (request.status < 200 || request.status >= 300) {
          const response = new Response(request.responseText, {
            status: request.status,
            statusText: request.statusText,
            headers: {
              'content-type': request.getResponseHeader('content-type') ?? 'application/json',
            },
          });
          void this.toResponseError(response, operation, uploadPath).then(reject);
          return;
        }
        try {
          resolve(JSON.parse(request.responseText) as unknown);
        } catch (cause) {
          reject(
            new AdminRepositoryError(
              {
                code: 'INVALID_RESPONSE',
                operation,
                message: 'The API returned an invalid media upload response.',
                status: request.status,
                retryable: false,
                context: { path: uploadPath },
              },
              { cause },
            ),
          );
        }
      });
      command.onProgress?.(0);
      request.send(command.body);
    });

    const asset = expectEntity(uploaded, isArticleMediaAsset, operation, 'article media');
    if (asset.status !== 'ready' || !asset.publicUrl) {
      throw new AdminRepositoryError({
        code: 'INVALID_RESPONSE',
        operation,
        message: 'The uploaded image is not ready for article use.',
        retryable: false,
      });
    }
    command.onProgress?.(100);
    return asset;
  }

  async createArticle(command: CreateArticleCommand): Promise<Article> {
    const operation = 'createArticle';
    const payload = await this.requestJson(operation, '/studio/articles', {
      method: 'POST',
      body: JSON.stringify({
        slug: command.slug,
        titleAr: command.title,
        author:
          command.author.type === 'studio_member'
            ? {
                type: 'studio_member',
                studioMemberId: decodeId(
                  command.author.studioMemberId,
                  'studio_member',
                  operation,
                ),
              }
            : command.author,
        authorPlacement: command.authorPlacement,
        excerptAr: optionalApiText(command.excerpt),
        coverUrl: optionalApiText(command.coverUrl),
        coverAlt: optionalApiText(command.coverAlt),
        content: command.content,
        seo: {
          title: optionalApiText(command.seo.title),
          description: optionalApiText(command.seo.description),
          canonicalUrl: optionalApiText(command.seo.canonicalUrl),
          socialTitle: optionalApiText(command.seo.socialTitle),
          socialDescription: optionalApiText(command.seo.socialDescription),
          socialImageUrl: optionalApiText(command.seo.socialImageUrl),
          noIndex: command.seo.noIndex,
        },
        newsletter: {
          enabled: command.newsletter.enabled,
          subject: optionalApiText(command.newsletter.subject),
          preheader: optionalApiText(command.newsletter.preheader),
        },
      }),
    });
    return this.toAdminArticle(expectEntity(payload, isApiArticle, operation, 'article'));
  }

  async updateArticle(id: ArticleId, command: UpdateArticleCommand): Promise<Article> {
    const operation = 'updateArticle';
    const payload = await this.requestJson(
      operation,
      `/studio/articles/${encodeURIComponent(decodeId(id, 'article', operation))}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          expectedVersion: command.expectedVersion,
          slug: command.slug,
          titleAr: command.title,
          author:
            command.author?.type === 'studio_member'
              ? {
                  type: 'studio_member',
                  studioMemberId: decodeId(
                    command.author.studioMemberId,
                    'studio_member',
                    operation,
                  ),
                }
              : command.author,
          authorPlacement: command.authorPlacement,
          excerptAr: nullableApiText(command.excerpt),
          coverUrl: nullableApiText(command.coverUrl),
          coverAlt: nullableApiText(command.coverAlt),
          content: command.content,
          seo: command.seo
            ? {
                title: nullableApiText(command.seo.title),
                description: nullableApiText(command.seo.description),
                canonicalUrl: nullableApiText(command.seo.canonicalUrl),
                socialTitle: nullableApiText(command.seo.socialTitle),
                socialDescription: nullableApiText(command.seo.socialDescription),
                socialImageUrl: nullableApiText(command.seo.socialImageUrl),
                noIndex: command.seo.noIndex,
              }
            : undefined,
          newsletter: command.newsletter
            ? {
                enabled: command.newsletter.enabled,
                subject: nullableApiText(command.newsletter.subject),
                preheader: nullableApiText(command.newsletter.preheader),
              }
            : undefined,
        }),
      },
    );
    return this.toAdminArticle(expectEntity(payload, isApiArticle, operation, 'article'));
  }

  async transitionArticle(
    id: ArticleId,
    status: Article['status'],
    expectedVersion: number,
  ): Promise<Article> {
    const operation = 'transitionArticle';
    const payload = await this.requestJson(
      operation,
      `/studio/articles/${encodeURIComponent(decodeId(id, 'article', operation))}/status`,
      { method: 'PATCH', body: JSON.stringify({ status, expectedVersion }) },
    );
    return this.toAdminArticle(expectEntity(payload, isApiArticle, operation, 'article'));
  }

  async getMailchimpCapability(): Promise<MailchimpCapability> {
    const operation = 'getMailchimpCapability';
    const payload = await this.requestJson(
      operation,
      '/studio/articles/mailchimp/capability',
    );
    if (!isMailchimpCapability(payload)) {
      throw new AdminRepositoryError({
        code: 'INVALID_RESPONSE',
        operation,
        message: 'The API returned an invalid Mailchimp capability response.',
        retryable: false,
      });
    }
    return payload;
  }

  async previewArticleNewsletter(id: ArticleId): Promise<NewsletterPreview> {
    const operation = 'previewArticleNewsletter';
    const payload = await this.requestJson(
      operation,
      `/studio/articles/${encodeURIComponent(decodeId(id, 'article', operation))}/newsletter/preview`,
      { method: 'POST' },
    );
    if (!isNewsletterPreview(payload)) {
      throw new AdminRepositoryError({
        code: 'INVALID_RESPONSE',
        operation,
        message: 'The API returned an invalid newsletter preview.',
        retryable: false,
      });
    }
    return payload;
  }

  async syncArticleNewsletterCampaign(
    id: ArticleId,
    expectedVersion: number,
  ): Promise<AdminNewsletterCampaignResult> {
    const operation = 'syncArticleNewsletterCampaign';
    const payload = await this.requestJson(
      operation,
      `/studio/articles/${encodeURIComponent(decodeId(id, 'article', operation))}/newsletter/campaign`,
      { method: 'POST', body: JSON.stringify({ expectedVersion }) },
    );
    if (
      !isRecord(payload) ||
      (payload.operation !== 'created' && payload.operation !== 'updated')
    ) {
      throw new AdminRepositoryError({
        code: 'INVALID_RESPONSE',
        operation,
        message: 'The API returned an invalid Mailchimp campaign response.',
        retryable: false,
      });
    }
    return {
      article: this.toAdminArticle(
        expectEntity(payload.article, isApiArticle, operation, 'article'),
      ),
      operation: payload.operation,
    };
  }

  async sendArticleNewsletter(
    id: ArticleId,
    audienceConfirmationToken: string,
    expectedVersion: number,
    expectedCampaignId: string,
  ): Promise<AdminNewsletterSendResult> {
    const operation = 'sendArticleNewsletter';
    const payload = await this.requestJson(
      operation,
      `/studio/articles/${encodeURIComponent(decodeId(id, 'article', operation))}/newsletter/send`,
      {
        method: 'POST',
        body: JSON.stringify({
          confirmation: 'SEND_NEWSLETTER',
          audienceConfirmationToken,
          expectedVersion,
          expectedCampaignId,
        }),
      },
    );
    if (
      !isRecord(payload) ||
      !['accepted', 'sent', 'already_sent', 'not_sent'].includes(String(payload.operation))
    ) {
      throw new AdminRepositoryError({
        code: 'INVALID_RESPONSE',
        operation,
        message: 'The API returned an invalid Mailchimp send response.',
        retryable: false,
      });
    }
    return {
      article: this.toAdminArticle(
        expectEntity(payload.article, isApiArticle, operation, 'article'),
      ),
      operation: payload.operation as AdminNewsletterSendResult['operation'],
    };
  }

  async reconcileArticleNewsletter(id: ArticleId): Promise<AdminNewsletterSendResult> {
    const operation = 'reconcileArticleNewsletter';
    const payload = await this.requestJson(
      operation,
      `/studio/articles/${encodeURIComponent(decodeId(id, 'article', operation))}/newsletter/reconcile`,
      { method: 'POST' },
    );
    if (
      !isRecord(payload) ||
      !['accepted', 'sent', 'already_sent', 'not_sent'].includes(String(payload.operation))
    ) {
      throw new AdminRepositoryError({
        code: 'INVALID_RESPONSE',
        operation,
        message: 'The API returned an invalid Mailchimp reconciliation response.',
        retryable: false,
      });
    }
    return {
      article: this.toAdminArticle(
        expectEntity(payload.article, isApiArticle, operation, 'article'),
      ),
      operation: payload.operation as AdminNewsletterSendResult['operation'],
    };
  }

  async createSubscription(command: CreateSubscriptionCommand): Promise<Subscription> {
    const operation = 'createSubscription';
    const payload = await this.requestJson(operation, '/subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        userId: decodeId(command.userId, 'user', operation),
        planId: decodeId(command.planId, 'plan', operation),
      }),
    });
    return this.toAdminSubscription(
      expectEntity(payload, isApiSubscription, operation, 'subscription'),
      operation,
    );
  }

  async transitionSubscription(
    id: SubscriptionId,
    status: Subscription['status'],
  ): Promise<Subscription> {
    const operation = 'transitionSubscription';
    const payload = await this.requestJson(
      operation,
      `/subscriptions/${encodeURIComponent(decodeId(id, 'subscription', operation))}/status`,
      { method: 'PATCH', body: JSON.stringify({ status }) },
    );
    return this.toAdminSubscription(
      expectEntity(payload, isApiSubscription, operation, 'subscription'),
      operation,
    );
  }

  async createStudioMember(
    command: CreateStudioMemberCommand,
  ): Promise<StudioMember> {
    const operation = 'createStudioMember';
    const normalized = normalizeCreateStudioMemberCommand(command);
    const payload = await this.requestJson(
      operation,
      '/studio-members',
      {
        method: 'POST',
        body: JSON.stringify({
          displayName: normalized.name,
          email: normalized.email,
          role: normalized.role,
          locale: normalized.locale,
        }),
      },
      true,
      201,
    );
    const created = expectEntity(
      payload,
      isApiProvisionedStudioMember,
      operation,
      'provisioned Studio member',
    );
    if (
      created.displayName !== normalized.name ||
      created.email.trim().toLowerCase() !== normalized.email ||
      created.role !== normalized.role ||
      created.locale !== normalized.locale
    ) {
      throw new AdminRepositoryError({
        code: 'INVALID_RESPONSE',
        operation,
        message: 'The API returned a different Studio member than requested.',
        retryable: false,
        context: {
          requestedEmail: normalized.email,
          returnedEmail: created.email,
          requestedRole: normalized.role,
          returnedRole: created.role,
        },
      });
    }
    return this.toStudioMember(created);
  }

  async updateStudioMemberRole(
    id: StudioMemberId,
    role: AdminUserRole,
  ): Promise<StudioMember> {
    const operation = 'updateStudioMemberRole';
    const payload = await this.requestJson(
      operation,
      `/studio-members/${encodeURIComponent(
        decodeId(id, 'studio_member', operation),
      )}/role`,
      { method: 'PATCH', body: JSON.stringify({ role }) },
    );
    return this.toStudioMember(
      expectEntity(payload, isApiStudioMemberAccess, operation, 'Studio member'),
    );
  }

  async createRole(command: CreateRoleCommand): Promise<StudioRole> {
    const operation = 'createRole';
    const parsed = createStudioRoleSchema.safeParse(command);
    if (!parsed.success) {
      throw new AdminRepositoryError({
        code: 'VALIDATION',
        operation,
        message: 'The role command is invalid.',
        retryable: false,
        context: { field: String(parsed.error.issues[0]?.path[0] ?? 'command') },
      });
    }
    const payload = await this.requestJson(
      operation,
      '/roles',
      {
        method: 'POST',
        body: JSON.stringify({
          name: parsed.data.name,
          description: parsed.data.description,
          permissions: parsed.data.permissions,
        }),
      },
      true,
      201,
    );
    return this.toAdminRole(
      expectEntity(payload, isApiStudioRole, operation, 'studio role'),
    );
  }

  async updateRolePermissions(
    role: RoleId,
    permissions: readonly PermissionId[],
  ): Promise<StudioRole> {
    const operation = 'updateRolePermissions';
    const parsed = updateRolePermissionsSchema.safeParse({ permissions });
    if (!parsed.success) {
      throw new AdminRepositoryError({
        code: 'VALIDATION',
        operation,
        message: 'The role permissions are invalid.',
        retryable: false,
      });
    }
    const payload = await this.requestJson(
      operation,
      `/permissions/${encodeURIComponent(role)}`,
      { method: 'PUT', body: JSON.stringify(parsed.data) },
    );
    const result = expectEntity(payload, isApiStudioRole, operation, 'studio role');
    if (result.id !== role) {
      throw new AdminRepositoryError({
        code: 'INVALID_RESPONSE',
        operation,
        message: 'The API returned a permission set for the wrong role.',
        retryable: false,
        context: { requestedRole: role, returnedRole: result.id },
      });
    }
    return this.toAdminRole(result);
  }

  async createGuest(command: CreateGuestCommand = {}): Promise<Guest> {
    const operation = 'createGuest';
    const payload = await this.requestJson(
      operation,
      '/studio/guests',
      // The slug is server-owned, so only editorial fields are sent.
      { method: 'POST', body: JSON.stringify(guestBody(command)) },
      true,
      201,
    );
    return this.toAdminGuest(expectEntity(payload, isApiGuest, operation, 'guest'));
  }

  async updateGuest(id: GuestId, command: UpdateGuestCommand): Promise<Guest> {
    const operation = 'updateGuest';
    const payload = await this.requestJson(
      operation,
      `/studio/guests/${encodeURIComponent(decodeId(id, 'guest', operation))}`,
      { method: 'PATCH', body: JSON.stringify(guestBody(command)) },
    );
    return this.toAdminGuest(expectEntity(payload, isApiGuest, operation, 'guest'));
  }

  async createGuestSocial(command: CreateGuestSocialCommand): Promise<GuestSocial> {
    const operation = 'createGuestSocial';
    const guestId = decodeId(command.guestId, 'guest', operation);
    const payload = await this.requestJson(
      operation,
      `/studio/guests/${encodeURIComponent(guestId)}/socials`,
      {
        method: 'POST',
        body: JSON.stringify({ platform: command.platform, handle: command.handle }),
      },
      true,
      201,
    );
    return toAdminGuestSocial(expectEntity(payload, isApiGuestSocial, operation, 'guest link'));
  }

  async updateGuestSocial(
    id: GuestSocialId,
    command: UpdateGuestSocialCommand,
  ): Promise<GuestSocial> {
    const operation = 'updateGuestSocial';
    const payload = await this.requestJson(
      operation,
      `/studio/guests/socials/${encodeURIComponent(decodeId(id, 'guest_social', operation))}`,
      { method: 'PATCH', body: JSON.stringify(command) },
    );
    return toAdminGuestSocial(expectEntity(payload, isApiGuestSocial, operation, 'guest link'));
  }

  async removeGuestSocial(id: GuestSocialId): Promise<void> {
    const operation = 'removeGuestSocial';
    await this.requestJson(
      operation,
      `/studio/guests/socials/${encodeURIComponent(decodeId(id, 'guest_social', operation))}`,
      { method: 'DELETE' },
      false,
      204,
    );
  }

  async linkGuestAppearance(guestId: GuestId, episodeId: EpisodeId): Promise<GuestAppearance> {
    const operation = 'linkGuestAppearance';
    const payload = await this.requestJson(
      operation,
      `/studio/guests/${encodeURIComponent(decodeId(guestId, 'guest', operation))}/appearances`,
      {
        method: 'POST',
        body: JSON.stringify({ episodeId: decodeId(episodeId, 'episode', operation) }),
      },
      // Linking is idempotent: a fresh link is 201 and a repeat is 200, so no
      // single status can be asserted here.
    );
    return toAdminGuestAppearance(
      expectEntity(payload, isApiGuestAppearance, operation, 'guest appearance'),
    );
  }

  async unlinkGuestAppearance(guestId: GuestId, episodeId: EpisodeId): Promise<void> {
    const operation = 'unlinkGuestAppearance';
    const guest = encodeURIComponent(decodeId(guestId, 'guest', operation));
    const episode = encodeURIComponent(decodeId(episodeId, 'episode', operation));
    await this.requestJson(
      operation,
      `/studio/guests/${guest}/appearances/${episode}`,
      { method: 'DELETE' },
      false,
      204,
    );
  }

  private async mediaUploadAuthHeaders(operation: string): Promise<Headers> {
    const headers = new Headers();
    if (this.getAccessToken) {
      let token: string | null;
      try {
        token = await this.getAccessToken();
      } catch (cause) {
        throw new AdminRepositoryError(
          {
            code: 'UNAUTHENTICATED',
            operation,
            message: 'Unable to obtain the admin access token.',
            retryable: false,
          },
          { cause },
        );
      }
      if (token) headers.set('authorization', `Bearer ${token}`);
    } else if (this.devUserId) {
      headers.set('x-dev-user', this.devUserId);
    }
    return headers;
  }

  private async requestJson(
    operation: string,
    path: string,
    init: RequestInit = {},
    jsonBody = true,
    expectedStatus?: number,
  ): Promise<unknown> {
    const headers = new Headers(init.headers);
    headers.set('accept', 'application/json');
    if (jsonBody && init.body !== undefined) headers.set('content-type', 'application/json');

    if (this.getAccessToken) {
      let token: string | null;
      try {
        token = await this.getAccessToken();
      } catch (cause) {
        throw new AdminRepositoryError(
          {
            code: 'UNAUTHENTICATED',
            operation,
            message: 'Unable to obtain the admin access token.',
            retryable: false,
          },
          { cause },
        );
      }
      if (token) headers.set('authorization', `Bearer ${token}`);
    } else if (this.devUserId) {
      headers.set('x-dev-user', this.devUserId);
    }

    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}${path}`, { ...init, headers });
    } catch (cause) {
      if (isAdminRepositoryError(cause)) throw cause;
      throw new AdminRepositoryError(
        {
          code: 'NETWORK',
          operation,
          message: 'The admin API could not be reached.',
          retryable: true,
          context: { path },
        },
        { cause },
      );
    }

    if (!response.ok) throw await this.toResponseError(response, operation, path);
    if (expectedStatus !== undefined && response.status !== expectedStatus) {
      throw new AdminRepositoryError({
        code: 'INVALID_RESPONSE',
        operation,
        message: 'The admin API returned an unexpected success status.',
        status: response.status,
        retryable: false,
        context: { path, expectedStatus },
      });
    }
    if (response.status === 204) return undefined;
    try {
      return await response.json();
    } catch (cause) {
      throw new AdminRepositoryError(
        {
          code: 'INVALID_RESPONSE',
          operation,
          message: 'The admin API returned a non-JSON success response.',
          status: response.status,
          retryable: false,
          context: { path },
        },
        { cause },
      );
    }
  }

  private async toResponseError(
    response: Response,
    operation: string,
    path: string,
  ): Promise<AdminRepositoryError> {
    const text = await response.text();
    let message = text || response.statusText || 'Admin API request failed.';
    let remoteBody: unknown;
    if (text) {
      try {
        remoteBody = JSON.parse(text) as unknown;
        if (isRecord(remoteBody) && typeof remoteBody.error === 'string') {
          message = remoteBody.error;
        }
      } catch {
        remoteBody = text;
      }
    }
    const status = response.status;
    const remoteCode =
      isRecord(remoteBody) && typeof remoteBody.code === 'string'
        ? remoteBody.code
        : undefined;
    const code =
      remoteCode === 'VALIDATION_ERROR'
        ? 'VALIDATION'
        : remoteCode === 'ADMIN_REQUIRED'
          ? 'FORBIDDEN'
          : remoteCode === 'EMAIL_ALREADY_EXISTS' ||
              remoteCode === 'AUTH_IDENTITY_ALREADY_EXISTS'
            ? 'CONFLICT'
            : remoteCode === 'INVITE_DELIVERY_FAILED' ||
                remoteCode === 'STUDIO_MEMBER_PROVISIONING_FAILED' ||
                remoteCode === 'AUTH_PROVISIONING_UNAVAILABLE'
              ? 'REMOTE_UNAVAILABLE'
              : remoteCode === 'STUDIO_MEMBER_PROVISIONING_PARTIAL_FAILURE'
                ? 'REMOTE_ERROR'
              : status === 401
        ? 'UNAUTHENTICATED'
        : status === 403
          ? 'FORBIDDEN'
          : status === 404
            ? 'NOT_FOUND'
            : status === 409
              ? 'CONFLICT'
              : status === 422 || status === 400
                ? 'VALIDATION'
                : status === 429
                  ? 'RATE_LIMITED'
                  : status >= 500
                    ? 'REMOTE_UNAVAILABLE'
                    : 'REMOTE_ERROR';
    const retryableProvisioningFailure =
      remoteCode === 'INVITE_DELIVERY_FAILED' ||
      remoteCode === 'STUDIO_MEMBER_PROVISIONING_FAILED' ||
      remoteCode === 'AUTH_PROVISIONING_UNAVAILABLE';
    const unsafeToRetry =
      remoteCode === 'STUDIO_MEMBER_PROVISIONING_PARTIAL_FAILURE';
    return new AdminRepositoryError({
      code,
      operation,
      message,
      status,
      retryable:
        !unsafeToRetry && (retryableProvisioningFailure || status === 429 || status >= 500),
      context: { path, remoteCode, remoteBody },
    });
  }

  private toAdminViewer(member: ApiAuthenticatedStudioMember): AdminViewer {
    return {
      id: encodeId('studio_member', member.id) as StudioMemberId,
      name: member.displayName,
      email: member.email,
      role: member.role,
      roleName: member.roleName,
      permissions: [...member.permissions],
      avatarInitial: Array.from(member.displayName.trim())[0] ?? 'م',
    };
  }

  private toAdminRole(role: {
    id: string;
    name: string;
    description: string;
    isSystem: boolean;
    isProtected: boolean;
    permissions: readonly ApiPermissionId[];
    memberCount: number;
    createdAt: string;
    updatedAt: string;
  }): StudioRole {
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      isProtected: role.isProtected,
      permissions: [...role.permissions],
      memberCount: role.memberCount,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  }

  private toAdminPlan(plan: ApiPlan, operation: string): PlusPlan {
    if (plan.currency.toUpperCase() !== 'SAR' || plan.interval !== 'month') {
      throw new AdminRepositoryError({
        code: 'INVALID_RESPONSE',
        operation,
        message: 'The admin UI currently requires a monthly SAR plan.',
        retryable: false,
        context: { planId: plan.id, currency: plan.currency, interval: plan.interval },
      });
    }
    return {
      id: encodeId('plan', plan.id) as PlusPlan['id'],
      name: plan.nameAr,
      priceHalalas: plan.priceMinor,
      currency: 'SAR',
      interval: 'month',
    };
  }

  private toAdminShow(show: ApiShow): Show {
    return {
      id: encodeId('show', show.id) as ShowId,
      slug: show.slug,
      name: show.titleAr,
      host: show.hostName,
      category: show.category,
      premium: show.premium,
      artworkUrl: show.artworkUrl,
      createdAt: show.createdAt,
    };
  }

  private toAdminEpisode(episode: ApiEpisode): Episode {
    return {
      id: encodeId('episode', episode.id) as EpisodeId,
      showId: encodeId('show', episode.showId) as ShowId,
      title: episode.titleAr,
      notes: episode.showNotesAr,
      episodeNumber: episode.episodeNumber,
      durationMinutes: Math.round(episode.durationSec / 60),
      premium: episode.premium,
      status: episode.status,
      audioFileName: extractFileName(episode.audioKey ?? episode.audioUrl),
      createdAt: episode.createdAt,
      updatedAt: episode.createdAt,
      scheduledAt: episode.status === 'scheduled' ? episode.publishAt : undefined,
      publishedAt:
        episode.status === 'published' || episode.status === 'archived'
          ? episode.publishAt
          : undefined,
    };
  }

  private toAdminGuest(guest: ApiGuest): Guest {
    return {
      id: encodeId('guest', guest.id) as GuestId,
      slug: guest.slug,
      name: guest.name,
      role: guest.role,
      city: guest.city,
      email: guest.email,
      bio: guest.bio,
      photoUrl: guest.photoUrl,
      createdAt: guest.createdAt,
    };
  }

  private toAdminArticle(article: ApiArticle): Article {
    return {
      id: encodeId('article', article.id) as ArticleId,
      slug: article.slug,
      title: article.titleAr,
      author:
        article.author.type === 'studio_member'
          ? {
              ...article.author,
              studioMemberId: encodeId('studio_member', article.author.studioMemberId),
            }
          : article.author,
      authorPlacement: article.authorPlacement,
      summary: article.excerptAr ?? summarize(article.bodyAr),
      excerpt: article.excerptAr ?? '',
      coverUrl: article.coverUrl,
      coverAlt: article.coverAlt,
      content: article.content,
      contentHtml: article.contentHtml,
      body: article.bodyAr,
      seo: article.seo,
      status: article.status,
      newsletter: article.newsletter,
      version: article.version,
      createdAt: article.createdAt,
      updatedAt: article.updatedAt,
      publishedAt: article.publishedAt,
    };
  }

  private toStudioMember(member: ApiStudioMemberAccess): StudioMember {
    return {
      id: encodeId('studio_member', member.id) as StudioMemberId,
      name: member.displayName,
      email: member.email,
      role: member.role,
      roleName: member.roleName,
      joinedAt: member.createdAt,
    };
  }

  private toSubscriberUser(user: ApiSubscriberUser): SubscriberUser {
    return {
      id: encodeId('user', user.id) as UserId,
      name: user.displayName,
      email: user.email,
      joinedAt: user.createdAt,
    };
  }

  private toAdminSubscription(
    subscription: ApiSubscription,
    operation: string,
  ): Subscription {
    if (subscription.currency.toUpperCase() !== 'SAR') {
      throw new AdminRepositoryError({
        code: 'INVALID_RESPONSE',
        operation,
        message: 'A subscription returned an unsupported non-SAR currency.',
        retryable: false,
        context: { subscriptionId: subscription.id, currency: subscription.currency },
      });
    }
    return {
      id: encodeId('subscription', subscription.id) as SubscriptionId,
      userId: encodeId('user', subscription.userId) as UserId,
      planId: encodeId('plan', subscription.planId) as PlusPlan['id'],
      status: subscription.status,
      priceHalalas: subscription.priceMinor,
      startedAt: subscription.createdAt,
      updatedAt: subscription.createdAt,
      renewAt: subscription.currentPeriodEnd,
    };
  }

  private assertEpisodeCommand(
    episodeNumber: number,
    durationMinutes: number,
    operation: string,
  ): void {
    if (!Number.isInteger(episodeNumber) || episodeNumber <= 0) {
      throw new AdminRepositoryError({
        code: 'VALIDATION',
        operation,
        message: 'episodeNumber must be a positive integer.',
        retryable: false,
        context: { episodeNumber },
      });
    }
    if (!Number.isFinite(durationMinutes) || durationMinutes < 0) {
      throw new AdminRepositoryError({
        code: 'VALIDATION',
        operation,
        message: 'durationMinutes must be a non-negative number.',
        retryable: false,
        context: { durationMinutes },
      });
    }
  }
}

export function createHonoAdminRepository(options: HonoAdminRepositoryOptions): AdminRepository {
  return new HonoAdminRepository(options);
}
