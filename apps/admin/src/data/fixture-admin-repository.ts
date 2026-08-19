import {
  PERMISSION_IDS,
  canTransitionEpisode as canTransitionApiEpisode,
  canTransitionSubscription as canTransitionApiSubscription,
  createDefaultRolePermissionMatrix,
  isPermissionId,
  type ArticleImageAlignment,
  type ArticleImagePresentation,
  type ArticleImageRadius,
  type ArticleTextAlignment,
  type ArticleTextDirection,
  type ArticleTextSectionHeight,
  type ArticleTextVerticalAlignment,
} from '@mukhtalif/types';
import { createStudioRoleSchema } from '@mukhtalif/validation';
import {
  createDemoData,
  type AdminStudioMemberDirectory,
  type AdminContentWorkspace,
  type AdminStudioData,
  type AdminSubscriberDirectory,
  type AdminViewer,
  type Article,
  type ArticleAuthor,
  type ArticleAuthorCandidate,
  type ArticleId,
  type Episode,
  type EpisodeId,
  type Guest,
  type GuestId,
  type GuestSocial,
  type GuestSocialId,
  type MailchimpCapability,
  type NewsletterPreview,
  type Show,
  type ShowId,
  type PermissionId,
  type RolePermissionMatrix,
  type RoleId,
  type RichTextNode,
  type StudioMember,
  type StudioMemberId,
  type StudioRole,
  type Subscription,
  type SubscriptionId,
} from '@/lib';
import type {
  AdminAnalyticsSnapshot,
  AdminGuestDirectory,
  ArticleMediaAsset,
  AdminNewsletterCampaignResult,
  AdminNewsletterSendResult,
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
import type { DemoAdminAccount } from './admin-auth-gateway';
import { AdminRepositoryError } from './repository-error';
import { normalizeCreateStudioMemberCommand } from './studio-member-command';

const FIXTURE_CAPABILITIES = {
  'core-dashboard': true,
  'content-mutations': true,
  'subscription-mutations': true,
  'episode-audio-upload': true,
  'guest-management': true,
  'admin-analytics': true,
  'access-management': true,
} as const;

export interface FixtureAdminRepositoryOptions {
  readonly initialData?: AdminStudioData;
  readonly initialRolePermissions?: RolePermissionMatrix;
  readonly now?: () => Date;
  readonly getAuthenticatedSubject?: () =>
    | { readonly id: string; readonly email: string }
    | null;
  readonly registerAuthAccount?: (
    account: Omit<DemoAdminAccount, 'password'>,
  ) => void;
  readonly updateAuthAccountRole?: (
    id: string,
    role: DemoAdminAccount['role'],
  ) => void;
}

function cloneData(data: AdminStudioData): AdminStudioData {
  return {
    ...data,
    viewer: { ...data.viewer, permissions: [...data.viewer.permissions] },
    plusPlan: { ...data.plusPlan },
    shows: data.shows.map((show) => ({ ...show })),
    episodes: data.episodes.map((episode) => ({ ...episode })),
    articles: data.articles.map((article) => ({
      ...article,
      content: structuredClone(article.content),
      seo: { ...article.seo },
      newsletter: { ...article.newsletter },
    })),
    guests: data.guests.map((guest) => ({ ...guest })),
    guestSocials: data.guestSocials.map((social) => ({ ...social })),
    guestAppearances: data.guestAppearances.map((appearance) => ({ ...appearance })),
    studioMembers: data.studioMembers.map((member) => ({ ...member })),
    users: data.users.map((user) => ({ ...user })),
    subscriptions: data.subscriptions.map((subscription) => ({ ...subscription })),
  };
}

function clonePermissionMatrix(matrix: RolePermissionMatrix): RolePermissionMatrix {
  const clone = Object.fromEntries(
    Object.entries(matrix).map(([role, permissions]) => [role, [...permissions]]),
  ) as RolePermissionMatrix;
  clone.admin = [...PERMISSION_IDS];
  return clone;
}

function cloneRole(role: StudioRole): StudioRole {
  return { ...role, permissions: [...role.permissions] };
}

function repositoryError(
  code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION',
  operation: string,
  message: string,
  context?: Readonly<Record<string, unknown>>,
): AdminRepositoryError {
  return new AdminRepositoryError({ code, operation, message, retryable: false, context });
}

function requireText(value: string, field: string, operation: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw repositoryError('VALIDATION', operation, `${field} is required.`, { field });
  }
  return normalized;
}

function optionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function isSafeArticleLink(value: string): boolean {
  const href = value.trim();
  if (!href || href.startsWith('//')) return false;
  if ((href.startsWith('/') && !href.startsWith('//')) || href.startsWith('#')) return true;
  try {
    const url = new URL(href);
    return (
      (url.protocol === 'https:' || url.protocol === 'mailto:') &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

const EMAIL_IMAGE_ALIGNMENT: Record<
  ArticleImageAlignment,
  { readonly html: 'left' | 'center' | 'right'; readonly imageMargin: string }
> = {
  start: { html: 'right', imageMargin: '0 0 0 auto' },
  center: { html: 'center', imageMargin: '0 auto' },
  end: { html: 'left', imageMargin: '0 auto 0 0' },
};

const WEB_IMAGE_PRESENTATION: Record<ArticleImagePresentation, string> = {
  content: 'width:100%;max-width:640px',
  wide: 'width:100%;max-width:none',
};

const WEB_IMAGE_ALIGNMENT: Record<ArticleImageAlignment, string> = {
  start: 'margin-inline-start:0;margin-inline-end:auto',
  center: 'margin-inline-start:auto;margin-inline-end:auto',
  end: 'margin-inline-start:auto;margin-inline-end:0',
};

const IMAGE_RADIUS: Record<ArticleImageRadius, string> = {
  none: '0',
  soft: '12px',
  round: '28px',
};

const TEXT_SECTION_MIN_HEIGHT: Record<ArticleTextSectionHeight, number> = {
  auto: 0,
  short: 120,
  medium: 200,
  tall: 320,
};

const TEXT_SECTION_JUSTIFY_CONTENT: Record<ArticleTextVerticalAlignment, string> = {
  top: 'flex-start',
  middle: 'center',
  bottom: 'flex-end',
};

const EMAIL_VERTICAL_ALIGNMENT: Record<ArticleTextVerticalAlignment, 'top' | 'middle' | 'bottom'> = {
  top: 'top',
  middle: 'middle',
  bottom: 'bottom',
};

function imageAlignment(value: unknown): ArticleImageAlignment {
  return value === 'start' || value === 'end' ? value : 'center';
}

function imageRadius(value: unknown): ArticleImageRadius {
  return value === 'soft' || value === 'round' ? value : 'none';
}

function textAlignment(value: unknown): ArticleTextAlignment {
  return value === 'center' || value === 'end' || value === 'justify' ? value : 'start';
}

function textDirection(value: unknown): ArticleTextDirection {
  return value === 'ltr' ? 'ltr' : 'rtl';
}

function textVerticalAlignment(value: unknown): ArticleTextVerticalAlignment {
  return value === 'middle' || value === 'bottom' ? value : 'top';
}

function textSectionHeight(value: unknown): ArticleTextSectionHeight {
  return value === 'short' || value === 'medium' || value === 'tall' ? value : 'auto';
}

function emailTextAlignment(
  alignment: ArticleTextAlignment,
  direction: ArticleTextDirection,
): 'left' | 'center' | 'right' | 'justify' {
  if (alignment === 'center' || alignment === 'justify') return alignment;
  if (alignment === 'start') return direction === 'rtl' ? 'right' : 'left';
  return direction === 'rtl' ? 'left' : 'right';
}

function renderArticleNode(
  node: RichTextNode,
  mediaAssets: readonly ArticleMediaAsset[] = [],
  channel: 'web' | 'email' = 'web',
): string {
  const children =
    node.content?.map((child) => renderArticleNode(child, mediaAssets, channel)).join('') ?? '';

  if (node.type === 'text') {
    let value = escapeHtml(node.text ?? '');
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold') value = `<strong>${value}</strong>`;
      if (mark.type === 'italic') value = `<em>${value}</em>`;
      if (mark.type === 'link') {
        const href = typeof mark.attrs?.href === 'string' ? mark.attrs.href : '';
        if (isSafeArticleLink(href)) {
          value = `<a href="${escapeHtml(href)}">${value}</a>`;
        }
      }
    }
    return value;
  }

  switch (node.type) {
    case 'doc':
      return children;
    case 'paragraph':
      return `<p>${children}</p>`;
    case 'heading': {
      const level = node.attrs?.level === 3 ? 3 : 2;
      return `<h${level}>${children}</h${level}>`;
    }
    case 'bulletList':
      return `<ul>${children}</ul>`;
    case 'orderedList':
      return `<ol>${children}</ol>`;
    case 'listItem':
      return `<li>${children}</li>`;
    case 'blockquote':
      return `<blockquote>${children}</blockquote>`;
    case 'hardBreak':
      return '<br>';
    case 'textSection': {
      const attrs = node.attrs as Record<string, unknown> | undefined;
      const alignment = textAlignment(attrs?.alignment);
      const direction = textDirection(attrs?.direction);
      const height = textSectionHeight(attrs?.height);
      const vertical = height === 'auto' ? 'top' : textVerticalAlignment(attrs?.vertical);
      const minimumHeight = TEXT_SECTION_MIN_HEIGHT[height];
      const className = `article-text-section article-text-section--align-${alignment} article-text-section--height-${height} article-text-section--vertical-${vertical}`;
      if (channel === 'email') {
        const physicalAlignment = emailTextAlignment(alignment, direction);
        const heightAttribute = minimumHeight > 0 ? ` height="${minimumHeight}"` : '';
        const heightStyle = minimumHeight > 0 ? `height:${minimumHeight}px` : 'min-height:0';
        return `<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" dir="${direction}" style="width:100%;border-collapse:collapse;direction:${direction}"><tbody><tr><td${heightAttribute} valign="${EMAIL_VERTICAL_ALIGNMENT[vertical]}" align="${physicalAlignment}" dir="${direction}" style="${heightStyle};vertical-align:${EMAIL_VERTICAL_ALIGNMENT[vertical]};text-align:${physicalAlignment};direction:${direction}">${children}</td></tr></tbody></table>`;
      }
      return `<section class="${className}" data-article-text-section="" data-alignment="${alignment}" data-direction="${direction}" data-vertical="${vertical}" data-height="${height}" dir="${direction}" style="display:flex;flex-direction:column;justify-content:${TEXT_SECTION_JUSTIFY_CONTENT[vertical]};min-height:${minimumHeight}px;text-align:${alignment};direction:${direction}">${children}</section>`;
    }
    case 'imageBlock': {
      const attrs = node.attrs as Record<string, unknown> | undefined;
      const mediaId = typeof attrs?.mediaId === 'string' ? attrs.mediaId : '';
      const asset = mediaAssets.find((candidate) => candidate.id === mediaId);
      if (!asset?.publicUrl) return '';
      const alt = typeof attrs?.alt === 'string' ? attrs.alt : asset.defaultAlt;
      const caption = typeof attrs?.caption === 'string' ? attrs.caption : '';
      const presentation = attrs?.presentation === 'wide' ? 'wide' : 'content';
      const alignment = imageAlignment(attrs?.alignment);
      const radius = imageRadius(attrs?.radius);
      if (channel === 'email') {
        const emailAlignment = EMAIL_IMAGE_ALIGNMENT[alignment];
        return `<div align="${emailAlignment.html}" style="margin:24px 0;text-align:${emailAlignment.html}"><img src="${escapeHtml(asset.publicUrl)}" alt="${escapeHtml(alt)}" style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:${IMAGE_RADIUS[radius]};margin:${emailAlignment.imageMargin}">${caption ? `<p style="margin:8px 0 0;color:#4A4E7C;font-size:14px;text-align:${emailAlignment.html}">${escapeHtml(caption)}</p>` : ''}</div>`;
      }
      const figureStyle = `${WEB_IMAGE_PRESENTATION[presentation]};margin-block:24px;${WEB_IMAGE_ALIGNMENT[alignment]}`;
      return `<figure data-media-kind="image" data-presentation="${presentation}" data-alignment="${alignment}" data-radius="${radius}" style="${figureStyle}"><img src="${escapeHtml(asset.publicUrl)}" alt="${escapeHtml(alt)}" style="display:block;width:100%;height:auto;border:0;border-radius:${IMAGE_RADIUS[radius]}" loading="lazy" decoding="async">${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}</figure>`;
    }
    case 'imageGallery': {
      const attrs = node.attrs as Record<string, unknown> | undefined;
      const rawItems = Array.isArray(attrs?.items) ? attrs.items : [];
      const seen = new Set<string>();
      const items = rawItems
        .flatMap((candidate) => {
          if (!candidate || typeof candidate !== 'object') return [];
          const item = candidate as Record<string, unknown>;
          const mediaId = typeof item.mediaId === 'string' ? item.mediaId : '';
          if (!mediaId || seen.has(mediaId)) return [];
          seen.add(mediaId);
          const asset = mediaAssets.find((media) => media.id === mediaId);
          if (!asset?.publicUrl) return [];
          return [
            {
              publicUrl: asset.publicUrl,
              alt: typeof item.alt === 'string' ? item.alt : (asset.defaultAlt ?? ''),
            },
          ];
        })
        .slice(0, 3);
      if (!items.length) return '';
      const caption = typeof attrs?.caption === 'string' ? attrs.caption.trim() : '';
      if (channel === 'email') {
        const width = items.length === 3 ? '33.3333%' : '50%';
        const maximumImageWidth = items.length === 3 ? 200 : 300;
        const cells = items
          .map(
            ({ publicUrl, alt }) =>
              `<td width="${width}" valign="top" style="width:${width};vertical-align:top;padding:0 4px"><img src="${escapeHtml(publicUrl)}" alt="${escapeHtml(alt)}" style="display:block;width:100%;max-width:${maximumImageWidth}px;height:auto;border:0"></td>`,
          )
          .join('');
        return `<div data-media-kind="image-gallery" style="margin:24px 0"><table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" dir="rtl" style="width:100%;border-collapse:collapse;table-layout:fixed"><tbody><tr>${cells}</tr></tbody></table>${caption ? `<p style="margin:8px 4px 0;color:#4A4E7C;font-size:14px;text-align:right">${escapeHtml(caption)}</p>` : ''}</div>`;
      }
      const images = items
        .map(
          ({ publicUrl, alt }) =>
            `<div style="display:block;flex:1 1 180px;min-width:0"><img src="${escapeHtml(publicUrl)}" alt="${escapeHtml(alt)}" style="display:block;width:100%;height:auto;border:0" loading="lazy" decoding="async"></div>`,
        )
        .join('');
      return `<figure data-media-kind="image-gallery" data-image-count="${items.length}" style="margin:24px 0"><div class="article-image-gallery__grid" style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start">${images}</div>${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}</figure>`;
    }
    case 'videoEmbed': {
      const attrs = node.attrs as Record<string, unknown> | undefined;
      const provider = attrs?.provider === 'vimeo' ? 'vimeo' : 'youtube';
      const videoId = typeof attrs?.videoId === 'string' ? attrs.videoId : '';
      const title = typeof attrs?.title === 'string' ? attrs.title : 'فيديو';
      const posterId = typeof attrs?.posterMediaId === 'string' ? attrs.posterMediaId : '';
      const poster = mediaAssets.find((candidate) => candidate.id === posterId);
      const caption = typeof attrs?.caption === 'string' ? attrs.caption : '';
      const watchUrl = provider === 'youtube'
        ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`
        : `https://vimeo.com/${encodeURIComponent(videoId)}`;
      if (channel === 'email') {
        return `<figure><a href="${watchUrl}">${poster?.publicUrl ? `<img src="${escapeHtml(poster.publicUrl)}" alt="" style="display:block;width:100%;height:auto;border-radius:8px">` : ''}<strong>مشاهدة الفيديو: ${escapeHtml(title)}</strong></a>${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}</figure>`;
      }
      const embedUrl = provider === 'youtube'
        ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`
        : `https://player.vimeo.com/video/${encodeURIComponent(videoId)}`;
      return `<figure><iframe src="${embedUrl}" title="${escapeHtml(title)}" style="display:block;border:0;border-radius:8px" loading="lazy" allow="fullscreen; picture-in-picture" allowfullscreen></iframe>${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}</figure>`;
    }
    default:
      return children;
  }
}

function articleText(document: Article['content']): string {
  const blocks: string[] = [];
  function visit(node: RichTextNode) {
    if (node.type === 'text' && node.text) blocks.push(node.text);
    if (node.type === 'imageBlock') {
      const attrs = node.attrs as Record<string, unknown> | undefined;
      if (typeof attrs?.alt === 'string') blocks.push(attrs.alt);
      if (typeof attrs?.caption === 'string') blocks.push(attrs.caption);
    }
    if (node.type === 'imageGallery') {
      const attrs = node.attrs as Record<string, unknown> | undefined;
      for (const candidate of Array.isArray(attrs?.items) ? attrs.items : []) {
        if (!candidate || typeof candidate !== 'object') continue;
        const item = candidate as Record<string, unknown>;
        if (typeof item.alt === 'string') blocks.push(item.alt);
      }
      if (typeof attrs?.caption === 'string') blocks.push(attrs.caption);
    }
    if (node.type === 'videoEmbed') {
      const attrs = node.attrs as Record<string, unknown> | undefined;
      if (typeof attrs?.title === 'string') blocks.push(attrs.title);
      if (typeof attrs?.caption === 'string') blocks.push(attrs.caption);
      if (typeof attrs?.videoId === 'string' && attrs.videoId) {
        blocks.push(
          attrs.provider === 'vimeo'
            ? `https://vimeo.com/${encodeURIComponent(attrs.videoId)}`
            : `https://www.youtube.com/watch?v=${encodeURIComponent(attrs.videoId)}`,
        );
      }
    }
    for (const child of node.content ?? []) visit(child);
    if (['paragraph', 'heading', 'listItem', 'blockquote'].includes(node.type)) blocks.push('\n');
  }
  visit(document);
  return blocks.join(' ').replace(/\s+/g, ' ').trim();
}

function newsletterHtml(article: Article, mediaAssets: readonly ArticleMediaAsset[]): string {
  const preheader = article.newsletter.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden">${escapeHtml(article.newsletter.preheader)}</div>`
    : '';
  const cover = article.coverUrl
    ? `<img data-article-cover="" src="${escapeHtml(article.coverUrl)}" alt="${escapeHtml(article.coverAlt ?? article.title)}" width="584" style="display:block;width:100%;height:auto;border:0;border-radius:8px;margin:0 0 24px">`
    : '';
  const byline = `<p data-article-byline="" style="margin:${article.authorPlacement === 'end' ? '24px 0 0' : '0 0 20px'};color:#575a76;font-size:14px">بقلم <bdi dir="auto" style="unicode-bidi:isolate">${escapeHtml(article.author.displayName)}</bdi></p>`;
  const content = renderArticleNode(article.content, mediaAssets, 'email');
  const articleBody =
    article.authorPlacement === 'end' ? `${content}${byline}` : `${byline}${content}`;
  const titleMargin = article.authorPlacement === 'end' ? '0 0 20px' : '0 0 8px';
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(article.newsletter.subject ?? article.title)}</title></head><body style="margin:0;background:#f4f1ea;color:#171a56;font-family:Tahoma,Arial,sans-serif">${preheader}<main style="width:100%;max-width:640px;margin:0 auto;background:#fff"><header style="padding:24px 28px;border-bottom:4px solid #171a56"><strong style="font-size:24px">مختلف</strong><p style="margin:8px 0 0;color:#575a76;font-size:13px">معاينة محلية للنشرة الأسبوعية</p></header><article style="padding:30px 28px;line-height:1.9">${cover}<h1 style="margin:${titleMargin};font-size:30px;line-height:1.45">${escapeHtml(article.title)}</h1>${articleBody}</article><footer style="padding:22px 28px;background:#171a56;color:#fff;font-size:12px;line-height:1.8"><strong>مختلف</strong><p style="margin:6px 0 0">هذه معاينة تمثيلية محلية. تُدار بيانات الاشتراك وإلغاء الاشتراك عبر Mailchimp عند تفعيل الربط الفعلي.</p></footer></main></body></html>`;
}

function addOneMonth(value: Date): string {
  const result = new Date(value.getTime());
  result.setUTCMonth(result.getUTCMonth() + 1);
  return result.toISOString();
}

/**
 * Stateful development repository backed only by the design-handoff fixtures.
 * A fresh instance owns a fresh copy, making mutation behavior deterministic in
 * tests and preventing shared module state between stories.
 */
export class FixtureAdminRepository implements AdminRepository {
  readonly kind = 'fixture' as const;
  readonly capabilities = FIXTURE_CAPABILITIES;

  private readonly now: () => Date;
  private readonly getAuthenticatedSubject?: FixtureAdminRepositoryOptions['getAuthenticatedSubject'];
  private readonly registerAuthAccount?: FixtureAdminRepositoryOptions['registerAuthAccount'];
  private readonly updateAuthAccountRole?: FixtureAdminRepositoryOptions['updateAuthAccountRole'];
  private rolePermissions: Record<RoleId, PermissionId[]>;
  private roles: StudioRole[];
  private mediaAssets: ArticleMediaAsset[] = [];
  private data: AdminStudioData;
  private sequence = 0;

  constructor(options: FixtureAdminRepositoryOptions = {}) {
    this.data = cloneData(options.initialData ?? createDemoData());
    const initialPermissions = clonePermissionMatrix(
      options.initialRolePermissions ?? createDefaultRolePermissionMatrix(),
    );
    this.rolePermissions = initialPermissions;
    const seededAt = this.data.asOf;
    this.roles = [
      {
        id: 'admin',
        name: 'المشرف العام',
        description: 'صلاحيات كاملة وثابتة لإدارة الاستوديو والوصول.',
        isSystem: true,
        isProtected: true,
        permissions: [...PERMISSION_IDS],
        memberCount: 0,
        createdAt: seededAt,
        updatedAt: seededAt,
      },
      {
        id: 'editor',
        name: 'مدير المحتوى',
        description: 'إدارة المحتوى والحلقات والبرامج وفق الصلاحيات المحددة.',
        isSystem: true,
        isProtected: false,
        permissions: [...this.rolePermissions.editor],
        memberCount: 0,
        createdAt: seededAt,
        updatedAt: seededAt,
      },
    ];
    this.data.studioMembers = this.data.studioMembers.map((member) => ({
      ...member,
      roleName: this.roles.find((role) => role.id === member.role)?.name ?? member.role,
    }));
    this.data.viewer.roleName =
      this.roles.find((role) => role.id === this.data.viewer.role)?.name ??
      this.data.viewer.role;
    this.now = options.now ?? (() => new Date());
    this.getAuthenticatedSubject = options.getAuthenticatedSubject;
    this.registerAuthAccount = options.registerAuthAccount;
    this.updateAuthAccountRole = options.updateAuthAccountRole;
  }

  async readViewer(): Promise<AdminViewer> {
    const member = this.requireStudioMember('readViewer');
    return {
      id: member.id,
      name: member.name,
      email: member.email,
      role: member.role,
      roleName: this.roleName(member.role),
      permissions: [...(this.rolePermissions[member.role] ?? [])],
      avatarInitial: Array.from(member.name.trim())[0] ?? 'م',
    };
  }

  async readContentWorkspace(): Promise<AdminContentWorkspace> {
    const member = this.requireAnyPermission('readContentWorkspace', [
      'overview.view',
      'episodes.view',
      'shows.view',
      'guests.view',
      'articles.view',
    ]);
    const snapshot = cloneData(this.data);
    return {
      asOf: snapshot.asOf,
      shows: snapshot.shows,
      episodes: this.hasPermission(member, 'episodes.view')
        ? snapshot.episodes
        : snapshot.episodes.filter((episode) => episode.status === 'published'),
      articles: this.hasPermission(member, 'articles.view')
        ? snapshot.articles
        : snapshot.articles.filter((article) => article.status === 'published'),
    };
  }

  async readSubscriberDirectory(): Promise<AdminSubscriberDirectory> {
    this.requirePermission('readSubscriberDirectory', 'subscribers.view');
    const snapshot = cloneData(this.data);
    return {
      plusPlan: snapshot.plusPlan,
      users: snapshot.users,
      subscriptions: snapshot.subscriptions,
    };
  }

  async readStudioMemberDirectory(): Promise<AdminStudioMemberDirectory> {
    this.requirePermission('readStudioMemberDirectory', 'access.view');
    const snapshot = cloneData(this.data);
    return { studioMembers: snapshot.studioMembers };
  }

  async readRoles(): Promise<StudioRole[]> {
    this.requirePermission('readRoles', 'access.view');
    return this.roles.map((role) => this.roleSnapshot(role));
  }

  async readRole(id: RoleId): Promise<StudioRole> {
    this.requirePermission('readRole', 'access.view');
    const role = this.roles.find((candidate) => candidate.id === id);
    if (!role) throw repositoryError('NOT_FOUND', 'readRole', 'Role not found.', { id });
    return this.roleSnapshot(role);
  }

  async readGuestDirectory(): Promise<AdminGuestDirectory> {
    this.requirePermission('readGuestDirectory', 'guests.view');
    const snapshot = cloneData(this.data);
    return {
      guests: snapshot.guests,
      guestSocials: snapshot.guestSocials,
      guestAppearances: snapshot.guestAppearances,
    };
  }

  async readAnalytics(): Promise<AdminAnalyticsSnapshot> {
    this.requireAdmin('readAnalytics');
    const asOf = new Date(this.data.asOf);
    const periodStart = new Date(asOf.getTime() - 30 * 24 * 60 * 60 * 1_000);
    const activeSubscriptions = this.data.subscriptions.filter(
      (subscription) => subscription.status === 'active',
    );

    return {
      asOf: this.data.asOf,
      source: 'fixture-derived',
      newUsersLast30Days: this.data.users.filter((user) => {
        const joinedAt = new Date(user.joinedAt);
        return joinedAt >= periodStart && joinedAt <= asOf;
      }).length,
      // The handoff contains no playback event fixture. `null` is deliberate.
      playbackStartsLast30Days: null,
      freeToPlusConversionRate:
        this.data.users.length === 0 ? 0 : activeSubscriptions.length / this.data.users.length,
      monthlyRecurringRevenueHalalas: activeSubscriptions.reduce(
        (sum, subscription) => sum + subscription.priceHalalas,
        0,
      ),
    };
  }

  async readDashboard(): Promise<AdminStudioData> {
    this.requireAdmin('readDashboard');
    return cloneData(this.data);
  }

  async createShow(command: CreateShowCommand): Promise<Show> {
    const operation = 'createShow';
    this.requirePermission(operation, 'shows.manage');
    const slug = requireText(command.slug, 'slug', operation);
    requireText(command.description, 'description', operation);
    if (this.data.shows.some((show) => show.slug === slug)) {
      throw repositoryError('CONFLICT', operation, 'A show with this slug already exists.', {
        slug,
      });
    }

    const show: Show = {
      id: this.nextId('show') as ShowId,
      slug,
      name: requireText(command.name, 'name', operation),
      host: requireText(command.host, 'host', operation),
      category: requireText(command.category, 'category', operation),
      premium: command.premium,
      artworkUrl: command.artworkUrl,
      createdAt: this.now().toISOString(),
    };
    this.data.shows.push(show);
    return { ...show };
  }

  async updateShow(id: ShowId, command: UpdateShowCommand): Promise<Show> {
    const operation = 'updateShow';
    this.requirePermission(operation, 'shows.manage');
    const index = this.data.shows.findIndex((show) => show.id === id);
    if (index < 0) throw repositoryError('NOT_FOUND', operation, 'Show not found.', { id });
    const normalizedSlug = command.slug?.trim();
    if (command.description !== undefined) {
      requireText(command.description, 'description', operation);
    }
    if (
      normalizedSlug !== undefined &&
      this.data.shows.some((show) => show.id !== id && show.slug === normalizedSlug)
    ) {
      throw repositoryError('CONFLICT', operation, 'A show with this slug already exists.', {
        slug: command.slug,
      });
    }

    const current = this.data.shows[index];
    const updated: Show = {
      ...current,
      slug: command.slug === undefined ? current.slug : requireText(command.slug, 'slug', operation),
      name: command.name === undefined ? current.name : requireText(command.name, 'name', operation),
      host: command.host === undefined ? current.host : requireText(command.host, 'host', operation),
      category:
        command.category === undefined
          ? current.category
          : requireText(command.category, 'category', operation),
      premium: command.premium ?? current.premium,
      artworkUrl: command.artworkUrl ?? current.artworkUrl,
    };
    this.data.shows[index] = updated;
    return { ...updated };
  }

  async createEpisode(command: CreateEpisodeCommand): Promise<Episode> {
    const operation = 'createEpisode';
    this.requirePermission(operation, 'episodes.manage');
    if (!this.data.shows.some((show) => show.id === command.showId)) {
      throw repositoryError('VALIDATION', operation, 'The selected show does not exist.', {
        showId: command.showId,
      });
    }
    this.assertEpisodeNumbers(command.episodeNumber, command.durationMinutes, operation);
    const now = this.now().toISOString();
    const episode: Episode = {
      id: this.nextId('episode') as EpisodeId,
      showId: command.showId,
      title: requireText(command.title, 'title', operation),
      notes: command.notes,
      episodeNumber: command.episodeNumber,
      durationMinutes: command.durationMinutes,
      premium: command.premium,
      status: 'draft',
      audioFileName: command.audioUrl ? this.fileNameFromUrl(command.audioUrl) : undefined,
      createdAt: now,
      updatedAt: now,
    };
    this.data.episodes.unshift(episode);
    return { ...episode };
  }

  async updateEpisode(id: EpisodeId, command: UpdateEpisodeCommand): Promise<Episode> {
    const operation = 'updateEpisode';
    this.requirePermission(operation, 'episodes.manage');
    const index = this.data.episodes.findIndex((episode) => episode.id === id);
    if (index < 0) throw repositoryError('NOT_FOUND', operation, 'Episode not found.', { id });
    const current = this.data.episodes[index];
    const episodeNumber = command.episodeNumber ?? current.episodeNumber;
    const durationMinutes = command.durationMinutes ?? current.durationMinutes;
    if (episodeNumber == null || durationMinutes == null) {
      throw repositoryError(
        'VALIDATION',
        operation,
        'Episode number and duration are required by the production API.',
      );
    }
    this.assertEpisodeNumbers(episodeNumber, durationMinutes, operation);

    const updated: Episode = {
      ...current,
      title:
        command.title === undefined ? current.title : requireText(command.title, 'title', operation),
      notes: command.notes ?? current.notes,
      episodeNumber,
      durationMinutes,
      premium: command.premium ?? current.premium,
      audioFileName:
        command.audioUrl === undefined
          ? current.audioFileName
          : this.fileNameFromUrl(command.audioUrl),
      updatedAt: this.now().toISOString(),
    };
    this.data.episodes[index] = updated;
    return { ...updated };
  }

  async transitionEpisode(id: EpisodeId, command: EpisodeStatusCommand): Promise<Episode> {
    const operation = 'transitionEpisode';
    this.requirePermission(operation, 'episodes.manage');
    const index = this.data.episodes.findIndex((episode) => episode.id === id);
    if (index < 0) throw repositoryError('NOT_FOUND', operation, 'Episode not found.', { id });
    const current = this.data.episodes[index];
    if (!canTransitionApiEpisode(current.status, command.status)) {
      throw repositoryError(
        'VALIDATION',
        operation,
        `Illegal episode transition: ${current.status} -> ${command.status}.`,
        { id, from: current.status, to: command.status },
      );
    }
    if (command.status === 'scheduled' && !command.scheduledAt) {
      throw repositoryError(
        'VALIDATION',
        operation,
        'Scheduling an episode requires a scheduledAt timestamp.',
        { id },
      );
    }

    const now = this.now().toISOString();
    const updated: Episode = {
      ...current,
      status: command.status,
      updatedAt: now,
      scheduledAt: command.status === 'scheduled' ? command.scheduledAt : undefined,
      publishedAt:
        command.status === 'published' ? now : command.status === 'archived' ? current.publishedAt : undefined,
      archivedAt: command.status === 'archived' ? now : undefined,
    };
    this.data.episodes[index] = updated;
    return { ...updated };
  }

  async uploadEpisodeAudio(id: EpisodeId, command: EpisodeAudioCommand): Promise<Episode> {
    const operation = 'uploadEpisodeAudio';
    this.requirePermission(operation, 'episodes.manage');
    const index = this.data.episodes.findIndex((episode) => episode.id === id);
    if (index < 0) throw repositoryError('NOT_FOUND', operation, 'Episode not found.', { id });
    const fileName = requireText(command.fileName, 'fileName', operation);
    const updated = {
      ...this.data.episodes[index],
      audioFileName: fileName,
      updatedAt: this.now().toISOString(),
    };
    this.data.episodes[index] = updated;
    return { ...updated };
  }

  async listArticleMedia(): Promise<ArticleMediaAsset[]> {
    this.requirePermission('listArticleMedia', 'articles.view');
    return this.mediaAssets.map((asset) => ({ ...asset }));
  }

  async listArticleAuthors(): Promise<ArticleAuthorCandidate[]> {
    this.requirePermission('listArticleAuthors', 'articles.view');
    return this.data.studioMembers.map((member) => ({
      studioMemberId: member.id,
      displayName: member.name,
    }));
  }

  async uploadArticleImage(command: UploadArticleImageCommand): Promise<ArticleMediaAsset> {
    const operation = 'uploadArticleImage';
    this.requirePermission(operation, 'articles.manage');
    const alt = requireText(command.alt, 'alt', operation);
    if (!['image/jpeg', 'image/png'].includes(command.mimeType)) {
      throw repositoryError('VALIDATION', operation, 'Unsupported image type.');
    }
    if (command.byteSize > 10 * 1024 * 1024) {
      throw repositoryError('VALIDATION', operation, 'Image exceeds 10 MiB.');
    }
    command.onProgress?.(0);
    const publicUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener('load', () => resolve(String(reader.result)));
      reader.addEventListener('error', () => reject(reader.error ?? new Error('Read failed.')));
      reader.readAsDataURL(command.body);
    });
    command.onProgress?.(65);
    const id = `med-${String(++this.sequence).padStart(32, '0')}`;
    const asset: ArticleMediaAsset = {
      id,
      kind: 'image',
      mimeType: command.mimeType,
      fileName: requireText(command.fileName, 'fileName', operation),
      byteSize: command.byteSize,
      width: command.width,
      height: command.height,
      defaultAlt: alt,
      defaultCaption: optionalText(command.caption),
      status: 'ready',
      publicUrl,
      createdAt: this.now().toISOString(),
    };
    this.mediaAssets.unshift(asset);
    command.onProgress?.(100);
    return { ...asset };
  }

  async createArticle(command: CreateArticleCommand): Promise<Article> {
    const operation = 'createArticle';
    this.requirePermission(operation, 'articles.manage');
    const slug = requireText(command.slug, 'slug', operation);
    if (this.data.articles.some((article) => article.slug === slug)) {
      throw repositoryError('CONFLICT', operation, 'An article with this slug already exists.', {
        slug,
      });
    }
    const content = structuredClone(command.content);
    const body = requireText(articleText(content), 'content', operation);
    const now = this.now().toISOString();
    const article: Article = {
      id: this.nextId('article') as ArticleId,
      slug,
      title: requireText(command.title, 'title', operation),
      author: this.resolveArticleAuthor(command.author, operation),
      authorPlacement: command.authorPlacement,
      summary: optionalText(command.excerpt) ?? this.summarize(body),
      excerpt: optionalText(command.excerpt) ?? '',
      coverUrl: optionalText(command.coverUrl),
      coverAlt: optionalText(command.coverAlt),
      content,
      contentHtml: renderArticleNode(content, this.mediaAssets),
      body,
      seo: {
        title: optionalText(command.seo.title),
        description: optionalText(command.seo.description),
        canonicalUrl: optionalText(command.seo.canonicalUrl),
        socialTitle: optionalText(command.seo.socialTitle),
        socialDescription: optionalText(command.seo.socialDescription),
        socialImageUrl: optionalText(command.seo.socialImageUrl),
        noIndex: command.seo.noIndex,
      },
      status: 'draft',
      newsletter: command.newsletter.enabled
        ? {
            enabled: true,
            subject: optionalText(command.newsletter.subject),
            preheader: optionalText(command.newsletter.preheader),
            status: 'draft',
            needsSync: false,
          }
        : { enabled: false, status: 'not_started', needsSync: false },
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.data.articles.unshift(article);
    return { ...article };
  }

  async updateArticle(id: ArticleId, command: UpdateArticleCommand): Promise<Article> {
    const operation = 'updateArticle';
    this.requirePermission(operation, 'articles.manage');
    const index = this.data.articles.findIndex((article) => article.id === id);
    if (index < 0) throw repositoryError('NOT_FOUND', operation, 'Article not found.', { id });
    if (
      command.slug !== undefined &&
      this.data.articles.some(
        (article) => article.id !== id && article.slug === command.slug?.trim(),
      )
    ) {
      throw repositoryError('CONFLICT', operation, 'An article with this slug already exists.', {
        slug: command.slug,
      });
    }
    const current = this.data.articles[index];
    if (current.version !== command.expectedVersion) {
      throw repositoryError('CONFLICT', operation, 'Article version conflict.', {
        id,
        reason: 'ARTICLE_VERSION_CONFLICT',
        expectedVersion: command.expectedVersion,
        actualVersion: current.version,
      });
    }
    if (current.newsletter.status === 'sent' && command.newsletter !== undefined) {
      throw repositoryError(
        'VALIDATION',
        operation,
        'Sent newsletter fields are immutable.',
        { id },
      );
    }
    if (
      (current.newsletter.status === 'syncing' ||
        current.newsletter.status === 'sync_unknown') &&
      command.newsletter !== undefined
    ) {
      throw repositoryError(
        'CONFLICT',
        operation,
        'Newsletter fields are locked while Mailchimp state is unresolved.',
        {
          id,
          reason:
            current.newsletter.status === 'syncing'
              ? 'NEWSLETTER_SYNC_IN_PROGRESS'
              : 'NEWSLETTER_SYNC_UNKNOWN',
        },
      );
    }
    if (
      current.newsletter.campaignId &&
      command.newsletter !== undefined &&
      !command.newsletter.enabled
    ) {
      throw repositoryError('CONFLICT', operation, 'Campaign already exists.', {
        id,
        reason: 'CAMPAIGN_EXISTS',
      });
    }
    const content = command.content ? structuredClone(command.content) : current.content;
    const body = requireText(articleText(content), 'content', operation);
    const version = current.version + 1;
    const newsletter =
      current.newsletter.status === 'sent'
        ? { ...current.newsletter }
        : command.newsletter
          ? command.newsletter.enabled
            ? {
                ...current.newsletter,
                enabled: true,
                subject: optionalText(command.newsletter.subject),
                preheader: optionalText(command.newsletter.preheader),
                status:
                  current.newsletter.status === 'campaign_created'
                    ? ('campaign_created' as const)
                    : ('draft' as const),
                needsSync: Boolean(current.newsletter.campaignId),
              }
            : { enabled: false, status: 'not_started' as const, needsSync: false }
          : {
              ...current.newsletter,
              needsSync: Boolean(current.newsletter.campaignId),
            };
    const updated: Article = {
      ...current,
      slug: command.slug === undefined ? current.slug : requireText(command.slug, 'slug', operation),
      title:
        command.title === undefined ? current.title : requireText(command.title, 'title', operation),
      author:
        command.author === undefined
          ? current.author
          : this.resolveArticleAuthor(command.author, operation),
      authorPlacement: command.authorPlacement ?? current.authorPlacement,
      summary:
        command.excerpt === undefined
          ? current.summary
          : optionalText(command.excerpt) ?? this.summarize(body),
      excerpt:
        command.excerpt === undefined ? current.excerpt : (optionalText(command.excerpt) ?? ''),
      coverUrl:
        command.coverUrl === undefined ? current.coverUrl : optionalText(command.coverUrl),
      coverAlt:
        command.coverAlt === undefined ? current.coverAlt : optionalText(command.coverAlt),
      content,
      contentHtml: renderArticleNode(content, this.mediaAssets),
      body,
      seo: command.seo
        ? {
            title: optionalText(command.seo.title),
            description: optionalText(command.seo.description),
            canonicalUrl: optionalText(command.seo.canonicalUrl),
            socialTitle: optionalText(command.seo.socialTitle),
            socialDescription: optionalText(command.seo.socialDescription),
            socialImageUrl: optionalText(command.seo.socialImageUrl),
            noIndex: command.seo.noIndex,
          }
        : current.seo,
      newsletter,
      version,
      updatedAt: this.now().toISOString(),
    };
    this.data.articles[index] = updated;
    return { ...updated };
  }

  async transitionArticle(
    id: ArticleId,
    status: Article['status'],
    expectedVersion: number,
  ): Promise<Article> {
    const operation = 'transitionArticle';
    this.requirePermission(operation, 'articles.manage');
    const index = this.data.articles.findIndex((article) => article.id === id);
    if (index < 0) throw repositoryError('NOT_FOUND', operation, 'Article not found.', { id });
    const current = this.data.articles[index];
    if (current.version !== expectedVersion) {
      throw repositoryError('CONFLICT', operation, 'Article version conflict.', {
        id,
        reason: 'ARTICLE_VERSION_CONFLICT',
        expectedVersion,
        actualVersion: current.version,
      });
    }
    if (current.status === status) return { ...current };
    const now = this.now().toISOString();
    const updated: Article = {
      ...current,
      status,
      version: current.version + 1,
      newsletter:
        current.newsletter.status === 'sent'
          ? current.newsletter
          : {
              ...current.newsletter,
              needsSync: Boolean(current.newsletter.campaignId),
            },
      updatedAt: now,
      publishedAt: status === 'published' ? (current.publishedAt ?? now) : undefined,
    };
    this.data.articles[index] = updated;
    return { ...updated };
  }

  async getMailchimpCapability(): Promise<MailchimpCapability> {
    this.requirePermission('getMailchimpCapability', 'articles.view');
    return {
      configured: true,
      mode: 'simulation',
      fromName: 'مختلف',
      replyTo: 'hello@mukhtalif.local',
      audienceName: 'جمهور العرض المحلي',
      audienceCount: 24,
      audienceConfirmationToken: 'fixture-audience-confirmation-v1',
    };
  }

  async previewArticleNewsletter(id: ArticleId): Promise<NewsletterPreview> {
    this.requirePermission('previewArticleNewsletter', 'articles.view');
    const article = this.data.articles.find((candidate) => candidate.id === id);
    if (!article) {
      throw repositoryError('NOT_FOUND', 'previewArticleNewsletter', 'Article not found.', { id });
    }
    if (!article.newsletter.enabled || !article.newsletter.subject) {
      throw repositoryError(
        'VALIDATION',
        'previewArticleNewsletter',
        'Newsletter subject is required.',
        { id },
      );
    }
    const byline = `بقلم ${article.author.displayName}`;
    const previewArticleText =
      article.authorPlacement === 'end'
        ? `${article.title}\n\n${article.body}\n\n${byline}`
        : `${article.title}\n${byline}\n\n${article.body}`;
    return {
      subject: article.newsletter.subject,
      preheader: article.newsletter.preheader,
      html: newsletterHtml(article, this.mediaAssets),
      text: `مختلف - معاينة محلية للنشرة الأسبوعية\n\n${previewArticleText}\n\nهذه معاينة تمثيلية محلية. تُدار بيانات الاشتراك وإلغاء الاشتراك عبر Mailchimp عند تفعيل الربط الفعلي.`,
    };
  }

  async syncArticleNewsletterCampaign(
    id: ArticleId,
    expectedVersion: number,
  ): Promise<AdminNewsletterCampaignResult> {
    const operation = 'syncArticleNewsletterCampaign';
    this.requirePermission(operation, 'articles.manage');
    const index = this.data.articles.findIndex((candidate) => candidate.id === id);
    if (index < 0) throw repositoryError('NOT_FOUND', operation, 'Article not found.', { id });
    const current = this.data.articles[index];
    if (current.version !== expectedVersion) {
      throw repositoryError('CONFLICT', operation, 'Article version conflict.', {
        id,
        reason: 'ARTICLE_VERSION_CONFLICT',
        expectedVersion,
        actualVersion: current.version,
      });
    }
    if (current.newsletter.status === 'sent') {
      throw repositoryError('VALIDATION', operation, 'Sent newsletters cannot be changed.', { id });
    }
    if (
      current.newsletter.status === 'syncing' ||
      current.newsletter.status === 'sync_unknown'
    ) {
      throw repositoryError('CONFLICT', operation, 'Newsletter sync state is unresolved.', {
        id,
        reason:
          current.newsletter.status === 'syncing'
            ? 'NEWSLETTER_SYNC_IN_PROGRESS'
            : 'NEWSLETTER_SYNC_UNKNOWN',
      });
    }
    if (!current.newsletter.enabled || !current.newsletter.subject) {
      throw repositoryError('VALIDATION', operation, 'Newsletter subject is required.', { id });
    }
    const updated: Article = {
      ...current,
      newsletter: {
        ...current.newsletter,
        status: 'campaign_created',
        campaignId: current.newsletter.campaignId ?? `fixture-${id}`,
        syncedVersion: current.version,
        needsSync: false,
      },
      updatedAt: this.now().toISOString(),
    };
    this.data.articles[index] = updated;
    return {
      article: { ...updated },
      operation: current.newsletter.campaignId ? 'updated' : 'created',
    };
  }

  async sendArticleNewsletter(
    id: ArticleId,
    audienceConfirmationToken: string,
    expectedVersion: number,
    expectedCampaignId: string,
  ): Promise<AdminNewsletterSendResult> {
    const operation = 'sendArticleNewsletter';
    this.requirePermission(operation, 'articles.manage');
    const index = this.data.articles.findIndex((candidate) => candidate.id === id);
    if (index < 0) throw repositoryError('NOT_FOUND', operation, 'Article not found.', { id });
    const current = this.data.articles[index];
    if (audienceConfirmationToken !== 'fixture-audience-confirmation-v1') {
      throw repositoryError('CONFLICT', operation, 'Audience confirmation changed.', {
        id,
        reason: 'MAILCHIMP_AUDIENCE_CONFIRMATION_MISMATCH',
      });
    }
    if (
      current.version !== expectedVersion ||
      current.newsletter.campaignId !== expectedCampaignId
    ) {
      throw repositoryError('CONFLICT', operation, 'Newsletter confirmation is stale.', {
        id,
        reason: 'NEWSLETTER_CONFIRMATION_STALE',
        expectedVersion,
        actualVersion: current.version,
        expectedCampaignId,
        actualCampaignId: current.newsletter.campaignId,
      });
    }
    if (current.newsletter.status === 'sent') {
      return { article: { ...current }, operation: 'already_sent' };
    }
    if (current.newsletter.status !== 'campaign_created') {
      throw repositoryError('VALIDATION', operation, 'Campaign draft is required.', { id });
    }
    if (current.newsletter.needsSync || current.newsletter.syncedVersion !== current.version) {
      throw repositoryError('CONFLICT', operation, 'Newsletter sync required.', {
        id,
        reason: 'NEWSLETTER_SYNC_REQUIRED',
      });
    }
    const now = this.now().toISOString();
    const updated: Article = {
      ...current,
      newsletter: {
        ...current.newsletter,
        status: 'sent',
        needsSync: false,
        sentAt: now,
      },
      updatedAt: now,
    };
    this.data.articles[index] = updated;
    return { article: { ...updated }, operation: 'sent' };
  }

  async reconcileArticleNewsletter(id: ArticleId): Promise<AdminNewsletterSendResult> {
    const operation = 'reconcileArticleNewsletter';
    this.requirePermission(operation, 'articles.manage');
    const index = this.data.articles.findIndex((candidate) => candidate.id === id);
    if (index < 0) throw repositoryError('NOT_FOUND', operation, 'Article not found.', { id });
    const current = this.data.articles[index];
    if (current.newsletter.status === 'sent') {
      return { article: { ...current }, operation: 'already_sent' };
    }
    if (current.newsletter.status !== 'sending') {
      return { article: { ...current }, operation: 'not_sent' };
    }
    const now = this.now().toISOString();
    const updated: Article = {
      ...current,
      newsletter: {
        ...current.newsletter,
        status: 'sent',
        needsSync: false,
        sentAt: now,
      },
      updatedAt: now,
    };
    this.data.articles[index] = updated;
    return { article: { ...updated }, operation: 'sent' };
  }

  async createSubscription(command: CreateSubscriptionCommand): Promise<Subscription> {
    const operation = 'createSubscription';
    this.requirePermission(operation, 'subscribers.manage');
    if (!this.data.users.some((user) => user.id === command.userId)) {
      throw repositoryError('VALIDATION', operation, 'User not found.', {
        userId: command.userId,
      });
    }
    if (command.planId !== this.data.plusPlan.id) {
      throw repositoryError('VALIDATION', operation, 'Plan not found.', {
        planId: command.planId,
      });
    }
    if (
      this.data.subscriptions.some(
        (subscription) =>
          subscription.userId === command.userId && subscription.status !== 'canceled',
      )
    ) {
      throw repositoryError('CONFLICT', operation, 'User already has a subscription.', {
        userId: command.userId,
      });
    }
    const now = this.now();
    const subscription: Subscription = {
      id: this.nextId('subscription') as SubscriptionId,
      userId: command.userId,
      planId: this.data.plusPlan.id,
      status: 'active',
      priceHalalas: this.data.plusPlan.priceHalalas,
      startedAt: now.toISOString(),
      updatedAt: now.toISOString(),
      renewAt: addOneMonth(now),
    };
    this.data.subscriptions.push(subscription);
    return { ...subscription };
  }

  async transitionSubscription(
    id: SubscriptionId,
    status: Subscription['status'],
  ): Promise<Subscription> {
    const operation = 'transitionSubscription';
    this.requirePermission(operation, 'subscribers.manage');
    const index = this.data.subscriptions.findIndex((subscription) => subscription.id === id);
    if (index < 0) {
      throw repositoryError('NOT_FOUND', operation, 'Subscription not found.', { id });
    }
    const current = this.data.subscriptions[index];
    if (!canTransitionApiSubscription(current.status, status)) {
      throw repositoryError(
        'VALIDATION',
        operation,
        `Illegal subscription transition: ${current.status} -> ${status}.`,
        { id, from: current.status, to: status },
      );
    }
    const now = this.now();
    const updated: Subscription = {
      ...current,
      status,
      updatedAt: now.toISOString(),
      renewAt: status === 'active' ? addOneMonth(now) : current.renewAt,
      paymentFailedAt: status === 'past_due' ? now.toISOString() : undefined,
      canceledAt: status === 'canceled' ? now.toISOString() : undefined,
    };
    this.data.subscriptions[index] = updated;
    return { ...updated };
  }

  async createStudioMember(command: CreateStudioMemberCommand): Promise<StudioMember> {
    const operation = 'createStudioMember';
    const actor = this.requirePermission(operation, 'access.manage');
    const normalized = normalizeCreateStudioMemberCommand(command);
    if (actor.role !== 'admin' && normalized.role === 'admin') {
      throw repositoryError(
        'FORBIDDEN',
        operation,
        'Only administrators can assign the protected role.',
      );
    }
    const selectedRole = this.roles.find((role) => role.id === normalized.role);
    if (!selectedRole) {
      throw repositoryError('VALIDATION', operation, 'The selected role does not exist.', {
        role: normalized.role,
      });
    }
    const duplicate = this.data.studioMembers.some(
      (member) => member.email.trim().toLowerCase() === normalized.email,
    );
    if (duplicate) {
      throw repositoryError(
        'CONFLICT',
        operation,
        'A Studio member with this email already exists.',
        {
        email: normalized.email,
        },
      );
    }

    const created: StudioMember = {
      id: this.nextId('studio_member') as StudioMemberId,
      name: normalized.name,
      email: normalized.email,
      role: normalized.role,
      roleName: selectedRole.name,
      joinedAt: this.now().toISOString(),
    };
    if (this.registerAuthAccount) {
      try {
        this.registerAuthAccount({
          id: created.id,
          name: created.name,
          email: created.email,
          role: created.role,
          locale: normalized.locale,
        });
      } catch {
        throw repositoryError(
          'CONFLICT',
          operation,
          'The fixture authentication account could not be registered.',
          { email: normalized.email },
        );
      }
    }
    this.data.studioMembers.push(created);
    return { ...created };
  }

  async updateStudioMemberRole(
    id: StudioMemberId,
    role: RoleId,
  ): Promise<StudioMember> {
    const operation = 'updateStudioMemberRole';
    const actor = this.requirePermission(operation, 'access.manage');
    if (actor.id === id) {
      throw repositoryError(
        'FORBIDDEN',
        operation,
        'Administrators cannot change their own role.',
        { id },
      );
    }
    const index = this.data.studioMembers.findIndex((member) => member.id === id);
    if (index < 0) {
      throw repositoryError('NOT_FOUND', operation, 'Studio member not found.', { id });
    }
    const current = this.data.studioMembers[index];
    if (actor.role !== 'admin' && (role === 'admin' || current.role === 'admin')) {
      throw repositoryError(
        'FORBIDDEN',
        operation,
        'Only administrators can change protected-role assignments.',
        { id },
      );
    }
    if (current.role === role) return { ...current };
    const selectedRole = this.roles.find((candidate) => candidate.id === role);
    if (!selectedRole) {
      throw repositoryError('VALIDATION', operation, 'The selected role does not exist.', {
        role,
      });
    }
    if (
      current.role === 'admin' &&
      role !== 'admin' &&
      this.data.studioMembers.filter((member) => member.role === 'admin').length <= 1
    ) {
      throw repositoryError(
        'CONFLICT',
        operation,
        'The final administrator cannot be demoted.',
        { id },
      );
    }
    if (this.updateAuthAccountRole) {
      try {
        this.updateAuthAccountRole(current.id, role);
      } catch {
        throw repositoryError(
          'CONFLICT',
          operation,
          'The fixture authentication role could not be synchronized.',
          { id },
        );
      }
    }
    const updated: StudioMember = { ...current, role, roleName: selectedRole.name };
    this.data.studioMembers[index] = updated;
    return { ...updated };
  }

  async createRole(command: CreateRoleCommand): Promise<StudioRole> {
    const operation = 'createRole';
    this.requirePermission(operation, 'access.manage');
    const parsed = createStudioRoleSchema.safeParse(command);
    if (!parsed.success) {
      throw repositoryError('VALIDATION', operation, 'The role command is invalid.', {
        field: String(parsed.error.issues[0]?.path[0] ?? 'command'),
      });
    }
    const name = parsed.data.name.replace(/\s+/g, ' ');
    const { permissions: requestedPermissions } = parsed.data;
    const description = parsed.data.description ?? '';
    if (
      this.roles.some(
        (role) => role.name.trim().toLocaleLowerCase('ar-SA') === name.toLocaleLowerCase('ar-SA'),
      )
    ) {
      throw repositoryError('CONFLICT', operation, 'A role with this name already exists.', {
        name,
      });
    }
    const permissions = this.normalizePermissions(requestedPermissions, operation);
    const now = this.now().toISOString();
    const role: StudioRole = {
      id: this.nextId('role'),
      name,
      description,
      isSystem: false,
      isProtected: false,
      permissions,
      memberCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.roles.push(role);
    this.rolePermissions[role.id] = [...permissions];
    return cloneRole(role);
  }

  async updateRolePermissions(
    role: RoleId,
    permissions: readonly PermissionId[],
  ): Promise<StudioRole> {
    const operation = 'updateRolePermissions';
    this.requirePermission(operation, 'access.manage');
    const roleIndex = this.roles.findIndex((candidate) => candidate.id === role);
    if (roleIndex < 0) {
      throw repositoryError('NOT_FOUND', operation, 'Role not found.', { role });
    }
    if (this.roles[roleIndex].isProtected) {
      throw repositoryError(
        'FORBIDDEN',
        operation,
        'Protected role permissions are immutable.',
        { role },
      );
    }
    const normalized = this.normalizePermissions(permissions, operation);
    this.rolePermissions[role] = normalized;
    const updated: StudioRole = {
      ...this.roles[roleIndex],
      permissions: [...normalized],
      updatedAt: this.now().toISOString(),
    };
    this.roles[roleIndex] = updated;
    return this.roleSnapshot(updated);
  }

  async createGuest(command: CreateGuestCommand = {}): Promise<Guest> {
    this.requirePermission('createGuest', 'guests.manage');
    const now = this.now().toISOString();
    const guest: Guest = {
      id: this.nextId('guest') as GuestId,
      slug: this.nextId('guest-slug'),
      name: command.name?.trim() ?? '',
      role: command.role?.trim() ?? '',
      city: command.city?.trim() ?? '',
      email: command.email?.trim() ?? '',
      bio: command.bio?.trim() ?? '',
      photoUrl: command.photoUrl,
      createdAt: now,
    };
    this.data.guests.push(guest);
    return { ...guest };
  }

  async updateGuest(id: GuestId, command: UpdateGuestCommand): Promise<Guest> {
    const operation = 'updateGuest';
    this.requirePermission(operation, 'guests.manage');
    const index = this.data.guests.findIndex((guest) => guest.id === id);
    if (index < 0) throw repositoryError('NOT_FOUND', operation, 'Guest not found.', { id });
    const current = this.data.guests[index];
    const updated: Guest = {
      ...current,
      name: command.name?.trim() ?? current.name,
      role: command.role?.trim() ?? current.role,
      city: command.city?.trim() ?? current.city,
      email: command.email?.trim() ?? current.email,
      bio: command.bio?.trim() ?? current.bio,
      photoUrl: command.photoUrl ?? current.photoUrl,
    };
    this.data.guests[index] = updated;
    return { ...updated };
  }

  async createGuestSocial(command: CreateGuestSocialCommand): Promise<GuestSocial> {
    const operation = 'createGuestSocial';
    this.requirePermission(operation, 'guests.manage');
    if (!this.data.guests.some((guest) => guest.id === command.guestId)) {
      throw repositoryError('NOT_FOUND', operation, 'Guest not found.', {
        guestId: command.guestId,
      });
    }
    const social: GuestSocial = {
      id: this.nextId('guest_social') as GuestSocialId,
      guestId: command.guestId,
      platform: command.platform,
      handle: command.handle.trim(),
    };
    this.data.guestSocials.push(social);
    return { ...social };
  }

  async updateGuestSocial(
    id: GuestSocialId,
    command: UpdateGuestSocialCommand,
  ): Promise<GuestSocial> {
    const operation = 'updateGuestSocial';
    this.requirePermission(operation, 'guests.manage');
    const index = this.data.guestSocials.findIndex((social) => social.id === id);
    if (index < 0) {
      throw repositoryError('NOT_FOUND', operation, 'Guest social link not found.', { id });
    }
    const updated: GuestSocial = {
      ...this.data.guestSocials[index],
      platform: command.platform ?? this.data.guestSocials[index].platform,
      handle: command.handle?.trim() ?? this.data.guestSocials[index].handle,
    };
    this.data.guestSocials[index] = updated;
    return { ...updated };
  }

  async removeGuestSocial(id: GuestSocialId): Promise<void> {
    const operation = 'removeGuestSocial';
    this.requirePermission(operation, 'guests.manage');
    const index = this.data.guestSocials.findIndex((social) => social.id === id);
    if (index < 0) {
      throw repositoryError('NOT_FOUND', operation, 'Guest social link not found.', { id });
    }
    this.data.guestSocials.splice(index, 1);
  }

  async linkGuestAppearance(guestId: GuestId, episodeId: EpisodeId) {
    const operation = 'linkGuestAppearance';
    this.requirePermission(operation, 'guests.manage');
    if (!this.data.guests.some((guest) => guest.id === guestId)) {
      throw repositoryError('NOT_FOUND', operation, 'Guest not found.', { guestId });
    }
    if (!this.data.episodes.some((episode) => episode.id === episodeId)) {
      throw repositoryError('NOT_FOUND', operation, 'Episode not found.', { episodeId });
    }
    const existing = this.data.guestAppearances.find(
      (appearance) => appearance.guestId === guestId && appearance.episodeId === episodeId,
    );
    if (existing) return { ...existing };
    const appearance = { guestId, episodeId };
    this.data.guestAppearances.push(appearance);
    return { ...appearance };
  }

  async unlinkGuestAppearance(guestId: GuestId, episodeId: EpisodeId): Promise<void> {
    const operation = 'unlinkGuestAppearance';
    this.requirePermission(operation, 'guests.manage');
    const index = this.data.guestAppearances.findIndex(
      (appearance) => appearance.guestId === guestId && appearance.episodeId === episodeId,
    );
    if (index < 0) {
      throw repositoryError('NOT_FOUND', operation, 'Guest appearance not found.', {
        guestId,
        episodeId,
      });
    }
    this.data.guestAppearances.splice(index, 1);
  }

  private requireStudioMember(operation: string): StudioMember {
    if (!this.getAuthenticatedSubject) {
      return (
        this.data.studioMembers.find((member) => member.id === this.data.viewer.id) ?? {
          id: this.data.viewer.id,
          name: this.data.viewer.name,
          email: this.data.viewer.email,
          role: this.data.viewer.role,
          roleName: this.data.viewer.roleName,
          joinedAt: this.data.asOf,
        }
      );
    }

    const subject = this.getAuthenticatedSubject();
    if (!subject) {
      throw repositoryError(
        'UNAUTHENTICATED',
        operation,
        'A fixture login session is required.',
      );
    }
    const normalizedEmail = subject.email.trim().toLowerCase();
    const member = this.data.studioMembers.find(
      (candidate) =>
        candidate.id === subject.id && candidate.email.trim().toLowerCase() === normalizedEmail,
    );
    if (!member) {
      throw repositoryError(
        'FORBIDDEN',
        operation,
        'The signed-in account is not a Studio member.',
        { subjectId: subject.id },
      );
    }
    return member;
  }

  private hasPermission(member: StudioMember, permission: PermissionId): boolean {
    return (this.rolePermissions[member.role] ?? []).includes(permission);
  }

  private requirePermission(operation: string, permission: PermissionId): StudioMember {
    const member = this.requireStudioMember(operation);
    if (!this.hasPermission(member, permission)) {
      throw repositoryError('FORBIDDEN', operation, 'Required permission is missing.', {
        studioMemberId: member.id,
        role: member.role,
        permission,
      });
    }
    return member;
  }

  private requireAnyPermission(
    operation: string,
    permissions: readonly PermissionId[],
  ): StudioMember {
    const member = this.requireStudioMember(operation);
    if (!permissions.some((permission) => this.hasPermission(member, permission))) {
      throw repositoryError('FORBIDDEN', operation, 'Studio access is required.', {
        studioMemberId: member.id,
        role: member.role,
        permissions,
      });
    }
    return member;
  }

  private requireAdmin(operation: string): StudioMember {
    const member = this.requireStudioMember(operation);
    if (member.role !== 'admin') {
      throw repositoryError('FORBIDDEN', operation, 'Administrator access is required.', {
        studioMemberId: member.id,
        role: member.role,
      });
    }
    return member;
  }

  private roleName(roleId: RoleId): string {
    return this.roles.find((role) => role.id === roleId)?.name ?? roleId;
  }

  private roleSnapshot(role: StudioRole): StudioRole {
    return {
      ...cloneRole(role),
      permissions: [...(this.rolePermissions[role.id] ?? role.permissions)],
      memberCount: this.data.studioMembers.filter((member) => member.role === role.id).length,
    };
  }

  private normalizePermissions(
    permissions: readonly PermissionId[],
    operation: string,
  ): PermissionId[] {
    if (!permissions.every((permission) => isPermissionId(permission))) {
      throw repositoryError('VALIDATION', operation, 'Unknown permission identifier.');
    }
    if (new Set(permissions).size !== permissions.length) {
      throw repositoryError('VALIDATION', operation, 'Permission identifiers must be unique.');
    }
    const permissionSet = new Set<PermissionId>(permissions);
    const hasManageWithoutView = permissions.some(
      (permission) =>
        permission.endsWith('.manage') &&
        !permissionSet.has(permission.replace(/\.manage$/, '.view') as PermissionId),
    );
    if (hasManageWithoutView) {
      throw repositoryError(
        'VALIDATION',
        operation,
        'Management permission requires the matching view permission.',
      );
    }
    return PERMISSION_IDS.filter((permission) => permissionSet.has(permission));
  }

  private nextId(prefix: string): string {
    this.sequence += 1;
    return `${prefix}_fixture_${this.now().getTime()}_${this.sequence}`;
  }

  private assertEpisodeNumbers(
    episodeNumber: number,
    durationMinutes: number,
    operation: string,
  ): void {
    if (!Number.isInteger(episodeNumber) || episodeNumber <= 0) {
      throw repositoryError(
        'VALIDATION',
        operation,
        'episodeNumber must be a positive integer.',
        { episodeNumber },
      );
    }
    if (!Number.isFinite(durationMinutes) || durationMinutes < 0) {
      throw repositoryError(
        'VALIDATION',
        operation,
        'durationMinutes must be a non-negative number.',
        { durationMinutes },
      );
    }
  }

  private summarize(body: string): string {
    const normalized = body.replace(/\s+/g, ' ').trim();
    return normalized.length <= 180 ? normalized : `${normalized.slice(0, 177).trimEnd()}…`;
  }

  private resolveArticleAuthor(
    author: CreateArticleCommand['author'],
    operation: string,
  ): ArticleAuthor {
    if (author.type === 'custom') {
      const displayName = requireText(author.displayName, 'author.displayName', operation);
      if (displayName.length < 2 || displayName.length > 100) {
        throw repositoryError(
          'VALIDATION',
          operation,
          'Custom author display name must contain 2 to 100 characters.',
          { field: 'author.displayName' },
        );
      }
      return { type: 'custom', displayName };
    }

    const member = this.data.studioMembers.find(
      (candidate) => candidate.id === author.studioMemberId,
    );
    if (!member) {
      throw repositoryError('VALIDATION', operation, 'Article author is not a Studio member.', {
        field: 'author.studioMemberId',
      });
    }
    return {
      type: 'studio_member',
      studioMemberId: member.id,
      displayName: member.name,
    };
  }

  private fileNameFromUrl(url: string): string | undefined {
    try {
      const path = new URL(url).pathname;
      return decodeURIComponent(path.split('/').filter(Boolean).at(-1) ?? '') || undefined;
    } catch {
      return undefined;
    }
  }
}

export function createFixtureAdminRepository(
  options?: FixtureAdminRepositoryOptions,
): AdminRepository {
  return new FixtureAdminRepository(options);
}
