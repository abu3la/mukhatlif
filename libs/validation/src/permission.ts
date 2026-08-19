import { z } from 'zod';
import { PERMISSION_IDS, type PermissionId } from '@mukhtalif/types';

export const permissionIdSchema = z.enum(PERMISSION_IDS);

export const rolePermissionsSchema = z
  .array(permissionIdSchema)
  .max(PERMISSION_IDS.length)
  .superRefine((permissions, context) => {
    const seen = new Set<string>();
    for (const [index, permission] of permissions.entries()) {
      if (seen.has(permission)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Permission IDs must be unique',
          path: [index],
        });
      }
      seen.add(permission);

      if (permission.endsWith('.manage')) {
        const viewPermission = permission.replace(/\.manage$/, '.view') as PermissionId;
        if (!permissions.includes(viewPermission)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${permission} requires ${viewPermission}`,
            path: [index],
          });
        }
      }
    }
  });

export const updateRolePermissionsSchema = z
  .object({ permissions: rolePermissionsSchema })
  .strict();

export type UpdateRolePermissionsInput = z.infer<typeof updateRolePermissionsSchema>;
