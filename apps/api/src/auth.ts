import { createClient } from '@supabase/supabase-js';
import type { MiddlewareHandler } from 'hono';
import type { User } from '@mukhtalif/types';
import type { Env } from './env';
import { getRepository } from './repo';

export type AppEnv = {
  Bindings: Env;
  Variables: { user: User | null };
};

/**
 * Resolves the requester once per request.
 * - With Supabase configured: verifies the `Authorization: Bearer <jwt>` via
 *   Supabase Auth, then loads the matching profile row.
 * - Without credentials (local dev): trusts an `x-dev-user` header naming a
 *   seeded user id, e.g. `usr-admin-1`. Never active once Supabase is configured.
 */
export const resolveUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set('user', null);
  const repo = getRepository(c.env);
  const supabaseConfigured = Boolean(c.env.SUPABASE_URL && c.env.SUPABASE_SERVICE_ROLE_KEY);

  if (supabaseConfigured) {
    const bearer = c.req.header('authorization');
    if (bearer?.toLowerCase().startsWith('bearer ')) {
      const supabase = createClient(c.env.SUPABASE_URL!, c.env.SUPABASE_SERVICE_ROLE_KEY!, {
        auth: { persistSession: false },
      });
      const { data } = await supabase.auth.getUser(bearer.slice(7));
      if (data.user) {
        const profile =
          (data.user.email ? await repo.getUserByEmail(data.user.email) : null) ??
          (await repo.getUser(data.user.id));
        c.set('user', profile);
      }
    }
  } else {
    const devUserId = c.req.header('x-dev-user');
    if (devUserId) c.set('user', await repo.getUser(devUserId));
  }

  await next();
};

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get('user')) return c.json({ error: 'Authentication required' }, 401);
  await next();
};

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Authentication required' }, 401);
  if (user.role !== 'admin') return c.json({ error: 'Admin access required' }, 403);
  await next();
};
