import { z } from 'zod';
import { SOCIAL_PLATFORMS } from '@mukhtalif/types';
import { slugSchema } from './show';

export const socialPlatformSchema = z.enum(SOCIAL_PLATFORMS);

const editorialText = (max: number) => z.string().trim().max(max);

/**
 * A guest is created empty from the Studio and completed later, so every field
 * is optional here. Absent fields become empty strings, never null, which keeps
 * the stored record shape identical whether it was created blank or complete.
 */
export const createGuestSchema = z
  .object({
    slug: slugSchema.optional(),
    name: editorialText(160).optional(),
    role: editorialText(160).optional(),
    city: editorialText(120).optional(),
    email: z.union([z.string().trim().email().max(254), z.literal('')]).optional(),
    bio: editorialText(4000).optional(),
    photoUrl: z.string().url().max(2048).optional(),
  })
  .strict();
export type CreateGuestInput = z.infer<typeof createGuestSchema>;

/** Slug is server-owned after creation and cannot be rewritten by an update. */
export const updateGuestSchema = createGuestSchema.omit({ slug: true }).strict();
export type UpdateGuestInput = z.infer<typeof updateGuestSchema>;

/**
 * Handles are stored verbatim as the editor typed them. Rendering decides how
 * to turn a handle into a link, so no scheme or host is accepted here.
 */
export const createGuestSocialSchema = z
  .object({
    platform: socialPlatformSchema,
    handle: z.string().trim().min(1).max(200),
  })
  .strict();
export type CreateGuestSocialInput = z.infer<typeof createGuestSocialSchema>;

export const updateGuestSocialSchema = createGuestSocialSchema.partial().strict();
export type UpdateGuestSocialInput = z.infer<typeof updateGuestSocialSchema>;

export const guestAppearanceSchema = z.object({ episodeId: z.string().min(1).max(64) }).strict();
export type GuestAppearanceInput = z.infer<typeof guestAppearanceSchema>;
