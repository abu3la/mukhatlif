import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { updateHomepageWeeklyEpisodesSettingsSchema } from '@mukhtalif/validation';
import { requirePermission, type AppEnv } from '../auth';
import { getRepository } from '../repo';

/** Studio presentation settings. Episode membership remains publication-derived. */
export const studioHomepageRoute = new Hono<AppEnv>()
  .get('/weekly-episodes', requirePermission('shows.view'), async (c) => {
    return c.json(await getRepository(c.env).getHomepageWeeklyEpisodesSettings());
  })
  .patch(
    '/weekly-episodes',
    requirePermission('shows.manage'),
    zValidator('json', updateHomepageWeeklyEpisodesSettingsSchema),
    async (c) => {
      const result = await getRepository(c.env).updateHomepageWeeklyEpisodesSettings(
        c.req.valid('json'),
      );
      if (result.status === 'conflict') {
        return c.json(
          {
            error: 'Homepage weekly episode settings changed',
            code: 'VERSION_CONFLICT',
            current: result.settings,
          },
          409,
        );
      }
      return c.json(result.settings);
    },
  );
