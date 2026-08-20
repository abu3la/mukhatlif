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

/**
 * Initial password for an accepted Studio invitation.
 *
 * The floor is deliberately length-first rather than a composition rule: a long
 * passphrase resists guessing better than a short string forced to contain a
 * symbol. The upper bound matches the bcrypt-safe input length so a truncated
 * password can never be silently accepted.
 */
export const studioInvitationPasswordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(72, 'Password must be at most 72 characters')
  .refine((value) => value.trim().length >= 12, 'Password must not be only whitespace');

export const acceptStudioInvitationSchema = z
  .object({ password: studioInvitationPasswordSchema })
  .strict();
export type AcceptStudioInvitationInput = z.infer<typeof acceptStudioInvitationSchema>;
