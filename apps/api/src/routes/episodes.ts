import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { canTransitionEpisode, toPaginatedList } from '@mukhtalif/types';
import {
  createEpisodeSchema,
  episodeStatusSchema,
  isPaginatedRequest,
  listQuerySchema,
  resolveListQuery,
  updateEpisodeSchema,
  updateEpisodeStatusSchema,
} from '@mukhtalif/validation';
import { hasPermission, requirePermission, type AppEnv } from '../auth';
import { getRepository } from '../repo';

const episodeListQuerySchema = listQuerySchema.extend({
  showId: z.string().optional(),
  status: episodeStatusSchema.optional(),
});

export const episodesRoute = new Hono<AppEnv>()
  .get('/', zValidator('query', episodeListQuerySchema), async (c) => {
    const input = c.req.valid('query');
    const canViewStudioEpisodes = hasPermission(c.get('permissions'), 'episodes.view');
    // Listeners only see the published catalog; editors and admins can filter freely.
    const filter = {
      showId: input.showId,
      status: canViewStudioEpisodes ? input.status : ('published' as const),
    };
    const repo = getRepository(c.env);
    if (!isPaginatedRequest(input)) return c.json(await repo.listEpisodes(filter));
    const query = resolveListQuery(input);
    return c.json(toPaginatedList(await repo.listEpisodesPage(filter, query), query));
  })
  .get('/:id', async (c) => {
    const episode = await getRepository(c.env).getEpisode(c.req.param('id'));
    const canViewStudioEpisodes = hasPermission(c.get('permissions'), 'episodes.view');
    if (!episode || (!canViewStudioEpisodes && episode.status !== 'published')) {
      return c.json({ error: 'Episode not found' }, 404);
    }
    return c.json(episode);
  })
  .post(
    '/',
    requirePermission('episodes.manage'),
    zValidator('json', createEpisodeSchema),
    async (c) => {
      const input = c.req.valid('json');
      const repo = getRepository(c.env);
      if (!(await repo.getShow(input.showId))) {
        return c.json({ error: 'Unknown show' }, 422);
      }
      const episode = await repo.createEpisode(input);
      return c.json(episode, 201);
    },
  )
  .patch(
    '/:id',
    requirePermission('episodes.manage'),
    zValidator('json', updateEpisodeSchema),
    async (c) => {
      const episode = await getRepository(c.env).updateEpisode(
        c.req.param('id'),
        c.req.valid('json'),
      );
      if (!episode) return c.json({ error: 'Episode not found' }, 404);
      return c.json(episode);
    },
  )
  .patch(
    '/:id/status',
    requirePermission('episodes.manage'),
    zValidator('json', updateEpisodeStatusSchema),
    async (c) => {
      const { status, publishAt } = c.req.valid('json');
      const repo = getRepository(c.env);
      const current = await repo.getEpisode(c.req.param('id'));
      if (!current) return c.json({ error: 'Episode not found' }, 404);
      if (!canTransitionEpisode(current.status, status)) {
        return c.json({ error: `Cannot move a ${current.status} episode to ${status}` }, 422);
      }
      if (status === 'scheduled' && !publishAt && !current.publishAt) {
        return c.json({ error: 'Scheduling an episode requires a publishAt timestamp' }, 422);
      }
      // Publishing stamps the real go-live moment unless one was supplied.
      const effectivePublishAt =
        status === 'published' ? (publishAt ?? new Date().toISOString()) : publishAt;
      const episode = await repo.updateEpisodeStatus(current.id, status, effectivePublishAt);
      return c.json(episode);
    },
  )
  .put('/:id/audio', requirePermission('episodes.manage'), async (c) => {
    const bucket = c.env.AUDIO;
    if (!bucket) {
      return c.json({ error: 'Audio storage is not configured (R2 binding missing)' }, 503);
    }
    const repo = getRepository(c.env);
    const current = await repo.getEpisode(c.req.param('id'));
    if (!current) return c.json({ error: 'Episode not found' }, 404);
    const key = `episodes/${current.id}`;
    await bucket.put(key, c.req.raw.body, {
      httpMetadata: { contentType: c.req.header('content-type') ?? 'audio/mpeg' },
    });
    const episode = await repo.setEpisodeAudioKey(current.id, key);
    return c.json(episode);
  })
  .get('/:id/audio', async (c) => {
    const repo = getRepository(c.env);
    const user = c.get('user');
    const canViewStudioEpisodes = hasPermission(c.get('permissions'), 'episodes.view');
    const episode = await repo.getEpisode(c.req.param('id'));
    if (!episode || (!canViewStudioEpisodes && episode.status !== 'published')) {
      return c.json({ error: 'Episode not found' }, 404);
    }

    if (episode.premium && !canViewStudioEpisodes) {
      if (!user) return c.json({ error: 'Authentication required' }, 401);
      const subscription = await repo.getSubscriptionForUser(user.id);
      if (subscription?.status !== 'active') {
        return c.json({ error: 'An active subscription is required for premium episodes' }, 403);
      }
    }

    if (episode.audioKey && c.env.AUDIO) {
      const rangeHeader = c.req.header('range');
      const match = rangeHeader?.match(/^bytes=(\d+)-(\d*)$/);
      if (match) {
        const offset = Number(match[1]);
        const end = match[2] ? Number(match[2]) : undefined;
        const object = await c.env.AUDIO.get(episode.audioKey, {
          range: { offset, length: end !== undefined ? end - offset + 1 : undefined },
        });
        if (!object) return c.json({ error: 'Audio object missing' }, 404);
        const lastByte = end !== undefined ? Math.min(end, object.size - 1) : object.size - 1;
        return new Response(object.body, {
          status: 206,
          headers: {
            'content-type': object.httpMetadata?.contentType ?? 'audio/mpeg',
            'content-range': `bytes ${offset}-${lastByte}/${object.size}`,
            'accept-ranges': 'bytes',
          },
        });
      }
      const object = await c.env.AUDIO.get(episode.audioKey);
      if (!object) return c.json({ error: 'Audio object missing' }, 404);
      return new Response(object.body, {
        headers: {
          'content-type': object.httpMetadata?.contentType ?? 'audio/mpeg',
          'accept-ranges': 'bytes',
          'content-length': String(object.size),
        },
      });
    }

    if (episode.audioUrl) return c.redirect(episode.audioUrl, 302);
    return c.json({ error: 'No audio available for this episode' }, 404);
  });
