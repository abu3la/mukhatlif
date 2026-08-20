import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  PERMISSION_IDS,
  ROLE_CREATED_AUDIT_ACTION,
  ROLE_PERMISSION_AUDIT_ACTION,
  STUDIO_MEMBER_ACCESS_AUDIT_ACTION,
  STUDIO_MEMBER_INVITATION_AUDIT_ACTION,
  isPermissionId,
  type Article,
  type ArticleAuthor,
  type ArticleAuthorPlacement,
  type ArticleStatus,
  type NewsletterStatus,
  type RichTextDocument,
  type ImageMediaMimeType,
  type Episode,
  type EpisodeStatus,
  type Follow,
  type Guest,
  type GuestAppearance,
  type GuestSocial,
  type ListQuery,
  type PageResult,
  type Plan,
  type SocialPlatform,
  type PlaybackProgress,
  type PermissionId,
  type RoleCreatedAuditLog,
  type RoleId,
  type Show,
  type RolePermissionAuditLog,
  type RolePermissionMatrix,
  type StudioRole,
  type StudioAudienceSummary,
  type StudioContentSummary,
  type StudioMember,
  type StudioMemberAccess,
  type StudioMemberAccessAuditLog,
  type StudioMemberInvitationAuditLog,
  type StudioMemberStatus,
  type Subscription,
  type SubscriberUser,
  type SubscriptionStatus,
  type User,
} from '@mukhtalif/types';
import {
  createArticleRecord,
  mergeArticleUpdate,
  refreshNeedsSync,
} from '../publishing/article-record';
import {
  normalizeArticleAuthorDisplayName,
  type CreateStudioRoleInput,
  type InviteStudioMemberInput,
} from '@mukhtalif/validation';
import { escapeSearchPattern, pageRange } from './list-query';
import type {
  AcceptStudioInvitationResult,
  ChangeRolePermissionsResult,
  ChangeStudioMemberRoleResult,
  CreateGuestSocialResult,
  CreateRoleResult,
  InviteStudioMemberResult,
  LinkGuestAppearanceResult,
  Repository,
  StoredMediaAsset,
  UpdateGuestSocialResult,
} from './types';

/** snake_case rows in Postgres ↔ camelCase domain objects. */

interface UserProfileRow {
  id: string;
  email: string;
  display_name: string;
  locale: User['locale'];
  created_at: string;
}

interface UserRow extends UserProfileRow {
  auth_user_id: string | null;
}

interface StudioMemberProfileRow {
  id: string;
  email: string;
  display_name: string;
  role_id: RoleId;
  role_name?: string;
  role_record?: { name: string } | Array<{ name: string }> | null;
  locale: User['locale'];
  created_at: string;
}

interface StudioMemberRow extends StudioMemberProfileRow {
  auth_user_id: string | null;
  status?: StudioMemberStatus;
  accepted_at?: string | null;
}

interface StudioMemberAccessAuditRow {
  id: string;
  actor_studio_member_id: string;
  target_studio_member_id: string;
  previous_role: RoleId;
  new_role: RoleId;
  request_id: string;
  created_at: string;
}

interface StudioMemberInvitationAuditRow {
  id: string;
  actor_studio_member_id: string;
  target_studio_member_id: string;
  invited_email: string;
  assigned_role: RoleId;
  locale: User['locale'];
  request_id: string;
  created_at: string;
}

interface RolePermissionRow {
  role: RoleId;
  permission: string;
}

interface RolePermissionAuditRow {
  id: string;
  actor_studio_member_id: string;
  target_role: RoleId;
  previous_permissions: string[];
  new_permissions: string[];
  request_id: string;
  created_at: string;
}

interface RoleCreatedAuditRow {
  id: string;
  actor_studio_member_id: string;
  target_role: RoleId;
  role_name: string;
  initial_permissions: string[];
  request_id: string;
  created_at: string;
}

interface StudioRoleRow {
  id: RoleId;
  name: string;
  description: string;
  is_system: boolean;
  is_protected: boolean;
  created_at: string;
  updated_at: string;
}

interface ShowRow {
  id: string;
  slug: string;
  title_ar: string;
  title_en: string | null;
  description_ar: string;
  description_en: string | null;
  host_name: string;
  artwork_url: string | null;
  category: string;
  premium: boolean;
  created_at: string;
}

interface GuestRow {
  id: string;
  slug: string;
  name: string;
  role: string;
  city: string;
  email: string;
  bio: string;
  photo_url: string | null;
  created_at: string;
}

interface GuestSocialRow {
  id: string;
  guest_id: string;
  platform: SocialPlatform;
  handle: string;
}

interface GuestAppearanceRow {
  guest_id: string;
  episode_id: string;
}

interface EpisodeRow {
  id: string;
  show_id: string;
  title_ar: string;
  title_en: string | null;
  show_notes_ar: string;
  show_notes_en: string | null;
  audio_key: string | null;
  audio_url: string | null;
  duration_sec: number;
  episode_number: number;
  premium: boolean;
  status: EpisodeStatus;
  publish_at: string | null;
  created_at: string;
}

interface ArticleRow {
  id: string;
  slug: string;
  title_ar: string;
  title_en: string | null;
  author_type: 'studio_member' | 'custom';
  author_display_name: string;
  author_studio_member_id: string | null;
  author_placement: ArticleAuthorPlacement;
  excerpt_ar: string | null;
  body_ar: string;
  cover_url: string | null;
  cover_alt: string | null;
  content_json: RichTextDocument;
  content_html: string;
  seo_title: string | null;
  seo_description: string | null;
  canonical_url: string | null;
  social_title: string | null;
  social_description: string | null;
  social_image_url: string | null;
  no_index: boolean;
  status: ArticleStatus;
  published_at: string | null;
  newsletter_enabled: boolean;
  newsletter_subject: string | null;
  newsletter_preheader: string | null;
  newsletter_status: NewsletterStatus;
  mailchimp_campaign_id: string | null;
  newsletter_synced_version: number | null;
  newsletter_sync_started_at: string | null;
  newsletter_sync_token: string | null;
  newsletter_send_started_at: string | null;
  newsletter_send_token: string | null;
  newsletter_sent_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

interface MediaAssetRow {
  id: string;
  kind: 'image';
  mime_type: ImageMediaMimeType;
  original_file_name: string;
  storage_key: string;
  byte_size: number;
  expected_byte_size: number;
  width: number;
  height: number;
  default_alt: string;
  default_caption: string | null;
  status: 'pending' | 'uploading' | 'ready';
  upload_started_at: string | null;
  upload_token: string | null;
  created_at: string;
}

interface PlanRow {
  id: string;
  name_ar: string;
  name_en: string | null;
  price_minor: number;
  currency: string;
  interval: Plan['interval'];
}

interface SubscriptionRow {
  id: string;
  user_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  price_minor: number;
  currency: string;
  current_period_end: string;
  created_at: string;
}

interface FollowRow {
  user_id: string;
  show_id: string;
  created_at: string;
}

interface ProgressRow {
  user_id: string;
  episode_id: string;
  position_sec: number;
  updated_at: string;
}

const USER_SELECT = 'id, email, display_name, locale, created_at, auth_user_id';
const USER_PROFILE_SELECT = 'id, email, display_name, locale, created_at';
const STUDIO_MEMBER_WITH_ROLE_SELECT =
  'id, email, display_name, role_id, locale, created_at, auth_user_id, status, accepted_at, role_record:studio_roles!studio_members_role_id_fkey(name)';

function toUser(row: UserProfileRow): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    locale: row.locale,
    createdAt: row.created_at,
  };
}

function toStudioMember(row: StudioMemberProfileRow): StudioMember {
  const relatedRole = Array.isArray(row.role_record) ? row.role_record[0] : row.role_record;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role_id,
    roleName: row.role_name ?? relatedRole?.name ?? row.role_id,
    locale: row.locale,
    createdAt: row.created_at,
  };
}

function toStudioRole(
  row: StudioRoleRow,
  permissions: readonly string[],
  memberCount: number,
): StudioRole {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isSystem: row.is_system,
    isProtected: row.is_protected,
    permissions: toPermissionIds(permissions),
    memberCount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toStudioMemberAccess(row: StudioMemberRow): StudioMemberAccess {
  return {
    ...toStudioMember(row),
    authLinked: row.auth_user_id !== null,
    // Rows written before migration 0015 carry no status and are established
    // operators, so an absent value reads as active rather than pending.
    status: row.status ?? 'active',
    ...(row.accepted_at ? { acceptedAt: row.accepted_at } : {}),
  };
}

function toAcceptStudioInvitationResult(value: unknown): AcceptStudioInvitationResult {
  if (!value || typeof value !== 'object') {
    throw new Error('supabase: invalid invitation acceptance result');
  }
  const result = value as Record<string, unknown>;
  if (result.status === 'accepted') {
    if (!isStudioMemberRow(result.member)) {
      throw new Error('supabase: invalid accepted Studio member payload');
    }
    return { status: 'accepted', member: toStudioMemberAccess(result.member) };
  }
  if (result.status === 'not_found') return { status: 'not_found' };
  if (result.status === 'already_active') return { status: 'already_active' };
  return { status: 'failed' };
}

function toSubscriberUser(row: UserProfileRow): SubscriberUser {
  return toUser(row);
}

function toStudioMemberAccessAuditLog(row: StudioMemberAccessAuditRow): StudioMemberAccessAuditLog {
  return {
    id: row.id,
    actorStudioMemberId: row.actor_studio_member_id,
    action: STUDIO_MEMBER_ACCESS_AUDIT_ACTION,
    targetStudioMemberId: row.target_studio_member_id,
    previousRole: row.previous_role,
    newRole: row.new_role,
    requestId: row.request_id,
    createdAt: row.created_at,
  };
}

function toStudioMemberInvitationAuditLog(
  row: StudioMemberInvitationAuditRow,
): StudioMemberInvitationAuditLog {
  return {
    id: row.id,
    actorStudioMemberId: row.actor_studio_member_id,
    action: STUDIO_MEMBER_INVITATION_AUDIT_ACTION,
    targetStudioMemberId: row.target_studio_member_id,
    invitedEmail: row.invited_email,
    assignedRole: row.assigned_role,
    locale: row.locale,
    requestId: row.request_id,
    createdAt: row.created_at,
  };
}

function toPermissionIds(values: readonly string[]): PermissionId[] {
  if (!values.every(isPermissionId)) {
    throw new Error('supabase: invalid permission ID');
  }
  const permissions = values as readonly PermissionId[];
  if (
    new Set(permissions).size !== permissions.length ||
    permissions.some(
      (permission) =>
        permission.endsWith('.manage') &&
        !permissions.includes(permission.replace(/\.manage$/, '.view') as PermissionId),
    )
  ) {
    throw new Error('supabase: invalid permission matrix');
  }
  return PERMISSION_IDS.filter((permission) => permissions.includes(permission));
}

function toRolePermissionAuditLog(row: RolePermissionAuditRow): RolePermissionAuditLog {
  return {
    id: row.id,
    actorStudioMemberId: row.actor_studio_member_id,
    action: ROLE_PERMISSION_AUDIT_ACTION,
    targetRole: row.target_role,
    previousPermissions: toPermissionIds(row.previous_permissions),
    newPermissions: toPermissionIds(row.new_permissions),
    requestId: row.request_id,
    createdAt: row.created_at,
  };
}

function toRoleCreatedAuditLog(row: RoleCreatedAuditRow): RoleCreatedAuditLog {
  return {
    id: row.id,
    actorStudioMemberId: row.actor_studio_member_id,
    action: ROLE_CREATED_AUDIT_ACTION,
    targetRole: row.target_role,
    roleName: row.role_name,
    initialPermissions: toPermissionIds(row.initial_permissions),
    requestId: row.request_id,
    createdAt: row.created_at,
  };
}

function hasRoleNameRelation(value: unknown): boolean {
  const relation = Array.isArray(value) ? value[0] : value;
  return (
    typeof relation === 'object' &&
    relation !== null &&
    typeof (relation as Record<string, unknown>).name === 'string'
  );
}

function isStudioMemberRow(value: unknown): value is StudioMemberRow {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === 'string' &&
    typeof row.email === 'string' &&
    typeof row.display_name === 'string' &&
    typeof row.role_id === 'string' &&
    row.role_id.length > 0 &&
    (typeof row.role_name === 'string' || hasRoleNameRelation(row.role_record)) &&
    (row.locale === 'ar' || row.locale === 'en') &&
    (row.auth_user_id === null || typeof row.auth_user_id === 'string') &&
    typeof row.created_at === 'string'
  );
}

function toStudioMemberRoleChangeResult(value: unknown): ChangeStudioMemberRoleResult {
  if (!value || typeof value !== 'object') throw new Error('supabase: invalid role change result');
  const result = value as Record<string, unknown>;
  const status = result.status;
  if (status === 'updated' || status === 'unchanged') {
    if (!isStudioMemberRow(result.member)) {
      throw new Error('supabase: invalid Studio role change member');
    }
    return { status, member: toStudioMemberAccess(result.member) };
  }
  if (
    status === 'forbidden' ||
    status === 'not_found' ||
    status === 'role_not_found' ||
    status === 'protected_role' ||
    status === 'self_demotion' ||
    status === 'last_admin'
  ) {
    return { status };
  }
  throw new Error('supabase: unknown role change status');
}

function toRpcStudioRole(value: unknown): StudioRole {
  if (!value || typeof value !== 'object') {
    throw new Error('supabase: invalid Studio role');
  }
  const role = value as Record<string, unknown>;
  if (
    typeof role.id !== 'string' ||
    typeof role.name !== 'string' ||
    typeof role.description !== 'string' ||
    typeof role.isSystem !== 'boolean' ||
    typeof role.isProtected !== 'boolean' ||
    !Array.isArray(role.permissions) ||
    !role.permissions.every((permission): permission is string => typeof permission === 'string') ||
    typeof role.memberCount !== 'number' ||
    !Number.isInteger(role.memberCount) ||
    role.memberCount < 0 ||
    typeof role.createdAt !== 'string' ||
    typeof role.updatedAt !== 'string'
  ) {
    throw new Error('supabase: invalid Studio role payload');
  }
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    isProtected: role.isProtected,
    permissions: toPermissionIds(role.permissions),
    memberCount: role.memberCount,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
  };
}

function toRolePermissionsChangeResult(value: unknown): ChangeRolePermissionsResult {
  if (!value || typeof value !== 'object') {
    throw new Error('supabase: invalid role permission change result');
  }
  const result = value as Record<string, unknown>;
  const status = result.status;
  if (status === 'updated' || status === 'unchanged') {
    return { status, role: toRpcStudioRole(result.role) };
  }
  if (
    status === 'forbidden' ||
    status === 'not_found' ||
    status === 'immutable_role' ||
    status === 'invalid_permissions'
  ) {
    return { status };
  }
  throw new Error('supabase: unknown role permission change status');
}

function toInviteProvisionResult(
  value: unknown,
): InviteStudioMemberResult | { status: 'linked_identity' } {
  if (!value || typeof value !== 'object') {
    throw new Error('supabase: invalid invited Studio member provisioning result');
  }
  const result = value as Record<string, unknown>;
  const status = result.status;
  if (status === 'created') {
    if (!isStudioMemberRow(result.member)) {
      throw new Error('supabase: invalid invited Studio member payload');
    }
    return { status: 'created', member: toStudioMemberAccess(result.member) };
  }
  if (status === 'forbidden') return { status: 'forbidden' };
  if (status === 'role_not_found') return { status: 'role_not_found' };
  if (status === 'protected_role') return { status: 'protected_role' };
  if (status === 'duplicate_email') return { status: 'duplicate_email' };
  if (status === 'duplicate_auth_identity') return { status: 'linked_identity' };
  if (status === 'invalid_input') return { status: 'provision_failed' };
  throw new Error('supabase: unknown invited Studio member provisioning status');
}

function toCreateRoleResult(value: unknown): CreateRoleResult {
  if (!value || typeof value !== 'object') {
    throw new Error('supabase: invalid role creation result');
  }
  const result = value as Record<string, unknown>;
  if (result.status === 'created') {
    return { status: 'created', role: toRpcStudioRole(result.role) };
  }
  if (
    result.status === 'forbidden' ||
    result.status === 'duplicate_name' ||
    result.status === 'invalid_input' ||
    result.status === 'invalid_permissions'
  ) {
    return { status: result.status };
  }
  throw new Error('supabase: unknown role creation status');
}

function toShow(row: ShowRow): Show {
  return {
    id: row.id,
    slug: row.slug,
    titleAr: row.title_ar,
    titleEn: row.title_en ?? undefined,
    descriptionAr: row.description_ar,
    descriptionEn: row.description_en ?? undefined,
    hostName: row.host_name,
    artworkUrl: row.artwork_url ?? undefined,
    category: row.category,
    premium: row.premium,
    createdAt: row.created_at,
  };
}

function toGuest(row: GuestRow): Guest {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    role: row.role,
    city: row.city,
    email: row.email,
    bio: row.bio,
    photoUrl: row.photo_url ?? undefined,
    createdAt: row.created_at,
  };
}

function toGuestSocial(row: GuestSocialRow): GuestSocial {
  return {
    id: row.id,
    guestId: row.guest_id,
    platform: row.platform,
    handle: row.handle,
  };
}

function toGuestAppearance(row: GuestAppearanceRow): GuestAppearance {
  return { guestId: row.guest_id, episodeId: row.episode_id };
}

function guestPatch(input: Record<string, unknown>): Record<string, unknown> {
  const map: Record<string, string> = {
    slug: 'slug',
    name: 'name',
    role: 'role',
    city: 'city',
    email: 'email',
    bio: 'bio',
    photoUrl: 'photo_url',
  };
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && map[key]) patch[map[key]] = value;
  }
  return patch;
}

/** Postgres unique-violation, used to turn a race into a domain result. */
function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === '23505';
}

function toEpisode(row: EpisodeRow): Episode {
  return {
    id: row.id,
    showId: row.show_id,
    titleAr: row.title_ar,
    titleEn: row.title_en ?? undefined,
    showNotesAr: row.show_notes_ar,
    showNotesEn: row.show_notes_en ?? undefined,
    audioKey: row.audio_key ?? undefined,
    audioUrl: row.audio_url ?? undefined,
    durationSec: row.duration_sec,
    episodeNumber: row.episode_number,
    premium: row.premium,
    status: row.status,
    publishAt: row.publish_at ?? undefined,
    createdAt: row.created_at,
  };
}

function toArticleAuthor(row: ArticleRow): ArticleAuthor {
  if (row.author_type === 'custom') {
    return { type: 'custom', displayName: row.author_display_name };
  }
  if (row.author_type === 'studio_member' && row.author_studio_member_id) {
    return {
      type: 'studio_member',
      studioMemberId: row.author_studio_member_id,
      displayName: row.author_display_name,
    };
  }
  throw new Error('supabase: invalid article author');
}

function toArticle(row: ArticleRow): Article {
  return refreshNeedsSync({
    id: row.id,
    slug: row.slug,
    titleAr: row.title_ar,
    titleEn: row.title_en ?? undefined,
    author: toArticleAuthor(row),
    authorPlacement: row.author_placement,
    excerptAr: row.excerpt_ar ?? undefined,
    bodyAr: row.body_ar,
    coverUrl: row.cover_url ?? undefined,
    coverAlt: row.cover_alt ?? undefined,
    content: row.content_json,
    contentHtml: row.content_html,
    seo: {
      title: row.seo_title ?? undefined,
      description: row.seo_description ?? undefined,
      canonicalUrl: row.canonical_url ?? undefined,
      socialTitle: row.social_title ?? undefined,
      socialDescription: row.social_description ?? undefined,
      socialImageUrl: row.social_image_url ?? undefined,
      noIndex: row.no_index,
    },
    status: row.status,
    publishedAt: row.published_at ?? undefined,
    newsletter: {
      enabled: row.newsletter_enabled,
      subject: row.newsletter_subject ?? undefined,
      preheader: row.newsletter_preheader ?? undefined,
      status: row.newsletter_status,
      campaignId: row.mailchimp_campaign_id ?? undefined,
      syncedVersion: row.newsletter_synced_version ?? undefined,
      needsSync: false,
      syncStartedAt: row.newsletter_sync_started_at ?? undefined,
      sentAt: row.newsletter_sent_at ?? undefined,
    },
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function toMediaAsset(row: MediaAssetRow): StoredMediaAsset {
  return {
    id: row.id,
    kind: row.kind,
    mimeType: row.mime_type,
    fileName: row.original_file_name,
    storageKey: row.storage_key,
    byteSize: row.byte_size,
    expectedByteSize: row.expected_byte_size,
    width: row.width,
    height: row.height,
    defaultAlt: row.default_alt,
    defaultCaption: row.default_caption ?? undefined,
    status: row.status,
    uploadStartedAt: row.upload_started_at ?? undefined,
    uploadToken: row.upload_token ?? undefined,
    createdAt: row.created_at,
  };
}

function toPlan(row: PlanRow): Plan {
  return {
    id: row.id,
    nameAr: row.name_ar,
    nameEn: row.name_en ?? undefined,
    priceMinor: row.price_minor,
    currency: row.currency,
    interval: row.interval,
  };
}

function toSubscription(row: SubscriptionRow): Subscription {
  return {
    id: row.id,
    userId: row.user_id,
    planId: row.plan_id,
    status: row.status,
    priceMinor: row.price_minor,
    currency: row.currency,
    currentPeriodEnd: row.current_period_end,
    createdAt: row.created_at,
  };
}

function toFollow(row: FollowRow): Follow {
  return { userId: row.user_id, showId: row.show_id, createdAt: row.created_at };
}

function toProgress(row: ProgressRow): PlaybackProgress {
  return {
    userId: row.user_id,
    episodeId: row.episode_id,
    positionSec: row.position_sec,
    updatedAt: row.updated_at,
  };
}

function throwOn(error: { message: string } | null): void {
  if (error) throw new Error(`supabase: ${error.message}`);
}

function showPatch(input: Record<string, unknown>): Record<string, unknown> {
  const map: Record<string, string> = {
    slug: 'slug',
    titleAr: 'title_ar',
    titleEn: 'title_en',
    descriptionAr: 'description_ar',
    descriptionEn: 'description_en',
    hostName: 'host_name',
    artworkUrl: 'artwork_url',
    category: 'category',
    premium: 'premium',
  };
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && map[key]) patch[map[key]] = value;
  }
  return patch;
}

function episodePatch(input: Record<string, unknown>): Record<string, unknown> {
  const map: Record<string, string> = {
    showId: 'show_id',
    titleAr: 'title_ar',
    titleEn: 'title_en',
    showNotesAr: 'show_notes_ar',
    showNotesEn: 'show_notes_en',
    audioUrl: 'audio_url',
    durationSec: 'duration_sec',
    episodeNumber: 'episode_number',
    premium: 'premium',
  };
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && map[key]) patch[map[key]] = value;
  }
  return patch;
}

function articleRecord(article: Article): Record<string, unknown> {
  return {
    id: article.id,
    slug: article.slug,
    title_ar: article.titleAr,
    title_en: article.titleEn ?? null,
    author_type: article.author.type,
    author_display_name: article.author.displayName,
    author_studio_member_id:
      article.author.type === 'studio_member' ? article.author.studioMemberId : null,
    author_placement: article.authorPlacement,
    excerpt_ar: article.excerptAr ?? null,
    body_ar: article.bodyAr,
    cover_url: article.coverUrl ?? null,
    cover_alt: article.coverAlt ?? null,
    content_json: article.content,
    content_html: article.contentHtml,
    seo_title: article.seo.title ?? null,
    seo_description: article.seo.description ?? null,
    canonical_url: article.seo.canonicalUrl ?? null,
    social_title: article.seo.socialTitle ?? null,
    social_description: article.seo.socialDescription ?? null,
    social_image_url: article.seo.socialImageUrl ?? null,
    no_index: article.seo.noIndex,
    status: article.status,
    published_at: article.publishedAt ?? null,
    newsletter_enabled: article.newsletter.enabled,
    newsletter_subject: article.newsletter.subject ?? null,
    newsletter_preheader: article.newsletter.preheader ?? null,
    newsletter_status: article.newsletter.status,
    mailchimp_campaign_id: article.newsletter.campaignId ?? null,
    newsletter_synced_version: article.newsletter.syncedVersion ?? null,
    newsletter_sync_started_at: article.newsletter.syncStartedAt ?? null,
    newsletter_sent_at: article.newsletter.sentAt ?? null,
    version: article.version,
    created_at: article.createdAt,
    updated_at: article.updatedAt,
  };
}

export function createSupabaseRepository(url: string, serviceRoleKey: string): Repository {
  const db: SupabaseClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });

  async function single<Row, Out>(
    query: PromiseLike<{ data: Row | null; error: { message: string } | null }>,
    map: (row: Row) => Out,
  ): Promise<Out | null> {
    const { data, error } = await query;
    if (error && !error.message.includes('0 rows')) throwOn(error);
    return data ? map(data) : null;
  }

  async function rollbackInvitedAuthUser(authUserId: string, requestId: string): Promise<boolean> {
    try {
      const { error } = await db.auth.admin.deleteUser(authUserId, false);
      if (!error || error.code === 'user_not_found') return true;
      console.error('Supabase invited-user rollback failed', {
        requestId,
        authCode: error.code,
        authStatus: error.status,
      });
      return false;
    } catch (error) {
      console.error('Supabase invited-user rollback threw', {
        requestId,
        error: error instanceof Error ? error.message : 'Unknown rollback error',
      });
      return false;
    }
  }

  async function reconcileInvitedStudioMember(
    authUserId: string,
    input: InviteStudioMemberInput,
    requestId: string,
  ): Promise<
    | { status: 'created'; member: StudioMemberAccess }
    | { status: 'absent' }
    | { status: 'uncertain' }
  > {
    try {
      const { data, error } = await db
        .from('studio_members')
        .select(STUDIO_MEMBER_WITH_ROLE_SELECT)
        .eq('auth_user_id', authUserId)
        .maybeSingle();
      if (error) {
        console.error('Supabase invited Studio member reconciliation failed', {
          requestId,
          databaseError: error.message,
        });
        return { status: 'uncertain' };
      }
      if (!data) return { status: 'absent' };
      if (!isStudioMemberRow(data)) {
        console.error('Supabase invited Studio member reconciliation returned an invalid row', {
          requestId,
        });
        return { status: 'uncertain' };
      }

      const member = toStudioMemberAccess(data);
      if (
        member.email !== input.email ||
        member.displayName !== input.displayName ||
        member.role !== input.role ||
        member.locale !== input.locale ||
        !member.authLinked
      ) {
        console.error('Supabase invited Studio member reconciliation found mismatched data', {
          requestId,
          targetStudioMemberId: member.id,
        });
        return { status: 'uncertain' };
      }
      return { status: 'created', member };
    } catch (error) {
      console.error('Supabase invited Studio member reconciliation threw', {
        requestId,
        error: error instanceof Error ? error.message : 'Unknown reconciliation error',
      });
      return { status: 'uncertain' };
    }
  }

  async function recoverOrRollbackFailedProvision(
    authUserId: string,
    input: InviteStudioMemberInput,
    requestId: string,
  ): Promise<InviteStudioMemberResult> {
    const reconciliation = await reconcileInvitedStudioMember(authUserId, input, requestId);
    if (reconciliation.status === 'created') return reconciliation;
    if (reconciliation.status === 'uncertain') return { status: 'partial_failure' };
    return (await rollbackInvitedAuthUser(authUserId, requestId))
      ? { status: 'provision_failed' }
      : { status: 'partial_failure' };
  }

  async function loadRoles(roleId?: RoleId): Promise<StudioRole[]> {
    let roleQuery = db.from('studio_roles').select('*');
    let permissionsQuery = db.from('role_permissions').select('role, permission');
    let membersQuery = db.from('studio_members').select('role_id');
    if (roleId) {
      roleQuery = roleQuery.eq('id', roleId);
      permissionsQuery = permissionsQuery.eq('role', roleId);
      membersQuery = membersQuery.eq('role_id', roleId);
    }
    const [roleResponse, permissionsResponse, membersResponse] = await Promise.all([
      roleQuery.order('created_at').order('id'),
      permissionsQuery,
      membersQuery,
    ]);
    throwOn(roleResponse.error);
    throwOn(permissionsResponse.error);
    throwOn(membersResponse.error);

    const permissionsByRole = new Map<RoleId, string[]>();
    for (const row of (permissionsResponse.data ?? []) as RolePermissionRow[]) {
      const current = permissionsByRole.get(row.role) ?? [];
      current.push(row.permission);
      permissionsByRole.set(row.role, current);
    }
    const memberCounts = new Map<RoleId, number>();
    for (const row of (membersResponse.data ?? []) as Array<{ role_id: RoleId }>) {
      memberCounts.set(row.role_id, (memberCounts.get(row.role_id) ?? 0) + 1);
    }
    return ((roleResponse.data ?? []) as StudioRoleRow[]).map((role) =>
      toStudioRole(role, permissionsByRole.get(role.id) ?? [], memberCounts.get(role.id) ?? 0),
    );
  }

  async function loadActorRole(actorStudioMemberId: string): Promise<RoleId | null> {
    const { data, error } = await db
      .from('studio_members')
      .select('role_id')
      .eq('id', actorStudioMemberId)
      .maybeSingle();
    throwOn(error);
    if (!data || typeof data.role_id !== 'string') return null;
    return data.role_id;
  }

  async function actorCanManageAccess(actorStudioMemberId: string): Promise<boolean> {
    const actorRole = await loadActorRole(actorStudioMemberId);
    if (!actorRole) return false;
    if (actorRole === 'admin') return true;
    const { data, error } = await db
      .from('role_permissions')
      .select('role')
      .eq('role', actorRole)
      .eq('permission', 'access.manage')
      .limit(1);
    throwOn(error);
    return (data ?? []).length > 0;
  }

  return {
    async getUser(id) {
      return single<UserRow, User>(
        db.from('users').select(USER_SELECT).eq('id', id).maybeSingle(),
        toUser,
      );
    },
    async getUserByAuthId(authUserId) {
      return single<UserRow, User>(
        db.from('users').select(USER_SELECT).eq('auth_user_id', authUserId).maybeSingle(),
        toUser,
      );
    },
    async listSubscriberUsers() {
      const { data, error } = await db
        .from('users')
        .select(USER_PROFILE_SELECT)
        .order('created_at');
      throwOn(error);
      return ((data ?? []) as UserProfileRow[]).map(toSubscriberUser);
    },
    async getStudioMember(id) {
      return single<StudioMemberRow, StudioMember>(
        db.from('studio_members').select(STUDIO_MEMBER_WITH_ROLE_SELECT).eq('id', id).maybeSingle(),
        toStudioMember,
      );
    },
    async getStudioMemberByAuthId(authUserId) {
      return single<StudioMemberRow, StudioMember>(
        db
          .from('studio_members')
          .select(STUDIO_MEMBER_WITH_ROLE_SELECT)
          .eq('auth_user_id', authUserId)
          .maybeSingle(),
        toStudioMember,
      );
    },
    async getStudioMemberAccessByAuthId(authUserId) {
      return single<StudioMemberRow, StudioMemberAccess>(
        db
          .from('studio_members')
          .select(STUDIO_MEMBER_WITH_ROLE_SELECT)
          .eq('auth_user_id', authUserId)
          .maybeSingle(),
        toStudioMemberAccess,
      );
    },
    async acceptStudioInvitation(
      authUserId,
      requestId,
    ): Promise<AcceptStudioInvitationResult> {
      // studio_members is SELECT-only for service_role, so the state change runs
      // inside the security-definer RPC under the access-control advisory lock.
      try {
        const { data, error } = await db.rpc('accept_studio_member_invitation', {
          p_auth_user_id: authUserId,
          p_request_id: requestId,
        });
        if (error) {
          console.error('Supabase Studio invitation acceptance failed', {
            requestId,
            databaseError: error.message,
          });
          return { status: 'failed' };
        }
        return toAcceptStudioInvitationResult(data);
      } catch (error) {
        console.error('Supabase Studio invitation acceptance threw', {
          requestId,
          error: error instanceof Error ? error.message : 'Unknown acceptance error',
        });
        return { status: 'failed' };
      }
    },
    async listSubscriberUsersPage(query: ListQuery): Promise<PageResult<SubscriberUser>> {
      let request = db
        .from('users')
        .select(USER_PROFILE_SELECT, { count: 'exact' })
        .order('created_at');
      if (query.search) {
        const pattern = escapeSearchPattern(query.search);
        request = request.or(`display_name.ilike.%${pattern}%,email.ilike.%${pattern}%`);
      }
      const { from, to } = pageRange(query);
      const { data, error, count } = await request.range(from, to);
      throwOn(error);
      return {
        items: ((data ?? []) as UserProfileRow[]).map(toSubscriberUser),
        total: count ?? 0,
      };
    },
    async listStudioMembers() {
      const { data, error } = await db
        .from('studio_members')
        .select(STUDIO_MEMBER_WITH_ROLE_SELECT)
        .order('created_at');
      throwOn(error);
      return ((data ?? []) as StudioMemberRow[]).map(toStudioMemberAccess);
    },
    async listStudioMembersPage(query: ListQuery): Promise<PageResult<StudioMemberAccess>> {
      let request = db
        .from('studio_members')
        .select(STUDIO_MEMBER_WITH_ROLE_SELECT, { count: 'exact' })
        .order('created_at');
      if (query.search) {
        const pattern = escapeSearchPattern(query.search);
        request = request.or(`display_name.ilike.%${pattern}%,email.ilike.%${pattern}%`);
      }
      const { from, to } = pageRange(query);
      const { data, error, count } = await request.range(from, to);
      throwOn(error);
      return {
        items: ((data ?? []) as StudioMemberRow[]).map(toStudioMemberAccess),
        total: count ?? 0,
      };
    },
    async inviteStudioMember(actorStudioMemberId, input, requestId, redirectTo) {
      if (!redirectTo) return { status: 'unavailable' };

      const selectedRole = (await loadRoles(input.role))[0];
      if (!selectedRole) return { status: 'role_not_found' };
      const actorRole = await loadActorRole(actorStudioMemberId);
      if (!(await actorCanManageAccess(actorStudioMemberId))) return { status: 'forbidden' };
      if (selectedRole.isProtected && actorRole !== 'admin') {
        return { status: 'protected_role' };
      }

      // Avoid sending an invitation for an already-provisioned Studio member. The
      // migration canonicalizes stored emails, while the validation contract
      // canonicalizes the request. The RPC repeats this check under a lock to
      // protect against concurrent invitations.
      try {
        const { data, error } = await db
          .from('studio_members')
          .select('id')
          .eq('email', input.email)
          .limit(1);
        if (error) {
          console.error('Supabase Studio invitation duplicate preflight failed', {
            requestId,
            databaseError: error.message,
          });
          return { status: 'provision_failed' };
        }
        if ((data ?? []).length > 0) return { status: 'duplicate_email' };
      } catch (error) {
        console.error('Supabase Studio invitation duplicate preflight threw', {
          requestId,
          error: error instanceof Error ? error.message : 'Unknown preflight error',
        });
        return { status: 'provision_failed' };
      }

      let invitedAuthUserId: string;
      try {
        const { data, error } = await db.auth.admin.inviteUserByEmail(input.email, {
          redirectTo,
          data: {
            display_name: input.displayName,
            locale: input.locale,
          },
        });

        if (error) {
          if (
            error.code === 'email_exists' ||
            error.code === 'user_already_exists' ||
            error.code === 'identity_already_exists'
          ) {
            return { status: 'auth_identity_exists' };
          }
          console.error('Supabase Studio invitation failed', {
            requestId,
            authCode: error.code,
            authStatus: error.status,
          });
          return { status: 'invite_failed' };
        }

        if (!data.user?.id) {
          console.error('Supabase Studio invitation returned no Auth identity', { requestId });
          return { status: 'invite_failed' };
        }
        invitedAuthUserId = data.user.id;
      } catch (error) {
        console.error('Supabase Studio invitation threw', {
          requestId,
          error: error instanceof Error ? error.message : 'Unknown invitation error',
        });
        return { status: 'invite_failed' };
      }

      let provisionResponse;
      try {
        provisionResponse = await db.rpc('provision_invited_studio_member', {
          p_actor_studio_member_id: actorStudioMemberId,
          p_auth_user_id: invitedAuthUserId,
          p_display_name: input.displayName,
          p_email: input.email,
          p_role: input.role,
          p_locale: input.locale,
          p_request_id: requestId,
        });
      } catch (error) {
        console.error('Supabase invited Studio member provisioning threw', {
          requestId,
          error: error instanceof Error ? error.message : 'Unknown provisioning error',
        });
        return recoverOrRollbackFailedProvision(invitedAuthUserId, input, requestId);
      }

      const { data, error } = provisionResponse;

      if (error) {
        console.error('Supabase invited Studio member provisioning failed', {
          requestId,
          databaseError: error.message,
        });
        return recoverOrRollbackFailedProvision(invitedAuthUserId, input, requestId);
      }

      let result: InviteStudioMemberResult | { status: 'linked_identity' };
      try {
        result = toInviteProvisionResult(data);
      } catch (error) {
        // The transaction may already have committed. Reconcile before any
        // rollback so a successfully linked identity is never deleted.
        console.error('Supabase invited Studio member returned an invalid result', {
          requestId,
          error: error instanceof Error ? error.message : 'Unknown result error',
        });
        return recoverOrRollbackFailedProvision(invitedAuthUserId, input, requestId);
      }

      if (result.status === 'created') return result;
      if (result.status === 'linked_identity') {
        // A linked identity must never be deleted as rollback.
        console.error('Supabase invited Auth identity was already linked', { requestId });
        return { status: 'partial_failure' };
      }

      const rolledBack = await rollbackInvitedAuthUser(invitedAuthUserId, requestId);
      if (!rolledBack) return { status: 'partial_failure' };
      return result;
    },
    async changeStudioMemberRole(actorStudioMemberId, targetStudioMemberId, role, requestId) {
      const { data, error } = await db.rpc('change_studio_member_role', {
        p_actor_studio_member_id: actorStudioMemberId,
        p_target_studio_member_id: targetStudioMemberId,
        p_new_role: role,
        p_request_id: requestId,
      });
      throwOn(error);
      return toStudioMemberRoleChangeResult(data);
    },
    async listStudioMemberAccessAuditLogs() {
      const { data, error } = await db
        .from('studio_member_access_audit_logs')
        .select('*')
        .order('created_at', { ascending: false });
      throwOn(error);
      return ((data ?? []) as StudioMemberAccessAuditRow[]).map(toStudioMemberAccessAuditLog);
    },
    async listStudioMemberInvitationAuditLogs() {
      const { data, error } = await db
        .from('studio_member_invitation_audit_logs')
        .select('*')
        .order('created_at', { ascending: false });
      throwOn(error);
      return ((data ?? []) as StudioMemberInvitationAuditRow[]).map(
        toStudioMemberInvitationAuditLog,
      );
    },
    async listRoles() {
      return loadRoles();
    },
    async getRole(roleId) {
      return (await loadRoles(roleId))[0] ?? null;
    },
    async createRole(actorStudioMemberId, input: CreateStudioRoleInput, requestId) {
      const { data, error } = await db.rpc('create_studio_role', {
        p_actor_studio_member_id: actorStudioMemberId,
        p_name: input.name,
        p_description: input.description ?? '',
        p_permissions: input.permissions,
        p_request_id: requestId,
      });
      throwOn(error);
      return toCreateRoleResult(data);
    },
    async resolveRolePermissions(role) {
      const { data, error } = await db
        .from('role_permissions')
        .select('role, permission')
        .eq('role', role);
      throwOn(error);
      const permissions = ((data ?? []) as RolePermissionRow[]).map((row) => row.permission);
      return toPermissionIds(permissions);
    },
    async getRolePermissionMatrix() {
      return Object.fromEntries(
        (await loadRoles()).map((role) => [role.id, [...role.permissions]]),
      ) as RolePermissionMatrix;
    },
    async changeRolePermissions(actorStudioMemberId, role, permissions, requestId) {
      const { data, error } = await db.rpc('change_role_permissions', {
        p_actor_studio_member_id: actorStudioMemberId,
        p_target_role: role,
        p_permissions: permissions,
        p_request_id: requestId,
      });
      throwOn(error);
      return toRolePermissionsChangeResult(data);
    },
    async listRolePermissionAuditLogs() {
      const { data, error } = await db
        .from('role_permission_audit_logs')
        .select('*')
        .order('created_at', { ascending: false });
      throwOn(error);
      return ((data ?? []) as RolePermissionAuditRow[]).map(toRolePermissionAuditLog);
    },
    async listRoleCreatedAuditLogs() {
      const { data, error } = await db
        .from('role_creation_audit_logs')
        .select('*')
        .order('created_at', { ascending: false });
      throwOn(error);
      return ((data ?? []) as RoleCreatedAuditRow[]).map(toRoleCreatedAuditLog);
    },

    async listShows() {
      const { data, error } = await db.from('shows').select('*').order('created_at');
      throwOn(error);
      return ((data ?? []) as ShowRow[]).map(toShow);
    },
    async listShowsPage(query: ListQuery): Promise<PageResult<Show>> {
      let request = db.from('shows').select('*', { count: 'exact' }).order('created_at');
      if (query.search) {
        const pattern = escapeSearchPattern(query.search);
        request = request.or(
          `title_ar.ilike.%${pattern}%,title_en.ilike.%${pattern}%,host_name.ilike.%${pattern}%,slug.ilike.%${pattern}%`,
        );
      }
      const { from, to } = pageRange(query);
      const { data, error, count } = await request.range(from, to);
      throwOn(error);
      return { items: ((data ?? []) as ShowRow[]).map(toShow), total: count ?? 0 };
    },
    async getShow(id) {
      return single<ShowRow, Show>(db.from('shows').select('*').eq('id', id).maybeSingle(), toShow);
    },
    async getShowBySlug(slug) {
      return single<ShowRow, Show>(
        db.from('shows').select('*').eq('slug', slug).maybeSingle(),
        toShow,
      );
    },
    async createShow(input) {
      const { data, error } = await db.from('shows').insert(showPatch(input)).select().single();
      throwOn(error);
      return toShow(data as ShowRow);
    },
    async updateShow(id, input) {
      return single<ShowRow, Show>(
        db.from('shows').update(showPatch(input)).eq('id', id).select().maybeSingle(),
        toShow,
      );
    },

    async listEpisodes(filter) {
      let query = db.from('episodes').select('*');
      if (filter.showId) query = query.eq('show_id', filter.showId);
      if (filter.status) query = query.eq('status', filter.status);
      const { data, error } = await query.order('publish_at', {
        ascending: false,
        nullsFirst: false,
      });
      throwOn(error);
      return ((data ?? []) as EpisodeRow[]).map(toEpisode);
    },
    async listEpisodesPage(filter, query: ListQuery): Promise<PageResult<Episode>> {
      let request = db.from('episodes').select('*', { count: 'exact' });
      if (filter.showId) request = request.eq('show_id', filter.showId);
      if (filter.status) request = request.eq('status', filter.status);
      if (query.search) {
        const pattern = escapeSearchPattern(query.search);
        request = request.or(`title_ar.ilike.%${pattern}%,title_en.ilike.%${pattern}%`);
      }
      const { from, to } = pageRange(query);
      const { data, error, count } = await request
        .order('publish_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .range(from, to);
      throwOn(error);
      return { items: ((data ?? []) as EpisodeRow[]).map(toEpisode), total: count ?? 0 };
    },
    async getEpisode(id) {
      return single<EpisodeRow, Episode>(
        db.from('episodes').select('*').eq('id', id).maybeSingle(),
        toEpisode,
      );
    },
    async createEpisode(input) {
      const { data, error } = await db
        .from('episodes')
        .insert({ ...episodePatch(input), status: 'draft' })
        .select()
        .single();
      throwOn(error);
      return toEpisode(data as EpisodeRow);
    },
    async updateEpisode(id, input) {
      return single<EpisodeRow, Episode>(
        db.from('episodes').update(episodePatch(input)).eq('id', id).select().maybeSingle(),
        toEpisode,
      );
    },
    async updateEpisodeStatus(id, status, publishAt) {
      const patch: Record<string, unknown> = { status };
      if (publishAt !== undefined) patch.publish_at = publishAt;
      return single<EpisodeRow, Episode>(
        db.from('episodes').update(patch).eq('id', id).select().maybeSingle(),
        toEpisode,
      );
    },
    async setEpisodeAudioKey(id, audioKey) {
      return single<EpisodeRow, Episode>(
        db.from('episodes').update({ audio_key: audioKey }).eq('id', id).select().maybeSingle(),
        toEpisode,
      );
    },

    async listReadyMediaAssets() {
      const { data, error } = await db
        .from('article_media_assets')
        .select('*')
        .eq('status', 'ready')
        .order('created_at', { ascending: false });
      throwOn(error);
      return ((data ?? []) as MediaAssetRow[]).map(toMediaAsset);
    },
    async getMediaAsset(id) {
      return single<MediaAssetRow, StoredMediaAsset>(
        db.from('article_media_assets').select('*').eq('id', id).maybeSingle(),
        toMediaAsset,
      );
    },
    async createMediaUpload(input) {
      const { data, error } = await db
        .from('article_media_assets')
        .insert({
          id: input.id,
          kind: 'image',
          mime_type: input.mimeType,
          original_file_name: input.fileName,
          storage_key: input.storageKey,
          byte_size: input.expectedByteSize,
          expected_byte_size: input.expectedByteSize,
          width: input.width,
          height: input.height,
          default_alt: input.defaultAlt,
          default_caption: input.defaultCaption ?? null,
          status: 'pending',
          created_at: input.createdAt,
        })
        .select()
        .single();
      throwOn(error);
      return toMediaAsset(data as MediaAssetRow);
    },
    async claimMediaUpload(id, staleBefore) {
      const startedAt = new Date().toISOString();
      const uploadToken = crypto.randomUUID();
      const pending = await single<MediaAssetRow, StoredMediaAsset>(
        db
          .from('article_media_assets')
          .update({
            status: 'uploading',
            upload_started_at: startedAt,
            upload_token: uploadToken,
          })
          .eq('id', id)
          .eq('status', 'pending')
          .select()
          .maybeSingle(),
        toMediaAsset,
      );
      if (pending) return { asset: pending, uploadToken };
      const reclaimedToken = crypto.randomUUID();
      const reclaimed = await single<MediaAssetRow, StoredMediaAsset>(
        db
          .from('article_media_assets')
          .update({
            status: 'uploading',
            upload_started_at: startedAt,
            upload_token: reclaimedToken,
          })
          .eq('id', id)
          .eq('status', 'uploading')
          .lt('upload_started_at', staleBefore)
          .select()
          .maybeSingle(),
        toMediaAsset,
      );
      return reclaimed ? { asset: reclaimed, uploadToken: reclaimedToken } : null;
    },
    async completeMediaUpload(id, byteSize, uploadToken, storageKey) {
      return single<MediaAssetRow, StoredMediaAsset>(
        db
          .from('article_media_assets')
          .update({
            status: 'ready',
            byte_size: byteSize,
            storage_key: storageKey,
            upload_started_at: null,
            upload_token: null,
          })
          .eq('id', id)
          .eq('status', 'uploading')
          .eq('upload_token', uploadToken)
          .select()
          .maybeSingle(),
        toMediaAsset,
      );
    },
    async releaseMediaUpload(id, uploadToken) {
      // Bind release to the private lease so a stale worker cannot release a
      // newer upload which reclaimed the same reservation.
      const { error } = await db
        .from('article_media_assets')
        .update({ status: 'pending', upload_started_at: null, upload_token: null })
        .eq('id', id)
        .eq('status', 'uploading')
        .eq('upload_token', uploadToken);
      throwOn(error);
    },

    async listArticles(filter) {
      let query = db.from('articles').select('*');
      if (filter.status) query = query.eq('status', filter.status);
      const { data, error } = await query.order('created_at', { ascending: false });
      throwOn(error);
      return ((data ?? []) as ArticleRow[]).map(toArticle);
    },
    async listArticlesPage(filter, query: ListQuery): Promise<PageResult<Article>> {
      let request = db.from('articles').select('*', { count: 'exact' });
      if (filter.status) request = request.eq('status', filter.status);
      if (query.search) {
        const pattern = escapeSearchPattern(query.search);
        request = request.or(
          `title_ar.ilike.%${pattern}%,title_en.ilike.%${pattern}%,slug.ilike.%${pattern}%`,
        );
      }
      const { from, to } = pageRange(query);
      const { data, error, count } = await request
        .order('created_at', { ascending: false })
        .range(from, to);
      throwOn(error);
      return { items: ((data ?? []) as ArticleRow[]).map(toArticle), total: count ?? 0 };
    },

    async readGuestDirectory() {
      const [guestResult, socialResult, appearanceResult] = await Promise.all([
        db.from('guests').select('*').order('created_at', { ascending: false }),
        db.from('guest_socials').select('*').order('created_at'),
        db.from('guest_appearances').select('guest_id, episode_id'),
      ]);
      throwOn(guestResult.error);
      throwOn(socialResult.error);
      throwOn(appearanceResult.error);
      return {
        guests: ((guestResult.data ?? []) as GuestRow[]).map(toGuest),
        socials: ((socialResult.data ?? []) as GuestSocialRow[]).map(toGuestSocial),
        appearances: ((appearanceResult.data ?? []) as GuestAppearanceRow[]).map(
          toGuestAppearance,
        ),
      };
    },
    async listGuestsPage(query: ListQuery): Promise<PageResult<Guest>> {
      let request = db.from('guests').select('*', { count: 'exact' });
      if (query.search) {
        const pattern = escapeSearchPattern(query.search);
        request = request.or(
          `name.ilike.%${pattern}%,role.ilike.%${pattern}%,city.ilike.%${pattern}%,email.ilike.%${pattern}%,slug.ilike.%${pattern}%`,
        );
      }
      const { from, to } = pageRange(query);
      const { data, error, count } = await request
        .order('created_at', { ascending: false })
        .range(from, to);
      throwOn(error);
      return { items: ((data ?? []) as GuestRow[]).map(toGuest), total: count ?? 0 };
    },
    async getGuest(id) {
      return single<GuestRow, Guest>(
        db.from('guests').select('*').eq('id', id).maybeSingle(),
        toGuest,
      );
    },
    async getGuestBySlug(slug) {
      return single<GuestRow, Guest>(
        db.from('guests').select('*').eq('slug', slug).maybeSingle(),
        toGuest,
      );
    },
    async createGuest(slug, input) {
      const { data, error } = await db
        .from('guests')
        .insert({
          slug,
          name: input.name ?? '',
          role: input.role ?? '',
          city: input.city ?? '',
          email: input.email ?? '',
          bio: input.bio ?? '',
          photo_url: input.photoUrl ?? null,
        })
        .select()
        .single();
      throwOn(error);
      return toGuest(data as GuestRow);
    },
    async updateGuest(id, input) {
      const patch = guestPatch(input);
      if (Object.keys(patch).length === 0) {
        return single<GuestRow, Guest>(
          db.from('guests').select('*').eq('id', id).maybeSingle(),
          toGuest,
        );
      }
      return single<GuestRow, Guest>(
        db.from('guests').update(patch).eq('id', id).select().maybeSingle(),
        toGuest,
      );
    },
    async listGuestSocials(guestId) {
      const { data, error } = await db
        .from('guest_socials')
        .select('*')
        .eq('guest_id', guestId)
        .order('created_at');
      throwOn(error);
      return ((data ?? []) as GuestSocialRow[]).map(toGuestSocial);
    },
    async getGuestSocial(id) {
      return single<GuestSocialRow, GuestSocial>(
        db.from('guest_socials').select('*').eq('id', id).maybeSingle(),
        toGuestSocial,
      );
    },
    async createGuestSocial(guestId, input): Promise<CreateGuestSocialResult> {
      const guest = await db.from('guests').select('id').eq('id', guestId).maybeSingle();
      throwOn(guest.error);
      if (!guest.data) return { status: 'guest_not_found' };
      const { data, error } = await db
        .from('guest_socials')
        .insert({ guest_id: guestId, platform: input.platform, handle: input.handle })
        .select()
        .single();
      // The unique index is the authority; a concurrent insert lands here.
      if (isUniqueViolation(error)) return { status: 'duplicate_platform' };
      throwOn(error);
      return { status: 'created', social: toGuestSocial(data as GuestSocialRow) };
    },
    async updateGuestSocial(id, input): Promise<UpdateGuestSocialResult> {
      const patch: Record<string, unknown> = {};
      if (input.platform !== undefined) patch.platform = input.platform;
      if (input.handle !== undefined) patch.handle = input.handle;
      if (Object.keys(patch).length === 0) {
        const current = await single<GuestSocialRow, GuestSocial>(
          db.from('guest_socials').select('*').eq('id', id).maybeSingle(),
          toGuestSocial,
        );
        return current ? { status: 'updated', social: current } : { status: 'not_found' };
      }
      const { data, error } = await db
        .from('guest_socials')
        .update(patch)
        .eq('id', id)
        .select()
        .maybeSingle();
      if (isUniqueViolation(error)) return { status: 'duplicate_platform' };
      throwOn(error);
      return data
        ? { status: 'updated', social: toGuestSocial(data as GuestSocialRow) }
        : { status: 'not_found' };
    },
    async deleteGuestSocial(id) {
      const { data, error } = await db
        .from('guest_socials')
        .delete()
        .eq('id', id)
        .select('id')
        .maybeSingle();
      throwOn(error);
      return Boolean(data);
    },
    async listGuestAppearances(guestId) {
      const { data, error } = await db
        .from('guest_appearances')
        .select('guest_id, episode_id')
        .eq('guest_id', guestId);
      throwOn(error);
      return ((data ?? []) as GuestAppearanceRow[]).map(toGuestAppearance);
    },
    async listEpisodeGuests(episodeId) {
      const links = await db
        .from('guest_appearances')
        .select('guest_id')
        .eq('episode_id', episodeId);
      throwOn(links.error);
      const guestIds = ((links.data ?? []) as { guest_id: string }[]).map((row) => row.guest_id);
      if (guestIds.length === 0) return [];
      const { data, error } = await db
        .from('guests')
        .select('*')
        .in('id', guestIds)
        .order('name');
      throwOn(error);
      return ((data ?? []) as GuestRow[]).map(toGuest);
    },
    async linkGuestAppearance(guestId, episodeId): Promise<LinkGuestAppearanceResult> {
      const [guest, episode] = await Promise.all([
        db.from('guests').select('id').eq('id', guestId).maybeSingle(),
        db.from('episodes').select('id').eq('id', episodeId).maybeSingle(),
      ]);
      throwOn(guest.error);
      throwOn(episode.error);
      if (!guest.data) return { status: 'guest_not_found' };
      if (!episode.data) return { status: 'episode_not_found' };
      const { error } = await db
        .from('guest_appearances')
        .insert({ guest_id: guestId, episode_id: episodeId });
      // Linking is idempotent: the composite primary key absorbs a repeat.
      if (isUniqueViolation(error)) {
        return { status: 'already_linked', appearance: { guestId, episodeId } };
      }
      throwOn(error);
      return { status: 'linked', appearance: { guestId, episodeId } };
    },
    async unlinkGuestAppearance(guestId, episodeId) {
      const { data, error } = await db
        .from('guest_appearances')
        .delete()
        .eq('guest_id', guestId)
        .eq('episode_id', episodeId)
        .select('guest_id')
        .maybeSingle();
      throwOn(error);
      return Boolean(data);
    },

    async getContentSummary(): Promise<StudioContentSummary> {
      const countOf = async (
        table: string,
        column?: string,
        value?: string,
      ): Promise<number> => {
        let request = db.from(table).select('*', { count: 'exact', head: true });
        if (column && value) request = request.eq(column, value);
        const { error, count } = await request;
        throwOn(error);
        return count ?? 0;
      };
      const [
        shows,
        guests,
        episodeTotal,
        draftEpisodes,
        scheduledEpisodes,
        publishedEpisodes,
        archivedEpisodes,
        articleTotal,
        draftArticles,
        publishedArticles,
      ] = await Promise.all([
        countOf('shows'),
        countOf('guests'),
        countOf('episodes'),
        countOf('episodes', 'status', 'draft'),
        countOf('episodes', 'status', 'scheduled'),
        countOf('episodes', 'status', 'published'),
        countOf('episodes', 'status', 'archived'),
        countOf('articles'),
        countOf('articles', 'status', 'draft'),
        countOf('articles', 'status', 'published'),
      ]);
      return {
        shows,
        guests,
        episodes: {
          total: episodeTotal,
          draft: draftEpisodes,
          scheduled: scheduledEpisodes,
          published: publishedEpisodes,
          archived: archivedEpisodes,
        },
        articles: { total: articleTotal, draft: draftArticles, published: publishedArticles },
      };
    },
    async getAudienceSummary(): Promise<StudioAudienceSummary> {
      const [users, subscriptionRows, planRows] = await Promise.all([
        db.from('users').select('*', { count: 'exact', head: true }),
        db.from('subscriptions').select('status, plan_id, price_minor, currency'),
        db.from('plans').select('id, interval, currency'),
      ]);
      throwOn(users.error);
      throwOn(subscriptionRows.error);
      throwOn(planRows.error);
      const intervals = new Map(
        ((planRows.data ?? []) as { id: string; interval: string }[]).map((plan) => [
          plan.id,
          plan.interval,
        ]),
      );
      const counts = { active: 0, past_due: 0, canceled: 0 };
      let monthlyRecurringRevenueMinor = 0;
      const rows = (subscriptionRows.data ?? []) as {
        status: SubscriptionStatus;
        plan_id: string;
        price_minor: number;
      }[];
      for (const row of rows) {
        counts[row.status] += 1;
        if (row.status !== 'active') continue;
        // Annual plans are amortized so the figure is always a monthly rate.
        monthlyRecurringRevenueMinor +=
          intervals.get(row.plan_id) === 'year'
            ? Math.round(row.price_minor / 12)
            : row.price_minor;
      }
      return {
        users: users.count ?? 0,
        subscriptions: { ...counts, total: rows.length },
        monthlyRecurringRevenueMinor,
        currency:
          ((planRows.data ?? []) as { currency?: string }[])[0]?.currency ?? 'SAR',
      };
    },

    async listArticleAuthorCandidates() {
      const { data, error } = await db
        .from('studio_members')
        .select('id, display_name')
        .order('display_name');
      throwOn(error);
      return ((data ?? []) as Array<{ id: string; display_name: string }>).flatMap((member) => {
        const displayName = normalizeArticleAuthorDisplayName(member.display_name);
        return displayName ? [{ studioMemberId: member.id, displayName }] : [];
      });
    },
    async getArticle(id) {
      return single<ArticleRow, Article>(
        db.from('articles').select('*').eq('id', id).maybeSingle(),
        toArticle,
      );
    },
    async getArticleBySlug(slug) {
      return single<ArticleRow, Article>(
        db.from('articles').select('*').eq('slug', slug).maybeSingle(),
        toArticle,
      );
    },
    async createArticle(input) {
      const now = new Date().toISOString();
      const article = createArticleRecord(`art-${crypto.randomUUID().slice(0, 8)}`, input, now);
      const { data, error } = await db
        .from('articles')
        .insert(articleRecord(article))
        .select()
        .single();
      throwOn(error);
      return toArticle(data as ArticleRow);
    },
    async updateArticle(id, input) {
      const current = await this.getArticle(id);
      if (!current) return null;
      if (current.version !== input.expectedVersion) return null;
      const article = mergeArticleUpdate(current, input, new Date().toISOString());
      // Newsletter delivery transitions deliberately do not bump the content version.
      // Bind this full-row update to the operational snapshot as well as the version,
      // otherwise a save that read `draft` can overwrite a concurrent `syncing` claim
      // and make an already-created remote campaign impossible to record safely.
      let update = db
        .from('articles')
        .update(articleRecord(article))
        .eq('id', id)
        .eq('version', current.version)
        .eq('newsletter_status', current.newsletter.status);
      update = current.newsletter.syncStartedAt
        ? update.eq('newsletter_sync_started_at', current.newsletter.syncStartedAt)
        : update.is('newsletter_sync_started_at', null);
      update = current.newsletter.campaignId
        ? update.eq('mailchimp_campaign_id', current.newsletter.campaignId)
        : update.is('mailchimp_campaign_id', null);
      return single<ArticleRow, Article>(update.select().maybeSingle(), toArticle);
    },
    async updateArticleStatus(id, status, expectedVersion, publishedAt) {
      const current = await this.getArticle(id);
      if (!current) return null;
      if (current.version !== expectedVersion) return null;
      const patch: Record<string, unknown> = {
        status,
        version: current.version + 1,
        updated_at: new Date().toISOString(),
      };
      if (publishedAt !== undefined) patch.published_at = publishedAt;
      return single<ArticleRow, Article>(
        db
          .from('articles')
          .update(patch)
          .eq('id', id)
          .eq('version', current.version)
          .select()
          .maybeSingle(),
        toArticle,
      );
    },
    async claimArticleNewsletterSync(id, expectedVersion) {
      const current = await this.getArticle(id);
      if (!current) return { status: 'not_found' };
      if (current.version !== expectedVersion) {
        return { status: 'version_conflict', article: current };
      }
      if (current.newsletter.status === 'sent') return { status: 'sent', article: current };
      if (current.newsletter.status === 'syncing') {
        const startedAt = current.newsletter.syncStartedAt
          ? Date.parse(current.newsletter.syncStartedAt)
          : 0;
        if (Date.now() - startedAt < 5 * 60_000) {
          return { status: 'sync_in_progress', article: current };
        }
        if (!current.newsletter.campaignId) {
          let unknownQuery = db
            .from('articles')
            .update({
              newsletter_status: 'sync_unknown',
              newsletter_sync_started_at: null,
              newsletter_sync_token: null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', id)
            .eq('version', expectedVersion)
            .eq('newsletter_status', 'syncing');
          unknownQuery = current.newsletter.syncStartedAt
            ? unknownQuery.eq('newsletter_sync_started_at', current.newsletter.syncStartedAt)
            : unknownQuery.is('newsletter_sync_started_at', null);
          const unknown = await single<ArticleRow, Article>(
            unknownQuery.select().maybeSingle(),
            toArticle,
          );
          if (unknown) return { status: 'sync_unknown', article: unknown };
          const latest = await this.getArticle(id);
          return latest?.version !== expectedVersion
            ? { status: 'version_conflict', article: latest ?? undefined }
            : { status: 'sync_in_progress', article: latest ?? current };
        }
        const reclaimedAt = new Date().toISOString();
        const reclaimedToken = crypto.randomUUID();
        let reclaimedQuery = db
          .from('articles')
          .update({
            newsletter_sync_started_at: reclaimedAt,
            newsletter_sync_token: reclaimedToken,
            updated_at: reclaimedAt,
          })
          .eq('id', id)
          .eq('version', expectedVersion)
          .eq('newsletter_status', 'syncing');
        reclaimedQuery = current.newsletter.syncStartedAt
          ? reclaimedQuery.eq('newsletter_sync_started_at', current.newsletter.syncStartedAt)
          : reclaimedQuery.is('newsletter_sync_started_at', null);
        const reclaimed = await single<ArticleRow, Article>(
          reclaimedQuery.select().maybeSingle(),
          toArticle,
        );
        if (reclaimed) {
          return { status: 'claimed', article: reclaimed, syncToken: reclaimedToken };
        }
        const latest = await this.getArticle(id);
        return latest?.version !== expectedVersion
          ? { status: 'version_conflict', article: latest ?? undefined }
          : { status: 'sync_in_progress', article: latest ?? current };
      }
      if (
        !current.newsletter.enabled ||
        !['draft', 'campaign_created'].includes(current.newsletter.status)
      ) {
        return { status: 'not_ready', article: current };
      }
      const claimedAt = new Date().toISOString();
      const claimedToken = crypto.randomUUID();
      const claimed = await single<ArticleRow, Article>(
        db
          .from('articles')
          .update({
            newsletter_status: 'syncing',
            newsletter_sync_started_at: claimedAt,
            newsletter_sync_token: claimedToken,
            updated_at: claimedAt,
          })
          .eq('id', id)
          .eq('version', expectedVersion)
          .eq('newsletter_status', current.newsletter.status)
          .select()
          .maybeSingle(),
        toArticle,
      );
      if (claimed) return { status: 'claimed', article: claimed, syncToken: claimedToken };
      const latest = await this.getArticle(id);
      if (latest?.version !== expectedVersion) {
        return { status: 'version_conflict', article: latest ?? undefined };
      }
      return latest?.newsletter.status === 'syncing'
        ? { status: 'sync_in_progress', article: latest }
        : { status: 'not_ready', article: latest ?? undefined };
    },
    async setArticleNewsletterCampaign(id, campaignId, syncToken) {
      return single<ArticleRow, Article>(
        db
          .from('articles')
          .update({
            mailchimp_campaign_id: campaignId,
            newsletter_status: 'syncing',
            newsletter_synced_version: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .eq('newsletter_status', 'syncing')
          .eq('newsletter_sync_token', syncToken)
          .select()
          .maybeSingle(),
        toArticle,
      );
    },
    async markArticleNewsletterSynced(id, campaignId, expectedVersion, syncToken) {
      return single<ArticleRow, Article>(
        db
          .from('articles')
          .update({
            newsletter_status: 'campaign_created',
            newsletter_synced_version: expectedVersion,
            newsletter_sync_started_at: null,
            newsletter_sync_token: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .eq('mailchimp_campaign_id', campaignId)
          .eq('version', expectedVersion)
          .eq('newsletter_sync_token', syncToken)
          .neq('newsletter_status', 'sent')
          .select()
          .maybeSingle(),
        toArticle,
      );
    },
    async claimArticleNewsletterSend(id, expectedVersion, expectedCampaignId) {
      const current = await this.getArticle(id);
      if (!current) return { status: 'not_found' };
      if (
        current.version !== expectedVersion ||
        current.newsletter.campaignId !== expectedCampaignId
      ) {
        return { status: 'confirmation_stale', article: current };
      }
      if (current.newsletter.status === 'sent') {
        return { status: 'already_sent', article: current };
      }
      if (current.newsletter.status === 'sending') {
        return { status: 'send_in_progress', article: current };
      }
      if (!current.newsletter.campaignId || current.newsletter.status !== 'campaign_created') {
        return { status: 'not_ready', article: current };
      }
      if (current.newsletter.syncedVersion !== current.version) {
        return { status: 'sync_required', article: current };
      }

      const claimedAt = new Date().toISOString();
      const sendToken = crypto.randomUUID();
      const claimed = await single<ArticleRow, Article>(
        db
          .from('articles')
          .update({
            newsletter_status: 'sending',
            newsletter_send_started_at: claimedAt,
            newsletter_send_token: sendToken,
            updated_at: claimedAt,
          })
          .eq('id', id)
          .eq('newsletter_status', 'campaign_created')
          .eq('version', expectedVersion)
          .eq('newsletter_synced_version', expectedVersion)
          .eq('mailchimp_campaign_id', expectedCampaignId)
          .is('newsletter_send_started_at', null)
          .is('newsletter_send_token', null)
          .select()
          .maybeSingle(),
        toArticle,
      );
      if (claimed) return { status: 'claimed', article: claimed, sendToken };

      const latest = await this.getArticle(id);
      if (!latest) return { status: 'not_found' };
      if (
        latest.version !== expectedVersion ||
        latest.newsletter.campaignId !== expectedCampaignId
      ) {
        return { status: 'confirmation_stale', article: latest };
      }
      if (latest.newsletter.status === 'sent') {
        return { status: 'already_sent', article: latest };
      }
      if (latest.newsletter.status === 'sending') {
        return { status: 'send_in_progress', article: latest };
      }
      return { status: 'sync_required', article: latest };
    },
    async touchArticleNewsletterSendLease(id, sendToken) {
      const startedAt = new Date().toISOString();
      return single<ArticleRow, Article>(
        db
          .from('articles')
          .update({ newsletter_send_started_at: startedAt, updated_at: startedAt })
          .eq('id', id)
          .eq('newsletter_status', 'sending')
          .eq('newsletter_send_token', sendToken)
          .select()
          .maybeSingle(),
        toArticle,
      );
    },
    async completeArticleNewsletterSend(id, sentAt, sendToken) {
      return single<ArticleRow, Article>(
        db
          .from('articles')
          .update({
            newsletter_status: 'sent',
            newsletter_sent_at: sentAt,
            newsletter_sync_started_at: null,
            newsletter_sync_token: null,
            newsletter_send_started_at: null,
            newsletter_send_token: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .eq('newsletter_status', 'sending')
          .eq('newsletter_send_token', sendToken)
          .select()
          .maybeSingle(),
        toArticle,
      );
    },
    async reconcileArticleNewsletterSent(id, sentAt) {
      return single<ArticleRow, Article>(
        db
          .from('articles')
          .update({
            newsletter_status: 'sent',
            newsletter_sent_at: sentAt,
            newsletter_sync_started_at: null,
            newsletter_sync_token: null,
            newsletter_send_started_at: null,
            newsletter_send_token: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .select()
          .maybeSingle(),
        toArticle,
      );
    },
    async releaseArticleNewsletterSend(id, sendToken) {
      return single<ArticleRow, Article>(
        db
          .from('articles')
          .update({
            newsletter_status: 'campaign_created',
            newsletter_send_started_at: null,
            newsletter_send_token: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .eq('newsletter_status', 'sending')
          .eq('newsletter_send_token', sendToken)
          .select()
          .maybeSingle(),
        toArticle,
      );
    },
    async recoverStaleArticleNewsletterSend(id, staleBefore) {
      const { data, error } = await db.from('articles').select('*').eq('id', id).maybeSingle();
      throwOn(error);
      if (!data) return null;
      const current = data as ArticleRow;
      const startedAt = current.newsletter_send_started_at;
      const sendToken = current.newsletter_send_token;
      if (
        current.newsletter_status !== 'sending' ||
        !startedAt ||
        !sendToken ||
        Date.parse(startedAt) > Date.parse(staleBefore)
      ) {
        return null;
      }
      return single<ArticleRow, Article>(
        db
          .from('articles')
          .update({
            newsletter_status: 'campaign_created',
            newsletter_send_started_at: null,
            newsletter_send_token: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .eq('newsletter_status', 'sending')
          .eq('newsletter_send_started_at', startedAt)
          .eq('newsletter_send_token', sendToken)
          .select()
          .maybeSingle(),
        toArticle,
      );
    },
    async releaseArticleNewsletterSync(id, syncToken) {
      const current = await this.getArticle(id);
      if (!current || current.newsletter.status !== 'syncing') return null;
      return single<ArticleRow, Article>(
        db
          .from('articles')
          .update({
            newsletter_status: current.newsletter.campaignId ? 'campaign_created' : 'draft',
            newsletter_sync_started_at: null,
            newsletter_sync_token: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .eq('newsletter_status', 'syncing')
          .eq('newsletter_sync_token', syncToken)
          .select()
          .maybeSingle(),
        toArticle,
      );
    },
    async markArticleNewsletterSyncUnknown(id, syncToken) {
      return single<ArticleRow, Article>(
        db
          .from('articles')
          .update({
            newsletter_status: 'sync_unknown',
            newsletter_sync_started_at: null,
            newsletter_sync_token: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .eq('newsletter_status', 'syncing')
          .eq('newsletter_sync_token', syncToken)
          .select()
          .maybeSingle(),
        toArticle,
      );
    },

    async listPlans() {
      const { data, error } = await db.from('plans').select('*').order('price_minor');
      throwOn(error);
      return ((data ?? []) as PlanRow[]).map(toPlan);
    },
    async getPlan(id) {
      return single<PlanRow, Plan>(db.from('plans').select('*').eq('id', id).maybeSingle(), toPlan);
    },

    async listSubscriptions() {
      const { data, error } = await db
        .from('subscriptions')
        .select('*')
        .order('created_at', { ascending: false });
      throwOn(error);
      return ((data ?? []) as SubscriptionRow[]).map(toSubscription);
    },
    async getSubscriptionForUser(userId) {
      return single<SubscriptionRow, Subscription>(
        db
          .from('subscriptions')
          .select('*')
          .eq('user_id', userId)
          .neq('status', 'canceled')
          .maybeSingle(),
        toSubscription,
      );
    },
    async getSubscription(id) {
      return single<SubscriptionRow, Subscription>(
        db.from('subscriptions').select('*').eq('id', id).maybeSingle(),
        toSubscription,
      );
    },
    async createSubscription(input, priceMinor, currency, currentPeriodEnd) {
      const { data, error } = await db
        .from('subscriptions')
        .insert({
          user_id: input.userId,
          plan_id: input.planId,
          status: 'active',
          price_minor: priceMinor,
          currency,
          current_period_end: currentPeriodEnd,
        })
        .select()
        .single();
      throwOn(error);
      return toSubscription(data as SubscriptionRow);
    },
    async updateSubscriptionStatus(id, status) {
      return single<SubscriptionRow, Subscription>(
        db.from('subscriptions').update({ status }).eq('id', id).select().maybeSingle(),
        toSubscription,
      );
    },

    async listFollows(userId) {
      const { data, error } = await db.from('follows').select('*').eq('user_id', userId);
      throwOn(error);
      return ((data ?? []) as FollowRow[]).map(toFollow);
    },
    async createFollow(userId, showId) {
      const { data, error } = await db
        .from('follows')
        .upsert({ user_id: userId, show_id: showId })
        .select()
        .single();
      throwOn(error);
      return toFollow(data as FollowRow);
    },
    async deleteFollow(userId, showId) {
      const { error, count } = await db
        .from('follows')
        .delete({ count: 'exact' })
        .eq('user_id', userId)
        .eq('show_id', showId);
      throwOn(error);
      return (count ?? 0) > 0;
    },

    async listProgress(userId) {
      const { data, error } = await db.from('playback_progress').select('*').eq('user_id', userId);
      throwOn(error);
      return ((data ?? []) as ProgressRow[]).map(toProgress);
    },
    async upsertProgress(userId, episodeId, positionSec) {
      const { data, error } = await db
        .from('playback_progress')
        .upsert({
          user_id: userId,
          episode_id: episodeId,
          position_sec: positionSec,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();
      throwOn(error);
      return toProgress(data as ProgressRow);
    },
  };
}
