import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { toPaginatedList } from '@mukhtalif/types';
import {
  createShowSchema,
  isPaginatedRequest,
  listQuerySchema,
  resolveListQuery,
  updateShowSchema,
} from '@mukhtalif/validation';
import { requirePermission, type AppEnv } from '../auth';
import { getRepository } from '../repo';

/**
 * The anonymous catalogue. Read-only by construction: there is no mutating
 * handler on this router, so a write can never reach it regardless of who the
 * caller turns out to be.
 */
export const publicShowsRoute = new Hono<AppEnv>()
  .get('/', zValidator('query', listQuerySchema), async (c) => {
    const input = c.req.valid('query');
    const repo = getRepository(c.env);
    if (!isPaginatedRequest(input)) return c.json(await repo.listShows());
    const query = resolveListQuery(input);
    return c.json(toPaginatedList(await repo.listShowsPage(query), query));
  })
  .get('/:idOrSlug', async (c) => {
    const repo = getRepository(c.env);
    const idOrSlug = c.req.param('idOrSlug');
    const show = (await repo.getShow(idOrSlug)) ?? (await repo.getShowBySlug(idOrSlug));
    if (!show) return c.json({ error: 'Show not found' }, 404);
    return c.json(show);
  });

/** Operator management. Every handler requires a Studio permission. */
export const studioShowsRoute = new Hono<AppEnv>()
  .get(
    '/',
    requirePermission('shows.view'),
    zValidator('query', listQuerySchema),
    async (c) => {
      const input = c.req.valid('query');
      const repo = getRepository(c.env);
      if (!isPaginatedRequest(input)) return c.json(await repo.listShows());
      const query = resolveListQuery(input);
      return c.json(toPaginatedList(await repo.listShowsPage(query), query));
    },
  )
  .get('/:idOrSlug', requirePermission('shows.view'), async (c) => {
    const repo = getRepository(c.env);
    const idOrSlug = c.req.param('idOrSlug');
    const show = (await repo.getShow(idOrSlug)) ?? (await repo.getShowBySlug(idOrSlug));
    if (!show) return c.json({ error: 'Show not found' }, 404);
    return c.json(show);
  })
  .post('/', requirePermission('shows.manage'), zValidator('json', createShowSchema), async (c) => {
    const input = c.req.valid('json');
    const repo = getRepository(c.env);
    if (await repo.getShowBySlug(input.slug)) {
      return c.json({ error: 'A show with this slug already exists' }, 422);
    }
    const show = await repo.createShow(input);
    return c.json(show, 201);
  })
  .patch(
    '/:id',
    requirePermission('shows.manage'),
    zValidator('json', updateShowSchema),
    async (c) => {
      const show = await getRepository(c.env).updateShow(c.req.param('id'), c.req.valid('json'));
      if (!show) return c.json({ error: 'Show not found' }, 404);
      return c.json(show);
    },
  );
