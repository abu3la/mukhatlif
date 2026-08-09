import { z } from 'zod';
import { ARTICLE_STATUSES } from '@mukhtalif/types';
import { slugSchema } from './show';

export const articleStatusSchema = z.enum(ARTICLE_STATUSES);

export const createArticleSchema = z.object({
  slug: slugSchema,
  titleAr: z.string().min(1),
  titleEn: z.string().min(1).optional(),
  bodyAr: z.string().min(1),
  coverUrl: z.string().url().optional(),
});
export type CreateArticleInput = z.infer<typeof createArticleSchema>;

export const updateArticleSchema = createArticleSchema.partial();
export type UpdateArticleInput = z.infer<typeof updateArticleSchema>;

export const updateArticleStatusSchema = z.object({
  status: articleStatusSchema,
});
export type UpdateArticleStatusInput = z.infer<typeof updateArticleStatusSchema>;
