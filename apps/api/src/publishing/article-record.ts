import {
  DEFAULT_ARTICLE_AUTHOR_PLACEMENT,
  type Article,
  type ArticleAuthor,
} from '@mukhtalif/types';
import type { CreateArticleInput, UpdateArticleInput } from '@mukhtalif/validation';
import { renderRichText, richTextToPlainText } from './rich-text';

export type ResolvedCreateArticleInput = Omit<CreateArticleInput, 'author'> & {
  author: ArticleAuthor;
};

export type ResolvedUpdateArticleInput = Omit<UpdateArticleInput, 'author'> & {
  author?: ArticleAuthor;
};

export class ArticleMutationError extends Error {
  constructor(
    public readonly code:
      | 'COVER_ALT_REQUIRED'
      | 'NEWSLETTER_SENT'
      | 'NEWSLETTER_BUSY'
      | 'NEWSLETTER_SYNC_UNKNOWN'
      | 'CAMPAIGN_EXISTS',
  ) {
    super(code);
    this.name = 'ArticleMutationError';
  }
}

function optional<T>(value: T | null | undefined): T | undefined {
  return value ?? undefined;
}

function newsletterNeedsSync(article: Article): boolean {
  return (
    article.newsletter.status !== 'sent' &&
    (article.newsletter.status === 'sync_unknown' ||
      (Boolean(article.newsletter.campaignId) &&
        article.newsletter.syncedVersion !== article.version))
  );
}

export function createArticleRecord(
  id: string,
  input: ResolvedCreateArticleInput,
  timestamp: string,
): Article {
  const newsletterEnabled = input.newsletter?.enabled ?? false;
  const article: Article = {
    id,
    slug: input.slug,
    titleAr: input.titleAr,
    titleEn: input.titleEn,
    author: input.author,
    authorPlacement: input.authorPlacement ?? DEFAULT_ARTICLE_AUTHOR_PLACEMENT,
    excerptAr: input.excerptAr,
    coverUrl: input.coverUrl,
    coverAlt: input.coverAlt,
    content: input.content,
    contentHtml: renderRichText(input.content),
    bodyAr: richTextToPlainText(input.content),
    seo: {
      title: input.seo?.title,
      description: input.seo?.description,
      canonicalUrl: input.seo?.canonicalUrl,
      socialTitle: input.seo?.socialTitle,
      socialDescription: input.seo?.socialDescription,
      socialImageUrl: input.seo?.socialImageUrl,
      noIndex: input.seo?.noIndex ?? false,
    },
    status: 'draft',
    newsletter: {
      enabled: newsletterEnabled,
      subject: input.newsletter?.subject,
      preheader: input.newsletter?.preheader,
      status: newsletterEnabled ? 'draft' : 'not_started',
      needsSync: false,
    },
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return article;
}

export function mergeArticleUpdate(
  current: Article,
  input: ResolvedUpdateArticleInput,
  timestamp: string,
): Article {
  if (current.newsletter.status === 'sent' && input.newsletter) {
    throw new ArticleMutationError('NEWSLETTER_SENT');
  }
  if (['syncing', 'sending'].includes(current.newsletter.status) && input.newsletter) {
    throw new ArticleMutationError('NEWSLETTER_BUSY');
  }
  if (current.newsletter.status === 'sync_unknown' && input.newsletter) {
    throw new ArticleMutationError('NEWSLETTER_SYNC_UNKNOWN');
  }
  if (
    current.newsletter.campaignId &&
    input.newsletter?.enabled === false &&
    current.newsletter.enabled
  ) {
    throw new ArticleMutationError('CAMPAIGN_EXISTS');
  }

  const coverUrl = input.coverUrl !== undefined ? optional(input.coverUrl) : current.coverUrl;
  const coverAlt = input.coverAlt !== undefined ? optional(input.coverAlt) : current.coverAlt;
  if (coverUrl && !coverAlt) throw new ArticleMutationError('COVER_ALT_REQUIRED');

  const version = current.version + 1;
  const newsletterEnabled = input.newsletter?.enabled ?? current.newsletter.enabled;
  let newsletterStatus = current.newsletter.status;
  if (
    !current.newsletter.campaignId &&
    ['not_started', 'draft'].includes(current.newsletter.status)
  ) {
    newsletterStatus = newsletterEnabled ? 'draft' : 'not_started';
  }

  const article: Article = {
    ...current,
    slug: input.slug ?? current.slug,
    titleAr: input.titleAr ?? current.titleAr,
    titleEn: input.titleEn !== undefined ? optional(input.titleEn) : current.titleEn,
    author: input.author ?? current.author,
    authorPlacement: input.authorPlacement ?? current.authorPlacement,
    excerptAr: input.excerptAr !== undefined ? optional(input.excerptAr) : current.excerptAr,
    coverUrl,
    coverAlt,
    content: input.content ?? current.content,
    contentHtml: input.content ? renderRichText(input.content) : current.contentHtml,
    bodyAr: input.content ? richTextToPlainText(input.content) : current.bodyAr,
    seo: {
      title: input.seo?.title !== undefined ? optional(input.seo.title) : current.seo.title,
      description:
        input.seo?.description !== undefined
          ? optional(input.seo.description)
          : current.seo.description,
      canonicalUrl:
        input.seo?.canonicalUrl !== undefined
          ? optional(input.seo.canonicalUrl)
          : current.seo.canonicalUrl,
      socialTitle:
        input.seo?.socialTitle !== undefined
          ? optional(input.seo.socialTitle)
          : current.seo.socialTitle,
      socialDescription:
        input.seo?.socialDescription !== undefined
          ? optional(input.seo.socialDescription)
          : current.seo.socialDescription,
      socialImageUrl:
        input.seo?.socialImageUrl !== undefined
          ? optional(input.seo.socialImageUrl)
          : current.seo.socialImageUrl,
      noIndex: input.seo?.noIndex ?? current.seo.noIndex,
    },
    newsletter: {
      ...current.newsletter,
      enabled: newsletterEnabled,
      subject:
        input.newsletter?.subject !== undefined
          ? optional(input.newsletter.subject)
          : current.newsletter.subject,
      preheader:
        input.newsletter?.preheader !== undefined
          ? optional(input.newsletter.preheader)
          : current.newsletter.preheader,
      status: newsletterStatus,
      needsSync: false,
    },
    version,
    updatedAt: timestamp,
  };
  article.newsletter.needsSync = newsletterNeedsSync(article);
  return article;
}

export function refreshNeedsSync(article: Article): Article {
  return {
    ...article,
    newsletter: { ...article.newsletter, needsSync: newsletterNeedsSync(article) },
  };
}
