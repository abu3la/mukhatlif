import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { studioRoleParamsSchema, updateRolePermissionsSchema } from '@mukhtalif/validation';
import { requirePermission, type AppEnv } from '../auth';
import { getRepository } from '../repo';

export const permissionsRoute = new Hono<AppEnv>()
  .get('/', requirePermission('access.view'), async (c) => {
    return c.json(await getRepository(c.env).getRolePermissionMatrix());
  })
  .put(
    '/:roleId',
    requirePermission('access.manage'),
    zValidator('param', studioRoleParamsSchema),
    zValidator('json', updateRolePermissionsSchema),
    async (c) => {
      const { roleId } = c.req.valid('param');
      const { permissions } = c.req.valid('json');

      const result = await getRepository(c.env).changeRolePermissions(
        c.get('studioMember')!.id,
        roleId,
        permissions,
        crypto.randomUUID(),
      );

      if (result.status === 'forbidden') {
        return c.json({ error: 'Permission required: access.manage' }, 403);
      }
      if (result.status === 'not_found') {
        return c.json({ error: 'Role not found' }, 404);
      }
      if (result.status === 'immutable_role') {
        return c.json({ error: 'Administrator permissions are immutable' }, 409);
      }
      if (result.status === 'invalid_permissions') {
        return c.json({ error: 'The permission matrix is invalid' }, 422);
      }
      if (result.status === 'updated' || result.status === 'unchanged') {
        return c.json(result.role);
      }
      return c.json({ error: 'Permission matrix change failed' }, 500);
    },
  );
