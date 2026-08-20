import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { toPaginatedList } from '@mukhtalif/types';
import {
  createGuestSchema,
  createGuestSocialSchema,
  guestAppearanceSchema,
  isPaginatedRequest,
  listQuerySchema,
  resolveListQuery,
  updateGuestSchema,
  updateGuestSocialSchema,
} from '@mukhtalif/validation';
import { requirePermission, type AppEnv } from '../auth';
import { getRepository, type Repository } from '../repo';

/**
 * Derives a stable URL slug. A guest may be created blank, so an unnamed guest
 * falls back to a random suffix rather than an empty slug the database would
 * reject. Uniqueness is confirmed against storage before insert.
 */
function slugCandidate(name: string | undefined): string {
  const base = (name ?? '')
    .toLowerCase()
    .replace(/[ً-ٰٟ]/g, '')
    .replace(/[^a-z0-9ء-ي]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  // Non-Latin names produce an empty ASCII slug; fall back to an opaque one.
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(base) && base.length > 0
    ? base
    : `guest-${crypto.randomUUID().slice(0, 8)}`;
}

async function uniqueSlug(repo: Repository, name: string | undefined): Promise<string> {
  const base = slugCandidate(name);
  if (!(await repo.getGuestBySlug(base))) return base;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = `${base}-${crypto.randomUUID().slice(0, 6)}`;
    if (!(await repo.getGuestBySlug(candidate))) return candidate;
  }
  return `guest-${crypto.randomUUID()}`;
}

/**
 * Studio guest management. Every read requires `guests.view` and every mutation
 * requires `guests.manage`; there is no public guest surface in this slice.
 */
export const studioGuestsRoute = new Hono<AppEnv>()
  .get(
    '/',
    requirePermission('guests.view'),
    zValidator('query', listQuerySchema),
    async (c) => {
      const input = c.req.valid('query');
      const repo = getRepository(c.env);
      if (!isPaginatedRequest(input)) {
        // Legacy shape: the whole directory in one read, as the Studio expects.
        return c.json(await repo.readGuestDirectory());
      }
      const query = resolveListQuery(input);
      return c.json(toPaginatedList(await repo.listGuestsPage(query), query));
    },
  )
  .post(
    '/',
    requirePermission('guests.manage'),
    zValidator('json', createGuestSchema),
    async (c) => {
      const input = c.req.valid('json');
      const repo = getRepository(c.env);
      if (input.slug) {
        if (await repo.getGuestBySlug(input.slug)) {
          return c.json({ error: 'A guest with this slug already exists' }, 422);
        }
        return c.json(await repo.createGuest(input.slug, input), 201);
      }
      return c.json(await repo.createGuest(await uniqueSlug(repo, input.name), input), 201);
    },
  )
  .get('/:id', requirePermission('guests.view'), async (c) => {
    const repo = getRepository(c.env);
    const guest = await repo.getGuest(c.req.param('id'));
    if (!guest) return c.json({ error: 'Guest not found' }, 404);
    const [socials, appearances] = await Promise.all([
      repo.listGuestSocials(guest.id),
      repo.listGuestAppearances(guest.id),
    ]);
    return c.json({ guest, socials, appearances });
  })
  .patch(
    '/:id',
    requirePermission('guests.manage'),
    zValidator('json', updateGuestSchema),
    async (c) => {
      const guest = await getRepository(c.env).updateGuest(c.req.param('id'), c.req.valid('json'));
      if (!guest) return c.json({ error: 'Guest not found' }, 404);
      return c.json(guest);
    },
  )
  .get('/:id/socials', requirePermission('guests.view'), async (c) => {
    const repo = getRepository(c.env);
    if (!(await repo.getGuest(c.req.param('id')))) {
      return c.json({ error: 'Guest not found' }, 404);
    }
    return c.json(await repo.listGuestSocials(c.req.param('id')));
  })
  .post(
    '/:id/socials',
    requirePermission('guests.manage'),
    zValidator('json', createGuestSocialSchema),
    async (c) => {
      const result = await getRepository(c.env).createGuestSocial(
        c.req.param('id'),
        c.req.valid('json'),
      );
      if (result.status === 'created') return c.json(result.social, 201);
      if (result.status === 'guest_not_found') return c.json({ error: 'Guest not found' }, 404);
      return c.json({ error: 'This guest already has a link for that platform' }, 422);
    },
  )
  .patch(
    '/socials/:socialId',
    requirePermission('guests.manage'),
    zValidator('json', updateGuestSocialSchema),
    async (c) => {
      const result = await getRepository(c.env).updateGuestSocial(
        c.req.param('socialId'),
        c.req.valid('json'),
      );
      if (result.status === 'updated') return c.json(result.social);
      if (result.status === 'not_found') return c.json({ error: 'Guest link not found' }, 404);
      return c.json({ error: 'This guest already has a link for that platform' }, 422);
    },
  )
  .delete('/socials/:socialId', requirePermission('guests.manage'), async (c) => {
    const removed = await getRepository(c.env).deleteGuestSocial(c.req.param('socialId'));
    if (!removed) return c.json({ error: 'Guest link not found' }, 404);
    return c.body(null, 204);
  })
  .get('/:id/appearances', requirePermission('guests.view'), async (c) => {
    const repo = getRepository(c.env);
    if (!(await repo.getGuest(c.req.param('id')))) {
      return c.json({ error: 'Guest not found' }, 404);
    }
    return c.json(await repo.listGuestAppearances(c.req.param('id')));
  })
  .post(
    '/:id/appearances',
    requirePermission('guests.manage'),
    zValidator('json', guestAppearanceSchema),
    async (c) => {
      const result = await getRepository(c.env).linkGuestAppearance(
        c.req.param('id'),
        c.req.valid('json').episodeId,
      );
      // Linking is idempotent, so a repeat is 200 rather than a conflict.
      if (result.status === 'linked') return c.json(result.appearance, 201);
      if (result.status === 'already_linked') return c.json(result.appearance, 200);
      if (result.status === 'guest_not_found') return c.json({ error: 'Guest not found' }, 404);
      return c.json({ error: 'Unknown episode' }, 422);
    },
  )
  .delete('/:id/appearances/:episodeId', requirePermission('guests.manage'), async (c) => {
    const removed = await getRepository(c.env).unlinkGuestAppearance(
      c.req.param('id'),
      c.req.param('episodeId'),
    );
    if (!removed) return c.json({ error: 'Guest appearance not found' }, 404);
    return c.body(null, 204);
  });
