export const ARTICLE_STATUSES = ['draft', 'published'] as const;
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number];

export const ARTICLE_AUTHOR_TYPES = ['studio_member', 'custom'] as const;
export type ArticleAuthorType = (typeof ARTICLE_AUTHOR_TYPES)[number];

export const ARTICLE_AUTHOR_PLACEMENTS = ['after_title', 'end'] as const;
export type ArticleAuthorPlacement = (typeof ARTICLE_AUTHOR_PLACEMENTS)[number];
export const DEFAULT_ARTICLE_AUTHOR_PLACEMENT: ArticleAuthorPlacement = 'after_title';

/**
 * Persisted attribution snapshot. Studio display names are resolved by the
 * API from the private member directory and are never trusted from clients.
 */
export type ArticleAuthor =
  | {
      type: 'studio_member';
      studioMemberId: string;
      displayName: string;
    }
  | {
      type: 'custom';
      displayName: string;
    };

/** Minimal Studio projection safe for article editors with articles.view. */
export interface ArticleAuthorCandidate {
  studioMemberId: string;
  displayName: string;
}

/** Public attribution never exposes Studio identity or source metadata. */
export interface PublishedArticleAuthor {
  displayName: string;
}

export const ARTICLE_IMAGE_PRESENTATIONS = ['content', 'wide'] as const;
export type ArticleImagePresentation = (typeof ARTICLE_IMAGE_PRESENTATIONS)[number];

export const ARTICLE_IMAGE_ALIGNMENTS = ['start', 'center', 'end'] as const;
export type ArticleImageAlignment = (typeof ARTICLE_IMAGE_ALIGNMENTS)[number];

export const ARTICLE_IMAGE_RADII = ['none', 'soft', 'round'] as const;
export type ArticleImageRadius = (typeof ARTICLE_IMAGE_RADII)[number];

/**
 * Internal ad-slot formats. The document stores a placement reference only;
 * executable markup, third-party URLs, and campaign payloads never enter the article body.
 */
export const ARTICLE_AD_FORMATS = ['inline', 'banner'] as const;
export type ArticleAdFormat = (typeof ARTICLE_AD_FORMATS)[number];

export interface ArticleAdBlockAttributes {
  placementId: string;
  format: ArticleAdFormat;
  /** Studio-facing name that helps editors distinguish placements. */
  label?: string;
}

export interface ArticleImageGalleryItem {
  mediaId: string;
  alt: string;
}

export interface ArticleImageGalleryAttributes {
  items: ArticleImageGalleryItem[];
  caption?: string;
}

export const ARTICLE_TEXT_ALIGNMENTS = ['start', 'center', 'end', 'justify'] as const;
export type ArticleTextAlignment = (typeof ARTICLE_TEXT_ALIGNMENTS)[number];

export const ARTICLE_TEXT_DIRECTIONS = ['rtl', 'ltr'] as const;
export type ArticleTextDirection = (typeof ARTICLE_TEXT_DIRECTIONS)[number];

export const ARTICLE_TEXT_VERTICAL_ALIGNMENTS = ['top', 'middle', 'bottom'] as const;
export type ArticleTextVerticalAlignment = (typeof ARTICLE_TEXT_VERTICAL_ALIGNMENTS)[number];

export const ARTICLE_TEXT_SECTION_HEIGHTS = ['auto', 'short', 'medium', 'tall'] as const;
export type ArticleTextSectionHeight = (typeof ARTICLE_TEXT_SECTION_HEIGHTS)[number];

export const RICH_TEXT_NODE_TYPES = [
  'doc',
  'paragraph',
  'heading',
  'text',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'hardBreak',
  'textSection',
  'imageBlock',
  'imageGallery',
  'videoEmbed',
  'adBlock',
] as const;
export type RichTextNodeType = (typeof RICH_TEXT_NODE_TYPES)[number];

export const RICH_TEXT_MARK_TYPES = ['bold', 'italic', 'link'] as const;
export type RichTextMarkType = (typeof RICH_TEXT_MARK_TYPES)[number];

export interface RichTextMark {
  type: RichTextMarkType;
  attrs?: {
    href?: string;
    target?: '_blank' | null;
    rel?: string | null;
  };
}

/**
 * Safe subset of Tiptap/ProseMirror JSON supported by the publishing service.
 * The API validates and renders this document; client-supplied HTML is never canonical.
 */
export interface RichTextNode {
  type: RichTextNodeType;
  attrs?: {
    level?: 2 | 3;
    start?: number;
    /** Ordered-list marker type emitted by Tiptap; rendered only from a safe allowlist. */
    type?: string | null;
    mediaId?: string;
    posterMediaId?: string;
    items?: ArticleImageGalleryItem[];
    alt?: string;
    caption?: string;
    linkUrl?: string;
    presentation?: ArticleImagePresentation;
    alignment?: ArticleTextAlignment;
    radius?: ArticleImageRadius;
    direction?: ArticleTextDirection;
    vertical?: ArticleTextVerticalAlignment;
    height?: ArticleTextSectionHeight;
    provider?: 'youtube' | 'vimeo';
    videoId?: string;
    title?: string;
    placementId?: string;
    format?: ArticleAdFormat;
    label?: string;
  };
  marks?: RichTextMark[];
  text?: string;
  content?: RichTextNode[];
}

export interface RichTextDocument extends RichTextNode {
  type: 'doc';
}

/** Strict top-level atom contract used by Tiptap gallery extensions. */
export interface RichTextImageGalleryNode {
  type: 'imageGallery';
  attrs: ArticleImageGalleryAttributes;
  marks?: never;
  text?: never;
  content?: never;
}

/** Strict top-level atom contract for an internal, non-executable ad placement. */
export interface RichTextAdBlockNode {
  type: 'adBlock';
  attrs: ArticleAdBlockAttributes;
  marks?: never;
  text?: never;
  content?: never;
}

export interface ArticleSeo {
  title?: string;
  description?: string;
  canonicalUrl?: string;
  socialTitle?: string;
  socialDescription?: string;
  socialImageUrl?: string;
  noIndex: boolean;
}

export const NEWSLETTER_STATUSES = [
  'not_started',
  'draft',
  'syncing',
  'sync_unknown',
  'campaign_created',
  'sending',
  'sent',
] as const;
export type NewsletterStatus = (typeof NEWSLETTER_STATUSES)[number];

export interface ArticleNewsletter {
  enabled: boolean;
  subject?: string;
  preheader?: string;
  status: NewsletterStatus;
  /** Mailchimp campaign identifier. Safe to expose; never contains credentials. */
  campaignId?: string;
  /** Article revision last copied to this Mailchimp campaign. */
  syncedVersion?: number;
  /** True when the current article differs from the last successful Mailchimp sync. */
  needsSync: boolean;
  /** Internal lease timestamp for crash-safe Mailchimp synchronization. */
  syncStartedAt?: string;
  /** ISO timestamp recorded after Mailchimp reports the campaign as sent. */
  sentAt?: string;
}

export interface Article {
  id: string;
  slug: string;
  titleAr: string;
  titleEn?: string;
  author: ArticleAuthor;
  authorPlacement: ArticleAuthorPlacement;
  excerptAr?: string;
  coverUrl?: string;
  coverAlt?: string;
  /** Canonical editor document. */
  content: RichTextDocument;
  /** Safe HTML rendered by the API from `content`. */
  contentHtml: string;
  /** Plain-text representation retained for search and legacy readers. */
  bodyAr: string;
  seo: ArticleSeo;
  /** Web publication state. Newsletter delivery is tracked independently. */
  status: ArticleStatus;
  publishedAt?: string;
  newsletter: ArticleNewsletter;
  /** Monotonic Studio revision used to prevent stale newsletter delivery. */
  version: number;
  /** ISO timestamp */
  createdAt: string;
  /** ISO timestamp */
  updatedAt: string;
}

/** Published web projection. Editor source and delivery metadata remain Studio-only. */
export type PublishedArticle = Pick<
  Article,
  | 'id'
  | 'slug'
  | 'titleAr'
  | 'titleEn'
  | 'authorPlacement'
  | 'excerptAr'
  | 'coverUrl'
  | 'coverAlt'
  | 'contentHtml'
  | 'bodyAr'
  | 'seo'
  | 'status'
  | 'publishedAt'
  | 'createdAt'
  | 'updatedAt'
> & {
  author: PublishedArticleAuthor;
};

export interface MailchimpCapability {
  mode: 'live' | 'simulation';
  configured: boolean;
  fromName?: string;
  replyTo?: string;
  /** Full Mailchimp audience metadata, shown separately from the send target. */
  audienceName?: string;
  audienceCount?: number;
  /** Verified static Mailchimp tag that is the only permitted send target. */
  recipientTag?: string;
  /** Active subscribers currently included in the verified send target. */
  recipientCount?: number;
  /** Opaque server-signed binding to the currently verified audience and target. */
  audienceConfirmationToken?: string;
}

export interface NewsletterPreview {
  subject: string;
  preheader?: string;
  html: string;
  text: string;
}

export interface NewsletterCampaignResult {
  article: Article;
  operation: 'created' | 'updated';
}

export interface NewsletterSendResult {
  article: Article;
  operation: 'accepted' | 'sent' | 'already_sent' | 'not_sent';
}

/**
 * Listing projection for the public site. It deliberately omits `contentHtml`
 * and `bodyAr` so an index page does not transfer every article's full body.
 */
export type PublishedArticleSummary = Pick<
  PublishedArticle,
  'id' | 'slug' | 'titleAr' | 'titleEn' | 'excerptAr' | 'coverUrl' | 'coverAlt' | 'publishedAt'
> & {
  author: PublishedArticleAuthor;
};
