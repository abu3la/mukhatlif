import { z } from 'zod';

export const slugSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase letters, digits, and hyphens');

export const createShowSchema = z.object({
  slug: slugSchema,
  titleAr: z.string().min(1),
  titleEn: z.string().min(1).optional(),
  descriptionAr: z.string().min(1),
  descriptionEn: z.string().min(1).optional(),
  hostName: z.string().min(1),
  artworkUrl: z.string().url().optional(),
  category: z.string().min(1),
  premium: z.boolean().default(false),
});
export type CreateShowInput = z.infer<typeof createShowSchema>;

export const updateShowSchema = createShowSchema.partial();
export type UpdateShowInput = z.infer<typeof updateShowSchema>;
