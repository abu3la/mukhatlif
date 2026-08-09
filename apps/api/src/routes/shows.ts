import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { createShowSchema, updateShowSchema } from '@mukhtalif/validation';
import { requireAdmin, type AppEnv } from '../auth';
import { getRepository } from '../repo';

export const showsRoute = new Hono<AppEnv>()
  .get('/', async (c) => {
    const shows = await getRepository(c.env).listShows();
    return c.json(shows);
  })
  .get('/:idOrSlug', async (c) => {
    const repo = getRepository(c.env);
    const idOrSlug = c.req.param('idOrSlug');
    const show = (await repo.getShow(idOrSlug)) ?? (await repo.getShowBySlug(idOrSlug));
    if (!show) return c.json({ error: 'Show not found' }, 404);
    return c.json(show);
  })
  .post('/', requireAdmin, zValidator('json', createShowSchema), async (c) => {
    const input = c.req.valid('json');
    const repo = getRepository(c.env);
    if (await repo.getShowBySlug(input.slug)) {
      return c.json({ error: 'A show with this slug already exists' }, 422);
    }
    const show = await repo.createShow(input);
    return c.json(show, 201);
  })
  .patch('/:id', requireAdmin, zValidator('json', updateShowSchema), async (c) => {
    const show = await getRepository(c.env).updateShow(c.req.param('id'), c.req.valid('json'));
    if (!show) return c.json({ error: 'Show not found' }, 404);
    return c.json(show);
  });
