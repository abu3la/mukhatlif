import { z } from 'zod';
import { EPISODE_STATUSES } from '@mukhtalif/types';

export const episodeStatusSchema = z.enum(EPISODE_STATUSES);

/** Status is server-assigned: every episode starts life as a draft. */
export const createEpisodeSchema = z.object({
  showId: z.string().min(1),
  titleAr: z.string().min(1),
  titleEn: z.string().min(1).optional(),
  showNotesAr: z.string().default(''),
  showNotesEn: z.string().optional(),
  audioUrl: z.string().url().optional(),
  youtubeVideoId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{11}$/)
    .nullable()
    .optional(),
  durationSec: z.number().int().nonnegative(),
  episodeNumber: z.number().int().positive(),
  premium: z.boolean().default(false),
});
export type CreateEpisodeInput = z.infer<typeof createEpisodeSchema>;

export const updateEpisodeSchema = createEpisodeSchema.partial().omit({ showId: true });
export type UpdateEpisodeInput = z.infer<typeof updateEpisodeSchema>;

export const updateEpisodeStatusSchema = z.object({
  status: episodeStatusSchema,
  /** Required when moving to `scheduled`; the API enforces this with a 422. */
  publishAt: z.string().datetime({ offset: true }).optional(),
});
export type UpdateEpisodeStatusInput = z.infer<typeof updateEpisodeStatusSchema>;
