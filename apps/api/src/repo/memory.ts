import {
  PERMISSION_IDS,
  ROLE_CREATED_AUDIT_ACTION,
  ROLE_PERMISSION_AUDIT_ACTION,
  STUDIO_MEMBER_ACCESS_AUDIT_ACTION,
  STUDIO_MEMBER_ACCEPTANCE_AUDIT_ACTION,
  STUDIO_MEMBER_INVITATION_AUDIT_ACTION,
  isPermissionId,
  normalizePermissionIds,
  type Article,
  type ArticleStatus,
  type Episode,
  type EpisodeStatus,
  type Follow,
  type Guest,
  type GuestAppearance,
  type GuestSocial,
  type ListQuery,
  type PageResult,
  type Plan,
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
  type StudioMemberAcceptanceAuditLog,
  type StudioMemberInvitationAuditLog,
  type StudioMemberStatus,
  type Subscription,
  type SubscriberUser,
  type SubscriptionStatus,
  type User,
} from '@mukhtalif/types';
import {
  normalizeArticleAuthorDisplayName,
  type CreateEpisodeInput,
  type CreateGuestInput,
  type CreateGuestSocialInput,
  type CreateShowInput,
  type UpdateEpisodeInput,
  type UpdateGuestInput,
  type UpdateGuestSocialInput,
  type UpdateShowInput,
} from '@mukhtalif/validation';
import {
  createArticleRecord,
  mergeArticleUpdate,
  refreshNeedsSync,
} from '../publishing/article-record';
import { documentFromPlainText } from '../publishing/rich-text';
import { matchesSearch, paginate } from './list-query';
import type {
  AcceptStudioInvitationResult,
  ArticleFilter,
  CreateGuestSocialResult,
  EpisodeFilter,
  LinkGuestAppearanceResult,
  Repository,
  StoredMediaAsset,
  UpdateGuestSocialResult,
} from './types';

/**
 * Seeded development dataset mirroring supabase/migrations/0001_init.sql.
 * Module-level state persists only per Worker isolate — good enough for
 * local development. Audio URLs are royalty-free placeholder tracks so the
 * player is exercisable before R2 is provisioned.
 */

interface MemoryUser extends User {
  authUserId: string | null;
}

const users: MemoryUser[] = [
  {
    id: 'usr-listener-1',
    email: 'sara@example.com',
    displayName: 'سارة الحربي',
    locale: 'ar',
    authUserId: '33333333-3333-4333-8333-333333333333',
    createdAt: '2026-02-02T10:30:00Z',
  },
  {
    id: 'usr-listener-2',
    email: 'khalid@example.com',
    displayName: 'خالد العتيبي',
    locale: 'ar',
    authUserId: null,
    createdAt: '2026-03-15T14:12:00Z',
  },
];

interface MemoryStudioMember extends Omit<StudioMember, 'roleName'> {
  authUserId: string;
  status: StudioMemberStatus;
  acceptedAt?: string;
}

const studioMembers: MemoryStudioMember[] = [
  {
    id: 'usr-admin-1',
    email: 'studio@mukhtalif.net',
    displayName: 'فريق مختلف',
    role: 'admin',
    locale: 'ar',
    authUserId: '11111111-1111-4111-8111-111111111111',
    status: 'active',
    acceptedAt: '2026-01-10T08:00:00Z',
    createdAt: '2026-01-10T08:00:00Z',
  },
  {
    id: 'usr-editor-1',
    email: 'editor@mukhtalif.net',
    displayName: 'محرر مختلف',
    role: 'editor',
    locale: 'ar',
    authUserId: '22222222-2222-4222-8222-222222222222',
    status: 'active',
    acceptedAt: '2026-01-11T08:00:00Z',
    createdAt: '2026-01-11T08:00:00Z',
  },
];

const studioMemberAccessAuditLogs: StudioMemberAccessAuditLog[] = [];
const studioMemberInvitationAuditLogs: StudioMemberInvitationAuditLog[] = [];
const studioMemberAcceptanceAuditLogs: StudioMemberAcceptanceAuditLog[] = [];
const roleCreatedAuditLogs: RoleCreatedAuditLog[] = [];
const rolePermissionAuditLogs: RolePermissionAuditLog[] = [];

type MemoryRole = Omit<StudioRole, 'permissions' | 'memberCount'>;

const roleSeedCreatedAt = '2026-01-01T00:00:00Z';
const roles: MemoryRole[] = [
  {
    id: 'admin',
    name: 'المشرف العام',
    description: 'صلاحيات النظام الكاملة والمحمية.',
    isSystem: true,
    isProtected: true,
    createdAt: roleSeedCreatedAt,
    updatedAt: roleSeedCreatedAt,
  },
  {
    id: 'editor',
    name: 'مدير المحتوى',
    description: 'إدارة المحتوى والبرامج والحلقات.',
    isSystem: true,
    isProtected: false,
    createdAt: roleSeedCreatedAt,
    updatedAt: roleSeedCreatedAt,
  },
];

const rolePermissionMatrix: RolePermissionMatrix = {
  admin: [...PERMISSION_IDS],
  editor: [
    'overview.view',
    'episodes.view',
    'episodes.manage',
    'shows.view',
    'shows.manage',
    'guests.view',
    'guests.manage',
    'articles.view',
    'articles.manage',
  ],
};

const shows: Show[] = [
  {
    id: 'shw-petroly',
    slug: 'petroly',
    titleAr: 'بترولي',
    titleEn: 'Petroly',
    descriptionAr: 'لقاءات مع مهنيين ملهمين يشاركون تجاربهم في مسيرتهم المهنية.',
    hostName: 'أحمد العطار',
    category: 'مسيرة مهنية',
    premium: false,
    createdAt: '2026-01-12T08:00:00Z',
  },
  {
    id: 'shw-gilaf',
    slug: 'gilaf',
    titleAr: 'غلاف',
    titleEn: 'Gilaf',
    descriptionAr: 'كتب أجنبية نناقشها ونسقطها على واقعنا العربي.',
    hostName: 'محمد المرشدي',
    category: 'كتب',
    premium: false,
    createdAt: '2026-01-12T08:05:00Z',
  },
  {
    id: 'shw-shaqla',
    slug: 'shaqla',
    titleAr: 'شقلة',
    titleEn: 'Shaqla',
    descriptionAr: 'نغوص في تفاصيل المهن مع مختصين يعيشونها يوميًا.',
    hostName: 'عبدالله إسحاق',
    category: 'مهن',
    premium: false,
    createdAt: '2026-01-12T08:10:00Z',
  },
  {
    id: 'shw-partition',
    slug: 'partition',
    titleAr: 'بارتشن',
    titleEn: 'Partition',
    descriptionAr: 'قضايا بيئة العمل من منظور الجنسين في حوار مفتوح.',
    hostName: 'أحمد حسن مشرف',
    category: 'بيئة عمل',
    premium: false,
    createdAt: '2026-01-12T08:15:00Z',
  },
  {
    id: 'shw-seera',
    slug: 'seera',
    titleAr: 'سيرة',
    titleEn: 'Seera',
    descriptionAr: 'سير مهنية تُروى من أصحابها، بتفاصيلها الصعبة قبل الجميلة.',
    hostName: 'فريق مختلف',
    category: 'سير',
    premium: true,
    createdAt: '2026-01-20T08:00:00Z',
  },
];

const episodes: Episode[] = [
  {
    id: 'ep-1001',
    showId: 'shw-petroly',
    titleAr: 'من الحقل إلى الإدارة: رحلة مهندس',
    showNotesAr: 'ضيف الحلقة يشارك تحولات مسيرته من مواقع الحفر إلى قيادة الفرق.',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    durationSec: 2520,
    episodeNumber: 1,
    premium: false,
    status: 'published',
    publishAt: '2026-06-04T05:00:00Z',
    createdAt: '2026-06-01T09:00:00Z',
  },
  {
    id: 'ep-1002',
    showId: 'shw-petroly',
    titleAr: 'أول وظيفة في قطاع الطاقة',
    showNotesAr: 'كيف تقرأ عرض العمل الأول، وما الذي يستحق التفاوض عليه.',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    durationSec: 1980,
    episodeNumber: 2,
    premium: false,
    status: 'published',
    publishAt: '2026-06-18T05:00:00Z',
    createdAt: '2026-06-15T09:00:00Z',
  },
  {
    id: 'ep-2001',
    showId: 'shw-gilaf',
    titleAr: 'عادات ذرية: هل تصمد في بيئة عربية؟',
    showNotesAr: 'نقرأ الكتاب الأشهر في الإنتاجية ونسأل: ما الذي يترجم فعلًا؟',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    durationSec: 3120,
    episodeNumber: 1,
    premium: false,
    status: 'published',
    publishAt: '2026-06-25T05:00:00Z',
    createdAt: '2026-06-20T09:00:00Z',
  },
  {
    id: 'ep-3001',
    showId: 'shw-shaqla',
    titleAr: 'يوم في حياة مراقب جوي',
    showNotesAr: 'مهنة لا تحتمل الخطأ: كيف تُدار السماء من برج المراقبة.',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
    durationSec: 2760,
    episodeNumber: 1,
    premium: false,
    status: 'published',
    publishAt: '2026-07-02T05:00:00Z',
    createdAt: '2026-06-28T09:00:00Z',
  },
  {
    id: 'ep-4001',
    showId: 'shw-partition',
    titleAr: 'الترقية الأولى: من يطلبها ومن ينتظرها؟',
    showNotesAr: 'حوار مفتوح حول الفروق في طلب الترقيات والمبادرة داخل الفريق.',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',
    durationSec: 2340,
    episodeNumber: 1,
    premium: false,
    status: 'published',
    publishAt: '2026-07-09T05:00:00Z',
    createdAt: '2026-07-05T09:00:00Z',
  },
  {
    id: 'ep-5001',
    showId: 'shw-seera',
    titleAr: 'سيرة: من التقاعد المبكر إلى تأسيس شركة',
    showNotesAr: 'حلقة حصرية للمشتركين: قصة كاملة من القرار الصعب إلى أول عميل.',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3',
    durationSec: 3600,
    episodeNumber: 1,
    premium: true,
    status: 'published',
    publishAt: '2026-07-16T05:00:00Z',
    createdAt: '2026-07-10T09:00:00Z',
  },
  {
    id: 'ep-1003',
    showId: 'shw-petroly',
    titleAr: 'الانتقال بين الشركات الكبرى',
    showNotesAr: 'مسودة قيد التحرير.',
    durationSec: 0,
    episodeNumber: 3,
    premium: false,
    status: 'draft',
    createdAt: '2026-08-01T09:00:00Z',
  },
  {
    id: 'ep-2002',
    showId: 'shw-gilaf',
    titleAr: 'كيف تقرأ سيرة ذاتية؟ الكتاب خلف التوظيف',
    showNotesAr: 'مجدولة للأسبوع القادم.',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3',
    durationSec: 2880,
    episodeNumber: 2,
    premium: false,
    status: 'scheduled',
    publishAt: '2026-08-20T05:00:00Z',
    createdAt: '2026-08-05T09:00:00Z',
  },
  {
    id: 'ep-3002',
    showId: 'shw-shaqla',
    titleAr: 'الحلقة التجريبية الأولى',
    showNotesAr: 'أرشيف الموسم صفر.',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3',
    durationSec: 1500,
    episodeNumber: 0,
    premium: false,
    status: 'archived',
    publishAt: '2026-02-01T05:00:00Z',
    createdAt: '2026-01-28T09:00:00Z',
  },
];

const firstArticleBody =
  'الأشهر الثلاثة الأولى تحدد صورتك المهنية لسنوات. في هذا المقال نلخص ما ينصح به ضيوف مختلف: افهم قبل أن تقترح، وابنِ علاقات قبل أن تحتاجها، ووثّق أثرك من الأسبوع الأول.';
const firstArticle = createArticleRecord(
  'art-1',
  {
    slug: 'first-90-days',
    titleAr: 'أول 90 يومًا في وظيفتك الجديدة',
    author: { type: 'custom', displayName: 'فريق مختلف' },
    content: documentFromPlainText(firstArticleBody),
    seo: { description: firstArticleBody.slice(0, 160) },
  },
  '2026-07-18T08:00:00Z',
);
firstArticle.status = 'published';
firstArticle.publishedAt = '2026-07-20T08:00:00Z';

const articles: Article[] = [
  firstArticle,
  createArticleRecord(
    'art-2',
    {
      slug: 'salary-negotiation',
      titleAr: 'التفاوض على الراتب: دليل عملي',
      author: { type: 'custom', displayName: 'فريق مختلف' },
      content: documentFromPlainText('مسودة قيد المراجعة التحريرية.'),
    },
    '2026-08-03T08:00:00Z',
  ),
];
const articleNewsletterSyncTokens = new Map<string, string>();
const articleNewsletterSendLeases = new Map<string, { token: string; startedAt: string }>();
const mediaAssets: StoredMediaAsset[] = [];

const guests: Guest[] = [
  {
    id: 'gst-1001',
    slug: 'noura-al-qahtani',
    name: 'نورة القحطاني',
    role: 'مهندسة بترول أولى',
    city: 'الظهران',
    email: 'noura@example.com',
    bio: 'مهندسة بترول تعمل على مشاريع الحفر البحري منذ 2015.',
    createdAt: '2026-05-04T09:00:00Z',
  },
  {
    id: 'gst-1002',
    slug: 'faisal-al-dosari',
    name: 'فيصل الدوسري',
    role: 'مدير منتج',
    city: 'الرياض',
    email: '',
    bio: 'يقود فرق المنتج في شركات ناشئة سعودية.',
    createdAt: '2026-06-18T09:00:00Z',
  },
];

const guestSocials: GuestSocial[] = [
  { id: 'gsoc-1001', guestId: 'gst-1001', platform: 'linkedin', handle: 'noura-alqahtani' },
  { id: 'gsoc-1002', guestId: 'gst-1002', platform: 'x', handle: 'faisal_pm' },
];

const guestAppearances: GuestAppearance[] = [
  { guestId: 'gst-1001', episodeId: 'ep-1001' },
];

const plans: Plan[] = [
  {
    id: 'pln-plus',
    nameAr: 'مختلف بلس',
    nameEn: 'Mukhtalif Plus',
    priceMinor: 2900,
    currency: 'SAR',
    interval: 'month',
  },
];

const subscriptions: Subscription[] = [
  {
    id: 'sub-1001',
    userId: 'usr-listener-1',
    planId: 'pln-plus',
    status: 'active',
    priceMinor: 1900,
    currency: 'SAR',
    currentPeriodEnd: '2026-09-01T00:00:00Z',
    createdAt: '2026-06-01T00:00:00Z',
  },
];

const follows: Follow[] = [
  { userId: 'usr-listener-1', showId: 'shw-petroly', createdAt: '2026-06-05T10:00:00Z' },
  { userId: 'usr-listener-1', showId: 'shw-seera', createdAt: '2026-07-16T10:00:00Z' },
];

const progress: PlaybackProgress[] = [
  {
    userId: 'usr-listener-1',
    episodeId: 'ep-1001',
    positionSec: 1130,
    updatedAt: '2026-08-06T21:14:00Z',
  },
];

function id(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function memoryRole(roleId: RoleId): MemoryRole | undefined {
  return roles.find((role) => role.id === roleId);
}

function permissionsForRole(roleId: RoleId): PermissionId[] {
  return [...(rolePermissionMatrix[roleId] ?? [])];
}

function normalizeRoleName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ar');
}

function hasValidPermissionClosure(permissions: readonly PermissionId[]): boolean {
  return (
    new Set(permissions).size === permissions.length &&
    permissions.every(isPermissionId) &&
    permissions.every(
      (permission) =>
        !permission.endsWith('.manage') ||
        permissions.includes(permission.replace(/\.manage$/, '.view') as PermissionId),
    )
  );
}

function canManageAccess(member: MemoryStudioMember | undefined): boolean {
  return (
    member?.role === 'admin' || permissionsForRole(member?.role ?? '').includes('access.manage')
  );
}

function toStudioRole(role: MemoryRole): StudioRole {
  return {
    ...role,
    permissions: permissionsForRole(role.id),
    memberCount: studioMembers.filter((member) => member.role === role.id).length,
  };
}

function toUser(user: MemoryUser): User {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    locale: user.locale,
    createdAt: user.createdAt,
  };
}

function toStudioMember(member: MemoryStudioMember): StudioMember {
  return {
    id: member.id,
    email: member.email,
    displayName: member.displayName,
    role: member.role,
    roleName: memoryRole(member.role)?.name ?? member.role,
    locale: member.locale,
    createdAt: member.createdAt,
  };
}

function toStudioMemberAccess(member: MemoryStudioMember): StudioMemberAccess {
  return {
    ...toStudioMember(member),
    authLinked: true,
    status: member.status,
    ...(member.acceptedAt ? { acceptedAt: member.acceptedAt } : {}),
  };
}

function toSubscriberUser(user: MemoryUser): SubscriberUser {
  return toUser(user);
}

/**
 * Resolves a Studio member from a verified Auth identity.
 *
 * The local development gate synthesizes `dev:<member id>` instead of a real
 * Auth UUID, so both forms are accepted here. This repository is only reachable
 * when APP_ENV is development and ALLOW_DEV_AUTH is true, so the second form
 * can never be honoured by a deployed environment.
 */
function findMemberByAuthId(authUserId: string): MemoryStudioMember | undefined {
  return studioMembers.find(
    (candidate) =>
      candidate.authUserId === authUserId || `dev:${candidate.id}` === authUserId,
  );
}

export function createMemoryRepository(): Repository {
  return {
    async getUser(userId) {
      const user = users.find((candidate) => candidate.id === userId);
      return user ? toUser(user) : null;
    },
    async getUserByAuthId(authUserId) {
      const user = users.find((candidate) => candidate.authUserId === authUserId);
      return user ? toUser(user) : null;
    },
    async listSubscriberUsers() {
      return users.map(toSubscriberUser);
    },
    async listSubscriberUsersPage(query: ListQuery): Promise<PageResult<SubscriberUser>> {
      const matched = users
        .filter((user) => matchesSearch(query.search, user.displayName, user.email))
        .map(toSubscriberUser);
      return paginate(matched, query);
    },
    async getStudioMember(studioMemberId) {
      const member = studioMembers.find((candidate) => candidate.id === studioMemberId);
      return member ? toStudioMember(member) : null;
    },
    async getStudioMemberByAuthId(authUserId) {
      const member = studioMembers.find((candidate) => candidate.authUserId === authUserId);
      return member ? toStudioMember(member) : null;
    },
    async getStudioMemberAccessByAuthId(authUserId) {
      const member = findMemberByAuthId(authUserId);
      return member ? toStudioMemberAccess(member) : null;
    },
    async acceptStudioInvitation(
      authUserId,
      requestId,
    ): Promise<AcceptStudioInvitationResult> {
      const member = findMemberByAuthId(authUserId);
      if (!member) return { status: 'not_found' };
      // Acceptance is one-time so a replay cannot reopen password setup.
      if (member.status === 'active') return { status: 'already_active' };
      member.status = 'active';
      member.acceptedAt = new Date().toISOString();
      studioMemberAcceptanceAuditLogs.unshift({
        id: id('accept-audit'),
        action: STUDIO_MEMBER_ACCEPTANCE_AUDIT_ACTION,
        studioMemberId: member.id,
        requestId,
        createdAt: member.acceptedAt,
      });
      return { status: 'accepted', member: toStudioMemberAccess(member) };
    },
    async listStudioMembers() {
      return studioMembers.map(toStudioMemberAccess);
    },
    async listStudioMembersPage(query: ListQuery): Promise<PageResult<StudioMemberAccess>> {
      const matched = studioMembers
        .filter((member) => matchesSearch(query.search, member.displayName, member.email))
        .map(toStudioMemberAccess);
      return paginate(matched, query);
    },
    async inviteStudioMember(actorStudioMemberId, input, requestId) {
      const actor = studioMembers.find((candidate) => candidate.id === actorStudioMemberId);
      if (!actor || !canManageAccess(actor)) return { status: 'forbidden' };

      const selectedRole = memoryRole(input.role);
      if (!selectedRole) return { status: 'role_not_found' };
      if (selectedRole.isProtected && actor?.role !== 'admin') {
        return { status: 'protected_role' };
      }

      const normalizedEmail = input.email.trim().toLowerCase();
      if (studioMembers.some((candidate) => candidate.email.toLowerCase() === normalizedEmail)) {
        return { status: 'duplicate_email' };
      }
      if (
        users.some(
          (candidate) =>
            candidate.authUserId !== null && candidate.email.toLowerCase() === normalizedEmail,
        )
      ) {
        // Supabase Auth owns email uniqueness. An existing app identity is not
        // promoted or linked implicitly to Studio membership.
        return { status: 'auth_identity_exists' };
      }

      const createdAt = new Date().toISOString();
      const member: MemoryStudioMember = {
        id: id('stm'),
        authUserId: crypto.randomUUID(),
        displayName: input.displayName.trim(),
        email: normalizedEmail,
        role: input.role,
        locale: input.locale,
        status: 'invited',
        createdAt,
      };
      studioMembers.push(member);
      studioMemberInvitationAuditLogs.unshift({
        id: id('invite-audit'),
        actorStudioMemberId: actor.id,
        action: STUDIO_MEMBER_INVITATION_AUDIT_ACTION,
        targetStudioMemberId: member.id,
        invitedEmail: member.email,
        assignedRole: member.role,
        locale: member.locale,
        requestId,
        createdAt,
      });

      return { status: 'created', member: toStudioMemberAccess(member) };
    },
    async changeStudioMemberRole(actorStudioMemberId, targetStudioMemberId, role, requestId) {
      const actor = studioMembers.find((candidate) => candidate.id === actorStudioMemberId);
      if (!actor || !canManageAccess(actor)) return { status: 'forbidden' };

      const target = studioMembers.find((candidate) => candidate.id === targetStudioMemberId);
      if (!target) return { status: 'not_found' };
      const selectedRole = memoryRole(role);
      if (!selectedRole) return { status: 'role_not_found' };
      if (actor.id === target.id) return { status: 'self_demotion' };
      if ((target.role === 'admin' || selectedRole.isProtected) && actor.role !== 'admin') {
        return { status: 'protected_role' };
      }
      if (target.role === role) {
        return { status: 'unchanged', member: toStudioMemberAccess(target) };
      }
      if (
        target.role === 'admin' &&
        role !== 'admin' &&
        studioMembers.filter((candidate) => candidate.role === 'admin').length <= 1
      ) {
        return { status: 'last_admin' };
      }

      const previousRole = target.role;
      target.role = role;
      studioMemberAccessAuditLogs.unshift({
        id: id('audit'),
        actorStudioMemberId: actor.id,
        action: STUDIO_MEMBER_ACCESS_AUDIT_ACTION,
        targetStudioMemberId: target.id,
        previousRole,
        newRole: role,
        requestId,
        createdAt: new Date().toISOString(),
      });
      return { status: 'updated', member: toStudioMemberAccess(target) };
    },
    async listStudioMemberAccessAuditLogs() {
      return studioMemberAccessAuditLogs.map((entry) => ({ ...entry }));
    },
    async listStudioMemberInvitationAuditLogs() {
      return studioMemberInvitationAuditLogs.map((entry) => ({ ...entry }));
    },
    async listRoles() {
      return roles.map(toStudioRole);
    },
    async getRole(roleId) {
      const role = memoryRole(roleId);
      return role ? toStudioRole(role) : null;
    },
    async createRole(actorStudioMemberId, input, requestId) {
      const actor = studioMembers.find((candidate) => candidate.id === actorStudioMemberId);
      if (!actor || !canManageAccess(actor)) return { status: 'forbidden' };
      const normalizedName = input.name.trim().replace(/\s+/g, ' ');
      const description = input.description?.trim() ?? '';
      if (
        normalizedName.length < 2 ||
        normalizedName.length > 60 ||
        description.length > 240 ||
        !requestId
      ) {
        return { status: 'invalid_input' };
      }
      if (!hasValidPermissionClosure(input.permissions)) {
        return { status: 'invalid_permissions' };
      }

      if (
        roles.some((role) => normalizeRoleName(role.name) === normalizeRoleName(normalizedName))
      ) {
        return { status: 'duplicate_name' };
      }

      const createdAt = new Date().toISOString();
      const role: MemoryRole = {
        id: `role-${crypto.randomUUID().replaceAll('-', '')}`,
        name: normalizedName,
        description,
        isSystem: false,
        isProtected: false,
        createdAt,
        updatedAt: createdAt,
      };
      roles.push(role);
      rolePermissionMatrix[role.id] = normalizePermissionIds(input.permissions);
      roleCreatedAuditLogs.unshift({
        id: id('role-audit'),
        actorStudioMemberId: actor.id,
        action: ROLE_CREATED_AUDIT_ACTION,
        targetRole: role.id,
        roleName: role.name,
        initialPermissions: permissionsForRole(role.id),
        requestId,
        createdAt,
      });
      return { status: 'created', role: toStudioRole(role) };
    },
    async resolveRolePermissions(role) {
      return permissionsForRole(role);
    },
    async getRolePermissionMatrix() {
      return Object.fromEntries(
        roles.map((role) => [role.id, permissionsForRole(role.id)]),
      ) as RolePermissionMatrix;
    },
    async changeRolePermissions(actorStudioMemberId, role, permissions, requestId) {
      const actor = studioMembers.find((candidate) => candidate.id === actorStudioMemberId);
      if (!actor || !canManageAccess(actor)) return { status: 'forbidden' };
      const selectedRole = memoryRole(role);
      if (!selectedRole) return { status: 'not_found' };
      if (selectedRole.isProtected) return { status: 'immutable_role' };
      if (!hasValidPermissionClosure(permissions)) {
        return { status: 'invalid_permissions' };
      }

      const normalized = normalizePermissionIds(permissions);
      const previousPermissions = permissionsForRole(role);
      const unchanged =
        previousPermissions.length === normalized.length &&
        previousPermissions.every((permission, index) => permission === normalized[index]);

      if (unchanged) {
        return {
          status: 'unchanged',
          role: toStudioRole(selectedRole),
        };
      }

      rolePermissionMatrix[role] = normalized;
      selectedRole.updatedAt = new Date().toISOString();
      rolePermissionAuditLogs.unshift({
        id: id('permission-audit'),
        actorStudioMemberId: actor.id,
        action: ROLE_PERMISSION_AUDIT_ACTION,
        targetRole: role,
        previousPermissions,
        newPermissions: [...normalized],
        requestId,
        createdAt: new Date().toISOString(),
      });

      return {
        status: 'updated',
        role: toStudioRole(selectedRole),
      };
    },
    async listRoleCreatedAuditLogs() {
      return roleCreatedAuditLogs.map((entry) => ({
        ...entry,
        initialPermissions: [...entry.initialPermissions],
      }));
    },
    async listRolePermissionAuditLogs() {
      return rolePermissionAuditLogs.map((entry) => ({
        ...entry,
        previousPermissions: [...entry.previousPermissions],
        newPermissions: [...entry.newPermissions],
      }));
    },

    async listShows() {
      return [...shows];
    },
    async listShowsPage(query: ListQuery): Promise<PageResult<Show>> {
      const matched = shows.filter((show) =>
        matchesSearch(query.search, show.titleAr, show.titleEn, show.hostName, show.slug),
      );
      return paginate(matched, query);
    },
    async getShow(showId) {
      return shows.find((s) => s.id === showId) ?? null;
    },
    async getShowBySlug(slug) {
      return shows.find((s) => s.slug === slug) ?? null;
    },
    async createShow(input: CreateShowInput) {
      const show: Show = { id: id('shw'), createdAt: new Date().toISOString(), ...input };
      shows.push(show);
      return show;
    },
    async updateShow(showId, input: UpdateShowInput) {
      const show = shows.find((s) => s.id === showId);
      if (!show) return null;
      Object.assign(show, input);
      return show;
    },

    async listEpisodes(filter: EpisodeFilter) {
      return episodes
        .filter((e) => (filter.showId ? e.showId === filter.showId : true))
        .filter((e) => (filter.status ? e.status === filter.status : true))
        .sort((a, b) => (b.publishAt ?? b.createdAt).localeCompare(a.publishAt ?? a.createdAt));
    },
    async listEpisodesPage(filter: EpisodeFilter, query: ListQuery): Promise<PageResult<Episode>> {
      const matched = episodes
        .filter((e) => (filter.showId ? e.showId === filter.showId : true))
        .filter((e) => (filter.status ? e.status === filter.status : true))
        .filter((e) => matchesSearch(query.search, e.titleAr, e.titleEn, e.showNotesAr))
        .sort((a, b) => (b.publishAt ?? b.createdAt).localeCompare(a.publishAt ?? a.createdAt));
      return paginate(matched, query);
    },
    async getEpisode(episodeId) {
      return episodes.find((e) => e.id === episodeId) ?? null;
    },
    async createEpisode(input: CreateEpisodeInput) {
      const episode: Episode = {
        id: id('ep'),
        status: 'draft',
        createdAt: new Date().toISOString(),
        ...input,
      };
      episodes.push(episode);
      return episode;
    },
    async updateEpisode(episodeId, input: UpdateEpisodeInput) {
      const episode = episodes.find((e) => e.id === episodeId);
      if (!episode) return null;
      Object.assign(episode, input);
      return episode;
    },
    async updateEpisodeStatus(episodeId, status: EpisodeStatus, publishAt?: string) {
      const episode = episodes.find((e) => e.id === episodeId);
      if (!episode) return null;
      episode.status = status;
      if (publishAt !== undefined) episode.publishAt = publishAt;
      return episode;
    },
    async setEpisodeAudioKey(episodeId, audioKey) {
      const episode = episodes.find((e) => e.id === episodeId);
      if (!episode) return null;
      episode.audioKey = audioKey;
      return episode;
    },

    async listReadyMediaAssets() {
      return mediaAssets
        .filter((asset) => asset.status === 'ready')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async getMediaAsset(mediaId) {
      return mediaAssets.find((asset) => asset.id === mediaId) ?? null;
    },
    async createMediaUpload(input) {
      const asset: StoredMediaAsset = {
        ...input,
        kind: 'image',
        byteSize: input.expectedByteSize,
        status: 'pending',
      };
      mediaAssets.push(asset);
      return asset;
    },
    async claimMediaUpload(mediaId, staleBefore) {
      const asset = mediaAssets.find((candidate) => candidate.id === mediaId);
      if (!asset || asset.status === 'ready') return null;
      if (
        asset.status === 'uploading' &&
        (!asset.uploadStartedAt || Date.parse(asset.uploadStartedAt) > Date.parse(staleBefore))
      ) {
        return null;
      }
      asset.status = 'uploading';
      asset.uploadStartedAt = new Date().toISOString();
      asset.uploadToken = crypto.randomUUID();
      return { asset, uploadToken: asset.uploadToken };
    },
    async completeMediaUpload(mediaId, byteSize, uploadToken, storageKey) {
      const asset = mediaAssets.find((candidate) => candidate.id === mediaId);
      if (!asset || asset.status !== 'uploading' || asset.uploadToken !== uploadToken) {
        return null;
      }
      asset.status = 'ready';
      asset.byteSize = byteSize;
      asset.storageKey = storageKey;
      asset.uploadStartedAt = undefined;
      asset.uploadToken = undefined;
      return asset;
    },
    async releaseMediaUpload(mediaId, uploadToken) {
      const asset = mediaAssets.find((candidate) => candidate.id === mediaId);
      if (asset?.status === 'uploading' && asset.uploadToken === uploadToken) {
        asset.status = 'pending';
        asset.uploadStartedAt = undefined;
        asset.uploadToken = undefined;
      }
    },

    async readGuestDirectory() {
      return {
        guests: guests.map((guest) => ({ ...guest })),
        socials: guestSocials.map((social) => ({ ...social })),
        appearances: guestAppearances.map((appearance) => ({ ...appearance })),
      };
    },
    async listGuestsPage(query: ListQuery): Promise<PageResult<Guest>> {
      const matched = guests
        .filter((guest) =>
          matchesSearch(query.search, guest.name, guest.role, guest.city, guest.email, guest.slug),
        )
        .slice()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return paginate(matched, query);
    },
    async getGuest(guestId) {
      return guests.find((guest) => guest.id === guestId) ?? null;
    },
    async getGuestBySlug(slug) {
      return guests.find((guest) => guest.slug === slug) ?? null;
    },
    async createGuest(slug: string, input: CreateGuestInput) {
      const guest: Guest = {
        id: id('gst'),
        slug,
        name: input.name ?? '',
        role: input.role ?? '',
        city: input.city ?? '',
        email: input.email ?? '',
        bio: input.bio ?? '',
        photoUrl: input.photoUrl,
        createdAt: new Date().toISOString(),
      };
      guests.push(guest);
      return { ...guest };
    },
    async updateGuest(guestId, input: UpdateGuestInput) {
      const guest = guests.find((candidate) => candidate.id === guestId);
      if (!guest) return null;
      // An absent key leaves the field untouched; an explicit empty string clears it.
      if (input.name !== undefined) guest.name = input.name;
      if (input.role !== undefined) guest.role = input.role;
      if (input.city !== undefined) guest.city = input.city;
      if (input.email !== undefined) guest.email = input.email;
      if (input.bio !== undefined) guest.bio = input.bio;
      if (input.photoUrl !== undefined) guest.photoUrl = input.photoUrl;
      return { ...guest };
    },
    async listGuestSocials(guestId) {
      return guestSocials.filter((social) => social.guestId === guestId).map((s) => ({ ...s }));
    },
    async getGuestSocial(socialId) {
      return guestSocials.find((social) => social.id === socialId) ?? null;
    },
    async createGuestSocial(
      guestId: string,
      input: CreateGuestSocialInput,
    ): Promise<CreateGuestSocialResult> {
      if (!guests.some((guest) => guest.id === guestId)) return { status: 'guest_not_found' };
      if (
        guestSocials.some(
          (social) => social.guestId === guestId && social.platform === input.platform,
        )
      ) {
        return { status: 'duplicate_platform' };
      }
      const social: GuestSocial = {
        id: id('gsoc'),
        guestId,
        platform: input.platform,
        handle: input.handle,
      };
      guestSocials.push(social);
      return { status: 'created', social: { ...social } };
    },
    async updateGuestSocial(
      socialId: string,
      input: UpdateGuestSocialInput,
    ): Promise<UpdateGuestSocialResult> {
      const social = guestSocials.find((candidate) => candidate.id === socialId);
      if (!social) return { status: 'not_found' };
      const platform = input.platform ?? social.platform;
      if (
        platform !== social.platform &&
        guestSocials.some(
          (other) =>
            other.id !== socialId && other.guestId === social.guestId && other.platform === platform,
        )
      ) {
        return { status: 'duplicate_platform' };
      }
      social.platform = platform;
      if (input.handle !== undefined) social.handle = input.handle;
      return { status: 'updated', social: { ...social } };
    },
    async deleteGuestSocial(socialId) {
      const index = guestSocials.findIndex((social) => social.id === socialId);
      if (index < 0) return false;
      guestSocials.splice(index, 1);
      return true;
    },
    async listGuestAppearances(guestId) {
      return guestAppearances
        .filter((appearance) => appearance.guestId === guestId)
        .map((appearance) => ({ ...appearance }));
    },
    async listEpisodeGuests(episodeId) {
      const linked = new Set(
        guestAppearances
          .filter((appearance) => appearance.episodeId === episodeId)
          .map((appearance) => appearance.guestId),
      );
      return guests.filter((guest) => linked.has(guest.id)).map((guest) => ({ ...guest }));
    },
    async linkGuestAppearance(guestId, episodeId): Promise<LinkGuestAppearanceResult> {
      if (!guests.some((guest) => guest.id === guestId)) return { status: 'guest_not_found' };
      if (!episodes.some((episode) => episode.id === episodeId)) {
        return { status: 'episode_not_found' };
      }
      const existing = guestAppearances.find(
        (appearance) => appearance.guestId === guestId && appearance.episodeId === episodeId,
      );
      if (existing) return { status: 'already_linked', appearance: { ...existing } };
      const appearance: GuestAppearance = { guestId, episodeId };
      guestAppearances.push(appearance);
      return { status: 'linked', appearance: { ...appearance } };
    },
    async unlinkGuestAppearance(guestId, episodeId) {
      const index = guestAppearances.findIndex(
        (appearance) => appearance.guestId === guestId && appearance.episodeId === episodeId,
      );
      if (index < 0) return false;
      guestAppearances.splice(index, 1);
      return true;
    },

    async getContentSummary(): Promise<StudioContentSummary> {
      const episodeCounts = { draft: 0, scheduled: 0, published: 0, archived: 0 };
      for (const episode of episodes) episodeCounts[episode.status] += 1;
      const articleCounts = { draft: 0, published: 0 };
      for (const article of articles) articleCounts[article.status] += 1;
      return {
        shows: shows.length,
        guests: guests.length,
        episodes: { ...episodeCounts, total: episodes.length },
        articles: { ...articleCounts, total: articles.length },
      };
    },
    async getAudienceSummary(): Promise<StudioAudienceSummary> {
      const counts = { active: 0, past_due: 0, canceled: 0 };
      let monthlyRecurringRevenueMinor = 0;
      for (const subscription of subscriptions) {
        counts[subscription.status] += 1;
        if (subscription.status !== 'active') continue;
        const plan = plans.find((candidate) => candidate.id === subscription.planId);
        // Annual plans are amortized so the figure is always a monthly rate.
        const perMonth =
          plan?.interval === 'year'
            ? Math.round(subscription.priceMinor / 12)
            : subscription.priceMinor;
        monthlyRecurringRevenueMinor += perMonth;
      }
      return {
        users: users.length,
        subscriptions: { ...counts, total: subscriptions.length },
        monthlyRecurringRevenueMinor,
        currency: plans[0]?.currency ?? 'SAR',
      };
    },

    async listArticles(filter: ArticleFilter) {
      return articles
        .filter((a) => (filter.status ? a.status === filter.status : true))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async listArticlesPage(filter: ArticleFilter, query: ListQuery): Promise<PageResult<Article>> {
      const matched = articles
        .filter((a) => (filter.status ? a.status === filter.status : true))
        .filter((a) => matchesSearch(query.search, a.titleAr, a.titleEn, a.slug, a.excerptAr))
        .slice()
        .sort((a, b) =>
          (b.publishedAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.createdAt),
        );
      return paginate(matched, query);
    },
    async listArticleAuthorCandidates() {
      return studioMembers
        .flatMap((member) => {
          const displayName = normalizeArticleAuthorDisplayName(member.displayName);
          return displayName ? [{ studioMemberId: member.id, displayName }] : [];
        })
        .sort((a, b) => a.displayName.localeCompare(b.displayName, 'ar'));
    },
    async getArticle(articleId) {
      return articles.find((a) => a.id === articleId) ?? null;
    },
    async getArticleBySlug(slug) {
      return articles.find((a) => a.slug === slug) ?? null;
    },
    async createArticle(input) {
      const article = createArticleRecord(id('art'), input, new Date().toISOString());
      articles.push(article);
      return article;
    },
    async updateArticle(articleId, input) {
      const index = articles.findIndex((article) => article.id === articleId);
      if (index < 0) return null;
      if (articles[index].version !== input.expectedVersion) return null;
      const article = mergeArticleUpdate(articles[index], input, new Date().toISOString());
      articles[index] = article;
      return article;
    },
    async updateArticleStatus(
      articleId,
      status: ArticleStatus,
      expectedVersion: number,
      publishedAt?: string,
    ) {
      const article = articles.find((a) => a.id === articleId);
      if (!article) return null;
      if (article.version !== expectedVersion) return null;
      article.status = status;
      if (publishedAt !== undefined) article.publishedAt = publishedAt;
      article.version += 1;
      article.updatedAt = new Date().toISOString();
      Object.assign(article, refreshNeedsSync(article));
      return article;
    },
    async claimArticleNewsletterSync(articleId, expectedVersion) {
      const article = articles.find((item) => item.id === articleId);
      if (!article) return { status: 'not_found' };
      if (article.version !== expectedVersion) {
        return { status: 'version_conflict', article };
      }
      if (article.newsletter.status === 'sent') return { status: 'sent', article };
      if (article.newsletter.status === 'syncing') {
        const startedAt = article.newsletter.syncStartedAt
          ? Date.parse(article.newsletter.syncStartedAt)
          : 0;
        if (Date.now() - startedAt < 5 * 60_000) {
          return { status: 'sync_in_progress', article };
        }
        if (!article.newsletter.campaignId) {
          article.newsletter.status = 'sync_unknown';
          article.newsletter.syncStartedAt = undefined;
          articleNewsletterSyncTokens.delete(articleId);
          article.newsletter.needsSync = true;
          return { status: 'sync_unknown', article };
        }
        article.newsletter.syncStartedAt = new Date().toISOString();
        const syncToken = crypto.randomUUID();
        articleNewsletterSyncTokens.set(articleId, syncToken);
        return { status: 'claimed', article, syncToken };
      }
      if (
        !article.newsletter.enabled ||
        !['draft', 'campaign_created'].includes(article.newsletter.status)
      ) {
        return { status: 'not_ready', article };
      }
      article.newsletter.status = 'syncing';
      article.newsletter.syncStartedAt = new Date().toISOString();
      const syncToken = crypto.randomUUID();
      articleNewsletterSyncTokens.set(articleId, syncToken);
      article.updatedAt = article.newsletter.syncStartedAt;
      return { status: 'claimed', article, syncToken };
    },
    async setArticleNewsletterCampaign(articleId, campaignId, syncToken) {
      const article = articles.find((item) => item.id === articleId);
      if (!article || articleNewsletterSyncTokens.get(articleId) !== syncToken) return null;
      article.newsletter.campaignId = campaignId;
      article.newsletter.status = 'syncing';
      article.newsletter.syncedVersion = undefined;
      article.newsletter.needsSync = true;
      article.updatedAt = new Date().toISOString();
      return article;
    },
    async markArticleNewsletterSynced(articleId, campaignId, expectedVersion, syncToken) {
      const article = articles.find((item) => item.id === articleId);
      if (!article || article.version !== expectedVersion) return null;
      if (
        article.newsletter.campaignId !== campaignId ||
        article.newsletter.status === 'sent' ||
        articleNewsletterSyncTokens.get(articleId) !== syncToken
      ) {
        return null;
      }
      article.newsletter.status = 'campaign_created';
      article.newsletter.syncedVersion = expectedVersion;
      article.newsletter.needsSync = false;
      article.newsletter.syncStartedAt = undefined;
      articleNewsletterSyncTokens.delete(articleId);
      article.updatedAt = new Date().toISOString();
      return article;
    },
    async claimArticleNewsletterSend(articleId, expectedVersion, expectedCampaignId) {
      const article = articles.find((item) => item.id === articleId);
      if (!article) return { status: 'not_found' };
      if (
        article.version !== expectedVersion ||
        article.newsletter.campaignId !== expectedCampaignId
      ) {
        return { status: 'confirmation_stale', article };
      }
      if (article.newsletter.status === 'sent') return { status: 'already_sent', article };
      if (article.newsletter.status === 'sending') {
        return { status: 'send_in_progress', article };
      }
      if (!article.newsletter.campaignId || article.newsletter.status !== 'campaign_created') {
        return { status: 'not_ready', article };
      }
      if (article.newsletter.syncedVersion !== article.version) {
        return { status: 'sync_required', article };
      }
      const startedAt = new Date().toISOString();
      const sendToken = crypto.randomUUID();
      article.newsletter.status = 'sending';
      article.updatedAt = startedAt;
      articleNewsletterSendLeases.set(articleId, { token: sendToken, startedAt });
      return { status: 'claimed', article, sendToken };
    },
    async touchArticleNewsletterSendLease(articleId, sendToken) {
      const article = articles.find((item) => item.id === articleId);
      const lease = articleNewsletterSendLeases.get(articleId);
      if (!article || article.newsletter.status !== 'sending' || lease?.token !== sendToken) {
        return null;
      }
      const startedAt = new Date().toISOString();
      articleNewsletterSendLeases.set(articleId, { token: sendToken, startedAt });
      article.updatedAt = startedAt;
      return article;
    },
    async completeArticleNewsletterSend(articleId, sentAt, sendToken) {
      const article = articles.find((item) => item.id === articleId);
      if (
        !article ||
        article.newsletter.status !== 'sending' ||
        articleNewsletterSendLeases.get(articleId)?.token !== sendToken
      ) {
        return null;
      }
      article.newsletter.status = 'sent';
      article.newsletter.sentAt = sentAt;
      article.newsletter.needsSync = false;
      article.newsletter.syncStartedAt = undefined;
      articleNewsletterSyncTokens.delete(articleId);
      articleNewsletterSendLeases.delete(articleId);
      article.updatedAt = new Date().toISOString();
      return article;
    },
    async reconcileArticleNewsletterSent(articleId, sentAt) {
      const article = articles.find((item) => item.id === articleId);
      if (!article) return null;
      article.newsletter.status = 'sent';
      article.newsletter.sentAt = article.newsletter.sentAt ?? sentAt;
      article.newsletter.needsSync = false;
      article.newsletter.syncStartedAt = undefined;
      articleNewsletterSyncTokens.delete(articleId);
      articleNewsletterSendLeases.delete(articleId);
      article.updatedAt = new Date().toISOString();
      return article;
    },
    async releaseArticleNewsletterSend(articleId, sendToken) {
      const article = articles.find((item) => item.id === articleId);
      if (
        !article ||
        article.newsletter.status !== 'sending' ||
        articleNewsletterSendLeases.get(articleId)?.token !== sendToken
      ) {
        return null;
      }
      article.newsletter.status = 'campaign_created';
      articleNewsletterSendLeases.delete(articleId);
      article.updatedAt = new Date().toISOString();
      return article;
    },
    async recoverStaleArticleNewsletterSend(articleId, staleBefore) {
      const article = articles.find((item) => item.id === articleId);
      const lease = articleNewsletterSendLeases.get(articleId);
      if (
        !article ||
        article.newsletter.status !== 'sending' ||
        !lease ||
        Date.parse(lease.startedAt) > Date.parse(staleBefore)
      ) {
        return null;
      }
      article.newsletter.status = 'campaign_created';
      articleNewsletterSendLeases.delete(articleId);
      article.updatedAt = new Date().toISOString();
      return article;
    },
    async releaseArticleNewsletterSync(articleId, syncToken) {
      const article = articles.find((item) => item.id === articleId);
      if (
        !article ||
        article.newsletter.status !== 'syncing' ||
        articleNewsletterSyncTokens.get(articleId) !== syncToken
      ) {
        return null;
      }
      article.newsletter.status = article.newsletter.campaignId ? 'campaign_created' : 'draft';
      article.newsletter.needsSync = Boolean(article.newsletter.campaignId);
      article.newsletter.syncStartedAt = undefined;
      articleNewsletterSyncTokens.delete(articleId);
      article.updatedAt = new Date().toISOString();
      return article;
    },
    async markArticleNewsletterSyncUnknown(articleId, syncToken) {
      const article = articles.find((item) => item.id === articleId);
      if (
        !article ||
        article.newsletter.status !== 'syncing' ||
        articleNewsletterSyncTokens.get(articleId) !== syncToken
      ) {
        return null;
      }
      article.newsletter.status = 'sync_unknown';
      article.newsletter.needsSync = true;
      article.newsletter.syncStartedAt = undefined;
      articleNewsletterSyncTokens.delete(articleId);
      article.updatedAt = new Date().toISOString();
      return article;
    },

    async listPlans() {
      return [...plans];
    },
    async getPlan(planId) {
      return plans.find((p) => p.id === planId) ?? null;
    },

    async listSubscriptions() {
      return [...subscriptions];
    },
    async getSubscriptionForUser(userId) {
      return subscriptions.find((s) => s.userId === userId && s.status !== 'canceled') ?? null;
    },
    async getSubscription(subscriptionId) {
      return subscriptions.find((s) => s.id === subscriptionId) ?? null;
    },
    async createSubscription(input, priceMinor, currency, currentPeriodEnd) {
      const subscription: Subscription = {
        id: id('sub'),
        userId: input.userId,
        planId: input.planId,
        status: 'active',
        priceMinor,
        currency,
        currentPeriodEnd,
        createdAt: new Date().toISOString(),
      };
      subscriptions.push(subscription);
      return subscription;
    },
    async updateSubscriptionStatus(subscriptionId, status: SubscriptionStatus) {
      const subscription = subscriptions.find((s) => s.id === subscriptionId);
      if (!subscription) return null;
      subscription.status = status;
      return subscription;
    },

    async listFollows(userId) {
      return follows.filter((f) => f.userId === userId);
    },
    async createFollow(userId, showId) {
      const existing = follows.find((f) => f.userId === userId && f.showId === showId);
      if (existing) return existing;
      const follow: Follow = { userId, showId, createdAt: new Date().toISOString() };
      follows.push(follow);
      return follow;
    },
    async deleteFollow(userId, showId) {
      const index = follows.findIndex((f) => f.userId === userId && f.showId === showId);
      if (index === -1) return false;
      follows.splice(index, 1);
      return true;
    },

    async listProgress(userId) {
      return progress.filter((p) => p.userId === userId);
    },
    async upsertProgress(userId, episodeId, positionSec) {
      const existing = progress.find((p) => p.userId === userId && p.episodeId === episodeId);
      if (existing) {
        existing.positionSec = positionSec;
        existing.updatedAt = new Date().toISOString();
        return existing;
      }
      const entry: PlaybackProgress = {
        userId,
        episodeId,
        positionSec,
        updatedAt: new Date().toISOString(),
      };
      progress.push(entry);
      return entry;
    },
  };
}
