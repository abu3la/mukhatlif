import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { followSchema, upsertProgressSchema } from '@mukhtalif/validation';
import { requireAuth, type AppEnv } from '../auth';
import { getRepository } from '../repo';

export const meRoute = new Hono<AppEnv>()
  .get('/', requireAuth, async (c) => {
    return c.json(c.get('user'));
  })
  .get('/subscription', requireAuth, async (c) => {
    const subscription = await getRepository(c.env).getSubscriptionForUser(c.get('user')!.id);
    return c.json(subscription);
  });

export const followsRoute = new Hono<AppEnv>()
  .get('/', requireAuth, async (c) => {
    const follows = await getRepository(c.env).listFollows(c.get('user')!.id);
    return c.json(follows);
  })
  .post('/', requireAuth, zValidator('json', followSchema), async (c) => {
    const { showId } = c.req.valid('json');
    const repo = getRepository(c.env);
    if (!(await repo.getShow(showId))) return c.json({ error: 'Unknown show' }, 422);
    const follow = await repo.createFollow(c.get('user')!.id, showId);
    return c.json(follow, 201);
  })
  .delete('/:showId', requireAuth, async (c) => {
    const removed = await getRepository(c.env).deleteFollow(
      c.get('user')!.id,
      c.req.param('showId'),
    );
    if (!removed) return c.json({ error: 'Not following this show' }, 404);
    return c.body(null, 204);
  });

export const progressRoute = new Hono<AppEnv>()
  .get('/', requireAuth, async (c) => {
    const progress = await getRepository(c.env).listProgress(c.get('user')!.id);
    return c.json(progress);
  })
  .put('/', requireAuth, zValidator('json', upsertProgressSchema), async (c) => {
    const { episodeId, positionSec } = c.req.valid('json');
    const repo = getRepository(c.env);
    if (!(await repo.getEpisode(episodeId))) return c.json({ error: 'Unknown episode' }, 422);
    const entry = await repo.upsertProgress(c.get('user')!.id, episodeId, positionSec);
    return c.json(entry);
  });
