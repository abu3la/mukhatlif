import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { Context, MiddlewareHandler } from 'hono';
import type { CustomerLibrary, CustomerLibraryDocument } from '@mukhtalif/types';
import {
  provisionCustomerSchema,
  updateCustomerProfileSchema,
  createCustomerPlaylistSchema,
  updateCustomerPlaylistSchema,
  createCustomerBookmarkSchema,
  updateCustomerBookmarkSchema,
  updateCustomerQueueSchema,
  upsertProgressSchema,
} from '@mukhtalif/validation';
import { requireAuth, type AppEnv } from '../auth';
import { getRepository, type Repository } from '../repo';
import { CustomerItemNotFoundError, CustomerLibraryLimitError } from '../repo/customer';

const requireConfirmedIdentity: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get('authUserId')) return c.json({ error: 'Authentication required' }, 401);
  if (!c.get('authEmail'))
    return c.json(
      {
        error: 'Confirm your email before creating your account',
        code: 'EMAIL_CONFIRMATION_REQUIRED',
      },
      403,
    );
  await next();
};

/** Creating a customer profile is an explicit opt-in; resolving an Auth token never creates one. */
export const customerAccountRoute = new Hono<AppEnv>()
  .post('/', requireConfirmedIdentity, zValidator('json', provisionCustomerSchema), async (c) => {
    const profile = await getRepository(c.env).provisionCustomer(
      c.get('authUserId')!,
      c.get('authEmail')!,
      c.req.valid('json'),
    );
    return c.json(profile);
  })
  .get('/', requireConfirmedIdentity, async (c) => {
    const user = c.get('user');
    if (!user)
      return c.json(
        { error: 'Customer profile has not been created', code: 'CUSTOMER_NOT_PROVISIONED' },
        404,
      );
    const repo = getRepository(c.env);
    if (user.email.toLowerCase() !== c.get('authEmail')!.toLowerCase()) {
      return c.json(
        await repo.provisionCustomer(c.get('authUserId')!, c.get('authEmail')!, {
          displayName: user.displayName,
          locale: user.locale,
        }),
      );
    }
    return c.json(await repo.getCustomerProfile(user.id));
  })
  .patch(
    '/',
    requireConfirmedIdentity,
    requireAuth,
    zValidator('json', updateCustomerProfileSchema),
    async (c) => {
      return c.json(
        await getRepository(c.env).updateCustomerProfile(c.get('user')!.id, c.req.valid('json')),
      );
    },
  );

async function readLibrary(repo: Repository, userId: string): Promise<CustomerLibrary> {
  const [document, follows, progress] = await Promise.all([
    repo.getCustomerLibraryDocument(userId),
    repo.listFollows(userId),
    repo.listProgress(userId),
  ]);
  return {
    ...document,
    followedShowIds: follows.map((follow) => follow.showId),
    progress: [...progress].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  };
}

async function response(c: Context<AppEnv>) {
  return c.json(await readLibrary(getRepository(c.env), c.get('user')!.id));
}

async function mutate(c: Context<AppEnv>, mutation: (document: CustomerLibraryDocument) => void) {
  await getRepository(c.env).mutateCustomerLibrary(c.get('user')!.id, mutation);
  return response(c);
}

async function isPublishedEpisode(repo: Repository, episodeId: string) {
  return (await repo.getEpisode(episodeId))?.status === 'published';
}

export const customerLibraryRoute = new Hono<AppEnv>();
customerLibraryRoute.use('*', requireConfirmedIdentity, requireAuth);
customerLibraryRoute.get('/', response);
customerLibraryRoute.delete('/', async (c) => {
  await getRepository(c.env).clearCustomerLibrary(c.get('user')!.id);
  return response(c);
});

for (const kind of ['episodes', 'articles'] as const) {
  const field = kind === 'episodes' ? 'savedEpisodeIds' : 'savedArticleIds';
  customerLibraryRoute.put(`/saved/${kind}/:contentId`, async (c) => {
    const id = c.req.param('contentId');
    const repo = getRepository(c.env);
    const content = kind === 'episodes' ? await repo.getEpisode(id) : await repo.getArticle(id);
    if (content?.status !== 'published') return c.json({ error: 'Content is unavailable' }, 404);
    return mutate(c, (library) => {
      if (!library[field].includes(id)) library[field].unshift(id);
    });
  });
  customerLibraryRoute.delete(`/saved/${kind}/:contentId`, async (c) => {
    const id = c.req.param('contentId');
    return mutate(c, (library) => {
      library[field] = library[field].filter((value) => value !== id);
    });
  });
}

customerLibraryRoute.put('/follows/:showId', async (c) => {
  const repo = getRepository(c.env);
  const showId = c.req.param('showId');
  if (!(await repo.getShow(showId))) return c.json({ error: 'Show is unavailable' }, 404);
  await repo.createFollow(c.get('user')!.id, showId);
  return response(c);
});
customerLibraryRoute.delete('/follows/:showId', async (c) => {
  await getRepository(c.env).deleteFollow(c.get('user')!.id, c.req.param('showId'));
  return response(c);
});
customerLibraryRoute.put('/progress', zValidator('json', upsertProgressSchema), async (c) => {
  const repo = getRepository(c.env);
  const { episodeId, positionSec } = c.req.valid('json');
  const episode = await repo.getEpisode(episodeId);
  if (episode?.status !== 'published') return c.json({ error: 'Episode is unavailable' }, 404);
  if (positionSec > episode.durationSec)
    return c.json({ error: 'Position exceeds episode duration' }, 422);
  await repo.upsertProgress(c.get('user')!.id, episodeId, positionSec);
  return response(c);
});
customerLibraryRoute.delete('/progress', async (c) => {
  await getRepository(c.env).deleteProgress(c.get('user')!.id);
  return response(c);
});
customerLibraryRoute.delete('/progress/:episodeId', async (c) => {
  await getRepository(c.env).deleteProgress(c.get('user')!.id, c.req.param('episodeId'));
  return response(c);
});

customerLibraryRoute.post(
  '/playlists',
  zValidator('json', createCustomerPlaylistSchema),
  async (c) => {
    const input = c.req.valid('json');
    const now = new Date().toISOString();
    const playlist = {
      id: `playlist-${crypto.randomUUID()}`,
      ...input,
      episodeIds: [],
      createdAt: now,
      updatedAt: now,
    };
    return mutate(c, (library) => {
      library.playlists.unshift(playlist);
    });
  },
);
customerLibraryRoute.patch(
  '/playlists/:id',
  zValidator('json', updateCustomerPlaylistSchema),
  async (c) => {
    const input = c.req.valid('json');
    const repo = getRepository(c.env);
    const id = c.req.param('id');
    const current = (await repo.getCustomerLibraryDocument(c.get('user')!.id)).playlists.find(
      (item) => item.id === id,
    );
    if (!current) return c.json({ error: 'Playlist not found' }, 404);
    const additions =
      input.episodeIds?.filter((episodeId) => !current.episodeIds.includes(episodeId)) ?? [];
    if (input.episodeIds) {
      // Bound parallel work to avoid exhausting sockets for a long playlist.
      for (let offset = 0; offset < additions.length; offset += 10) {
        const published = await Promise.all(
          additions
            .slice(offset, offset + 10)
            .map((episodeId) => isPublishedEpisode(repo, episodeId)),
        );
        if (published.some((value) => !value))
          return c.json({ error: 'An episode is unavailable' }, 404);
      }
    }
    return mutate(c, (library) => {
      const playlist = library.playlists.find((item) => item.id === id);
      if (!playlist) throw new CustomerItemNotFoundError('Playlist not found');
      // A retry may keep previously saved unavailable IDs, but cannot restore
      // one removed by another device without passing publication validation.
      if (
        input.episodeIds?.some(
          (episodeId) => !additions.includes(episodeId) && !playlist.episodeIds.includes(episodeId),
        )
      ) {
        throw new CustomerItemNotFoundError('The playlist changed; reload before saving');
      }
      Object.assign(playlist, input, { updatedAt: new Date().toISOString() });
    });
  },
);
customerLibraryRoute.delete('/playlists/:id', async (c) => {
  const id = c.req.param('id');
  return mutate(c, (library) => {
    if (!library.playlists.some((item) => item.id === id))
      throw new CustomerItemNotFoundError('Playlist not found');
    library.playlists = library.playlists.filter((item) => item.id !== id);
  });
});

customerLibraryRoute.post(
  '/bookmarks',
  zValidator('json', createCustomerBookmarkSchema),
  async (c) => {
    const input = c.req.valid('json');
    const episode = await getRepository(c.env).getEpisode(input.episodeId);
    if (episode?.status !== 'published') return c.json({ error: 'Episode is unavailable' }, 404);
    if (input.positionSec > episode.durationSec)
      return c.json({ error: 'Position exceeds episode duration' }, 422);
    const bookmark = {
      id: `bookmark-${crypto.randomUUID()}`,
      ...input,
      createdAt: new Date().toISOString(),
    };
    return mutate(c, (library) => {
      library.bookmarks.unshift(bookmark);
    });
  },
);
customerLibraryRoute.patch(
  '/bookmarks/:id',
  zValidator('json', updateCustomerBookmarkSchema),
  async (c) => {
    const { label } = c.req.valid('json');
    const id = c.req.param('id');
    return mutate(c, (library) => {
      const bookmark = library.bookmarks.find((item) => item.id === id);
      if (!bookmark) throw new CustomerItemNotFoundError('Bookmark not found');
      bookmark.label = label;
    });
  },
);
customerLibraryRoute.delete('/bookmarks/:id', async (c) => {
  const id = c.req.param('id');
  return mutate(c, (library) => {
    if (!library.bookmarks.some((item) => item.id === id))
      throw new CustomerItemNotFoundError('Bookmark not found');
    library.bookmarks = library.bookmarks.filter((item) => item.id !== id);
  });
});
customerLibraryRoute.put('/queue', zValidator('json', updateCustomerQueueSchema), async (c) => {
  const { episodeIds } = c.req.valid('json');
  const repo = getRepository(c.env);
  const current = await repo.getCustomerLibraryDocument(c.get('user')!.id);
  const additions = episodeIds.filter((id) => !current.queueEpisodeIds.includes(id));
  for (let offset = 0; offset < additions.length; offset += 10) {
    const valid = await Promise.all(
      additions.slice(offset, offset + 10).map((id) => isPublishedEpisode(repo, id)),
    );
    if (valid.some((value) => !value)) return c.json({ error: 'An episode is unavailable' }, 404);
  }
  return mutate(c, (library) => {
    if (episodeIds.length > 200) throw new CustomerLibraryLimitError('Queue limit reached');
    if (episodeIds.some((id) => !additions.includes(id) && !library.queueEpisodeIds.includes(id))) {
      throw new CustomerItemNotFoundError('The queue changed; reload before saving');
    }
    library.queueEpisodeIds = episodeIds;
  });
});
