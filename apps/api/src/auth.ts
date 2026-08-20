import { createClient } from '@supabase/supabase-js';
import type { MiddlewareHandler } from 'hono';
import type { ClientSurface, PermissionId, StudioMember, User } from '@mukhtalif/types';
import { getSupabaseCredentials, isDevAuthEnabled, type Env } from './env';
import { getRepository } from './repo';

export type AppEnv = {
  Bindings: Env;
  Variables: {
    authUserId: string | null;
    /** Declared client product, or null when the caller did not say. */
    clientSurface: ClientSurface | null;
    permissions: PermissionId[];
    studioMember: StudioMember | null;
    user: User | null;
  };
};

/**
 * Resolves the requester once per request.
 * - With Supabase configured: verifies the bearer token and independently
 *   resolves the app profile and Studio membership linked to that Auth UUID.
 * - Without Supabase: x-dev-user is accepted only when both APP_ENV and the
 *   explicit local development gate allow it.
 */
export const resolveUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set('authUserId', null);
  c.set('permissions', []);
  c.set('studioMember', null);
  c.set('user', null);
  const repo = getRepository(c.env);
  const credentials = getSupabaseCredentials(c.env);

  if (credentials) {
    const authorization = c.req.header('authorization')?.trim();
    const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if (bearer) {
      const supabase = createClient(credentials.url, credentials.serviceRoleKey, {
        auth: { persistSession: false },
      });
      const { data, error } = await supabase.auth.getUser(bearer);
      if (error) {
        await next();
        return;
      }
      if (data.user) {
        c.set('authUserId', data.user.id);
        const [user, studioMember] = await Promise.all([
          repo.getUserByAuthId(data.user.id),
          repo.getStudioMemberByAuthId(data.user.id),
        ]);
        c.set('user', user);
        c.set('studioMember', studioMember);
      }
    }
  } else if (isDevAuthEnabled(c.env)) {
    const devUserId = c.req.header('x-dev-user');
    if (devUserId) {
      const [user, studioMember] = await Promise.all([
        repo.getUser(devUserId),
        repo.getStudioMember(devUserId),
      ]);
      c.set('user', user);
      c.set('studioMember', studioMember);
      if (user || studioMember) c.set('authUserId', `dev:${devUserId}`);
    }
  }

  const studioMember = c.get('studioMember');
  if (studioMember) {
    c.set('permissions', await repo.resolveRolePermissions(studioMember.role));
  }

  await next();
};

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get('user')) {
    if (c.get('authUserId')) return c.json({ error: 'Profile access is not provisioned' }, 403);
    return c.json({ error: 'Authentication required' }, 401);
  }
  await next();
};

export const requireStudioAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get('studioMember')) {
    if (c.get('authUserId')) {
      return c.json({ error: 'Studio membership is not provisioned' }, 403);
    }
    return c.json({ error: 'Authentication required' }, 401);
  }
  await next();
};

export function hasPermission(
  permissions: readonly PermissionId[],
  permission: PermissionId,
): boolean {
  return permissions.includes(permission);
}

export function requirePermission(permission: PermissionId): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const member = c.get('studioMember');
    if (!member) {
      if (c.get('authUserId')) {
        return c.json({ error: 'Studio membership is not provisioned' }, 403);
      }
      return c.json({ error: 'Authentication required' }, 401);
    }
    if (!hasPermission(c.get('permissions'), permission)) {
      return c.json({ error: `Permission required: ${permission}` }, 403);
    }
    await next();
  };
}

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const member = c.get('studioMember');
  if (!member) {
    if (c.get('authUserId')) {
      return c.json({ error: 'Studio membership is not provisioned' }, 403);
    }
    return c.json({ error: 'Authentication required' }, 401);
  }
  if (member.role !== 'admin') {
    return c.json({ error: 'Admin access required', code: 'ADMIN_REQUIRED' }, 403);
  }
  await next();
};
