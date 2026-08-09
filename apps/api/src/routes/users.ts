import { Hono } from 'hono';
import { requireAdmin, type AppEnv } from '../auth';
import { getRepository } from '../repo';

/** Admin-only listing for the subscribers screen. */
export const usersRoute = new Hono<AppEnv>().get('/', requireAdmin, async (c) => {
  const users = await getRepository(c.env).listUsers();
  return c.json(users);
});
