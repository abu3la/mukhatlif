import { z } from 'zod';

const contentId = z.string().trim().min(1).max(160);
const displayName = z.string().trim().min(1).max(100);
const uniqueIds = z
  .array(contentId)
  .max(200)
  .refine((ids) => new Set(ids).size === ids.length, 'Duplicate episodes are not allowed');
const birthDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value &&
      value >= '1900-01-01' &&
      value <= new Date().toISOString().slice(0, 10)
    );
  }, 'Enter a valid date of birth');

export const provisionCustomerSchema = z
  .object({
    displayName,
    locale: z.enum(['ar', 'en']).default('ar'),
  })
  .strict();
export type ProvisionCustomerInput = z.infer<typeof provisionCustomerSchema>;

export const updateCustomerProfileSchema = z
  .object({
    displayName: displayName.optional(),
    locale: z.enum(['ar', 'en']).optional(),
    gender: z.enum(['male', 'female', 'prefer_not_to_say']).nullable().optional(),
    birthDate: birthDate.nullable().optional(),
    interests: z
      .array(z.string().trim().min(1).max(60))
      .max(20)
      .transform((values) => [...new Set(values)])
      .optional(),
    onboarded: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'No changes supplied');
export type UpdateCustomerProfileInput = z.infer<typeof updateCustomerProfileSchema>;

export const createCustomerPlaylistSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().max(1000).default(''),
  })
  .strict();
export const updateCustomerPlaylistSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(1000).optional(),
    episodeIds: uniqueIds.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'No changes supplied');
export const createCustomerBookmarkSchema = z
  .object({
    episodeId: contentId,
    positionSec: z.number().int().min(0).max(604800),
    label: z.string().trim().max(300).default(''),
  })
  .strict();
export const updateCustomerBookmarkSchema = z
  .object({
    label: z.string().trim().max(300),
  })
  .strict();
export const updateCustomerQueueSchema = z.object({ episodeIds: uniqueIds }).strict();

export const customerLibraryDocumentSchema = z
  .object({
    savedEpisodeIds: z.array(contentId).max(2000),
    savedArticleIds: z.array(contentId).max(2000),
    playlists: z
      .array(
        z
          .object({
            id: contentId,
            name: z.string().min(1).max(100),
            description: z.string().max(1000),
            episodeIds: uniqueIds,
            createdAt: z.string().datetime(),
            updatedAt: z.string().datetime(),
          })
          .strict(),
      )
      .max(100),
    bookmarks: z
      .array(
        z
          .object({
            id: contentId,
            episodeId: contentId,
            positionSec: z.number().int().min(0).max(604800),
            label: z.string().max(300),
            createdAt: z.string().datetime(),
          })
          .strict(),
      )
      .max(2000),
    queueEpisodeIds: uniqueIds,
  })
  .strict();
