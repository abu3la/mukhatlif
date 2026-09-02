import { z } from 'zod';

export const updateHomepageWeeklyEpisodesSettingsSchema = z
  .object({
    enabled: z.boolean(),
    title: z.string().trim().min(1).max(80),
    expectedVersion: z.number().int().min(1),
  })
  .strict();

export type UpdateHomepageWeeklyEpisodesSettingsInput = z.infer<
  typeof updateHomepageWeeklyEpisodesSettingsSchema
>;
