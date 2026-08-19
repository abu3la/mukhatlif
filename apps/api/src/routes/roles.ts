import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { createStudioRoleSchema, studioRoleParamsSchema } from '@mukhtalif/validation';
import { requirePermission, type AppEnv } from '../auth';
import { getRepository } from '../repo';

export const rolesRoute = new Hono<AppEnv>()
  .get('/', requirePermission('access.view'), async (c) => {
    return c.json(await getRepository(c.env).listRoles());
  })
  .post(
    '/',
    requirePermission('access.manage'),
    zValidator('json', createStudioRoleSchema),
    async (c) => {
      const result = await getRepository(c.env).createRole(
        c.get('studioMember')!.id,
        c.req.valid('json'),
        crypto.randomUUID(),
      );

      if (result.status === 'created') return c.json(result.role, 201);
      if (result.status === 'forbidden') {
        return c.json({ error: 'Permission required: access.manage' }, 403);
      }
      if (result.status === 'duplicate_name') {
        return c.json({ error: 'A role with this name already exists' }, 409);
      }
      if (result.status === 'invalid_input') {
        return c.json({ error: 'The role details are invalid' }, 422);
      }
      if (result.status === 'invalid_permissions') {
        return c.json({ error: 'The role permission matrix is invalid' }, 422);
      }
      return c.json({ error: 'Role creation failed' }, 500);
    },
  )
  .get(
    '/:roleId',
    requirePermission('access.view'),
    zValidator('param', studioRoleParamsSchema),
    async (c) => {
      const role = await getRepository(c.env).getRole(c.req.valid('param').roleId);
      return role ? c.json(role) : c.json({ error: 'Role not found' }, 404);
    },
  );
