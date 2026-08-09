import { z } from 'zod';

export const followSchema = z.object({
  showId: z.string().min(1),
});
export type FollowInput = z.infer<typeof followSchema>;

export const upsertProgressSchema = z.object({
  episodeId: z.string().min(1),
  positionSec: z.number().int().nonnegative(),
});
export type UpsertProgressInput = z.infer<typeof upsertProgressSchema>;
