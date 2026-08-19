import { z } from 'zod';
import { type UserLocale } from '@mukhtalif/types';
import { roleIdSchema } from './role';

/** Only a Studio role may cross the membership mutation boundary. */
export const updateStudioMemberRoleSchema = z
  .object({
    role: roleIdSchema,
  })
  .strict();

const studioMemberLocaleSchema = z.enum(['ar', 'en'] satisfies [
  UserLocale,
  ...UserLocale[],
]);

/**
 * Server-side Studio invitation contract. Passwords, Auth UUIDs, and app-user
 * identifiers are never accepted from the administration client.
 */
export const inviteStudioMemberSchema = z
  .object({
    displayName: z.string().trim().min(2).max(100),
    email: z.string().trim().toLowerCase().email().max(254),
    role: roleIdSchema,
    locale: studioMemberLocaleSchema,
  })
  .strict();

export type UpdateStudioMemberRoleInput = z.infer<typeof updateStudioMemberRoleSchema>;
export type InviteStudioMemberInput = z.infer<typeof inviteStudioMemberSchema>;
