import { z } from 'zod';
import type { StudioRole } from '@mukhtalif/types';
import { rolePermissionsSchema } from './permission';

/** IDs are server-owned slugs or UUID-like values and are always path-safe. */
export const roleIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9_-]*$/i, 'Invalid role ID');

export const studioRoleParamsSchema = z.object({ roleId: roleIdSchema }).strict();

export const createStudioRoleSchema = z
  .object({
    name: z.string().trim().min(2).max(60),
    description: z.string().trim().max(240).optional(),
    permissions: rolePermissionsSchema,
  })
  .strict();

/** Runtime response contract shared by GET /roles and GET /roles/:roleId. */
export const studioRoleSchema: z.ZodType<StudioRole> = z
  .object({
    id: roleIdSchema,
    name: z.string().min(2).max(60),
    description: z.string().max(240),
    isSystem: z.boolean(),
    isProtected: z.boolean(),
    permissions: rolePermissionsSchema,
    memberCount: z.number().int().nonnegative(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const studioRoleListSchema = z.array(studioRoleSchema);

export type CreateStudioRoleInput = z.infer<typeof createStudioRoleSchema>;
export type StudioRoleParams = z.infer<typeof studioRoleParamsSchema>;
