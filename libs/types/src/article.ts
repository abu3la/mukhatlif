export const ARTICLE_STATUSES = ['draft', 'published'] as const;
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number];

export interface Article {
  id: string;
  slug: string;
  titleAr: string;
  titleEn?: string;
  bodyAr: string;
  coverUrl?: string;
  status: ArticleStatus;
  /** ISO timestamp, set when the article is first published. */
  publishedAt?: string;
  /** ISO timestamp */
  createdAt: string;
}
