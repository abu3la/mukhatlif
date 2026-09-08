import { Hono } from 'hono';
import type { AppEnv } from '../auth';
import { getRepository } from '../repo';

/** Readiness is independent of login, customer provisioning and client surface. */
export const customerSchemaHealthRoute = new Hono<AppEnv>().get('/', async (c) => {
  c.header('Cache-Control', 'no-store');
  let ready = false;
  try {
    ready = (await getRepository(c.env).isCustomerSchemaReady()) === true;
  } catch {
    // Configuration and provider failures expose the same bounded response.
  }
  return c.json({ ready }, ready ? 200 : 503);
});
