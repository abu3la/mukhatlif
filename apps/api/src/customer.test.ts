import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CustomerLibrary, CustomerProfile } from '@mukhtalif/types';
import type { Env } from './env';
import { createMemoryRepository } from './repo/memory';
import type * as SupabaseModule from '@supabase/supabase-js';
import type * as RepositoryModule from './repo';

const auth = vi.hoisted(() => ({
  user: null as null | { id: string; email?: string; email_confirmed_at?: string },
}));
vi.mock('@supabase/supabase-js', async (importOriginal) => ({
  ...(await importOriginal<typeof SupabaseModule>()),
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: auth.user }, error: null }) },
  }),
}));
vi.mock('./repo', async (importOriginal) => ({
  ...(await importOriginal<typeof RepositoryModule>()),
  getRepository: () => repository,
}));
const repository = createMemoryRepository();
import app from './index';

const localEnv: Env = { APP_ENV: 'development', ALLOW_DEV_AUTH: 'true' };
const verifiedEnv: Env = {
  APP_ENV: 'development',
  SUPABASE_URL: 'https://acomtixjibgkauzeltsn.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-only-service-key',
};

async function request(path: string, method = 'GET', body?: unknown, userId = 'usr-listener-1') {
  return app.request(
    path,
    {
      method,
      headers: {
        'x-dev-user': userId,
        'content-type': 'application/json',
        'x-mukhtalif-client': 'web',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    localEnv,
  );
}

async function verified(path: string, method = 'GET', body?: unknown) {
  return app.request(
    path,
    {
      method,
      headers: {
        authorization: 'Bearer verified-by-test-double',
        'content-type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    verifiedEnv,
  );
}

async function library(response: Response) {
  expect(response.status).toBe(200);
  return (await response.json()) as CustomerLibrary;
}

beforeEach(async () => {
  auth.user = null;
  await repository.clearCustomerLibrary('usr-listener-1');
  await repository.clearCustomerLibrary('usr-listener-2');
});

describe('explicit customer identity', () => {
  it('requires confirmed email for an existing customer profile and every library operation', async () => {
    for (const email of ['sara@example.com', undefined]) {
      auth.user = { id: '33333333-3333-4333-8333-333333333333', email };
      for (const [path, method, body] of [
        ['/app/account', 'PATCH', { onboarded: true }],
        ['/app/library', 'GET', undefined],
        ['/app/library', 'DELETE', undefined],
        ['/app/library/saved/episodes/ep-1001', 'PUT', undefined],
      ] as const) {
        const denied = await verified(path, method, body);
        expect(denied.status).toBe(403);
        expect(await denied.json()).toMatchObject({ code: 'EMAIL_CONFIRMATION_REQUIRED' });
      }
    }
  });
  it('requires authentication, confirms email and never auto-provisions on discovery', async () => {
    expect((await verified('/app/account')).status).toBe(401);
    auth.user = { id: crypto.randomUUID(), email: 'new-customer@example.com' };
    expect((await verified('/app/account', 'POST', { displayName: 'عميل جديد' })).status).toBe(403);
    expect(await repository.getUserByAuthId(auth.user.id)).toBeNull();
    auth.user.email_confirmed_at = new Date().toISOString();
    expect((await verified('/app/account')).status).toBe(404);
    expect(await repository.getUserByAuthId(auth.user.id)).toBeNull();
    const first = await verified('/app/account', 'POST', { displayName: 'عميل جديد' });
    expect(first.status).toBe(200);
    const profile = (await first.json()) as CustomerProfile;
    const second = await verified('/app/account', 'POST', { displayName: 'لا يستبدل الاسم' });
    expect(await second.json()).toEqual(profile);
    expect(profile.displayName).toBe('عميل جديد');
    expect((await verified('/app/library')).status).toBe(200);
    expect((await verified('/studio/me')).status).toBe(403);
    expect(JSON.stringify(profile)).not.toMatch(/authUserId|auth_user_id|permissions|role/);
    expect(first.headers.get('cache-control')).toContain('no-store');
  });

  it('requires a confirmed email string even when a confirmation timestamp exists', async () => {
    auth.user = { id: crypto.randomUUID(), email_confirmed_at: new Date().toISOString() };
    expect((await verified('/app/account', 'POST', { displayName: 'عميل' })).status).toBe(403);
  });

  it('never claims another application profile by matching its email', async () => {
    auth.user = {
      id: crypto.randomUUID(),
      email: 'sara@example.com',
      email_confirmed_at: new Date().toISOString(),
    };
    const response = await verified('/app/account', 'POST', { displayName: 'عميل' });
    expect(response.status).toBe(409);
    expect(await repository.getUserByAuthId(auth.user.id)).toBeNull();
    expect((await repository.getUser('usr-listener-1'))?.displayName).toBe('سارة الحربي');
  });

  it('rejects spoofed identity and role fields', async () => {
    auth.user = {
      id: crypto.randomUUID(),
      email: 'spoof@example.com',
      email_confirmed_at: new Date().toISOString(),
    };
    expect(
      (
        await verified('/app/account', 'POST', {
          displayName: 'عميل',
          authUserId: 'other',
          role: 'admin',
        })
      ).status,
    ).toBe(400);
    expect((await request('/app/account', 'PATCH', { role: 'admin' })).status).toBe(400);
    expect((await request('/app/account', 'PATCH', { email: 'other@example.com' })).status).toBe(
      400,
    );
    expect(await repository.getUserByAuthId(auth.user.id)).toBeNull();
  });

  it('synchronizes confirmed email changes only on the same immutable identity', async () => {
    auth.user = {
      id: crypto.randomUUID(),
      email: 'before@example.com',
      email_confirmed_at: new Date().toISOString(),
    };
    const initial = (await (
      await verified('/app/account', 'POST', { displayName: 'عميل' })
    ).json()) as CustomerProfile;
    auth.user.email = 'after@example.com';
    const updated = (await (await verified('/app/account')).json()) as CustomerProfile;
    expect(updated.id).toBe(initial.id);
    expect(updated.email).toBe('after@example.com');
    auth.user.email = 'sara@example.com';
    expect((await verified('/app/account')).status).toBe(409);
    expect((await repository.getUser(initial.id))?.email).toBe('after@example.com');
  });

  it('keeps Studio membership independent when a member explicitly creates a customer account', async () => {
    auth.user = {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'studio@mukhtalif.net',
      email_confirmed_at: new Date().toISOString(),
    };
    const before = await repository.getStudioMemberByAuthId(auth.user.id);
    expect((await verified('/app/library')).status).toBe(403);
    const result = await verified('/app/account', 'POST', { displayName: 'حسابي الشخصي' });
    expect(result.status).toBe(200);
    expect(await repository.getStudioMemberByAuthId(auth.user.id)).toEqual(before);
    expect((await verified('/app/library')).status).toBe(200);
    expect((await verified('/studio/me')).status).toBe(200);
  });
});

describe('private customer profile and library', () => {
  it('allows removing/reordering existing unavailable items without adding unpublished episodes', async () => {
    const now = new Date().toISOString();
    await repository.mutateCustomerLibrary('usr-listener-1', (document) => {
      document.playlists = [
        {
          id: 'previous-playlist',
          name: 'قائمة سابقة',
          description: '',
          episodeIds: ['ep-1003', 'ep-2002', 'ep-1001'],
          createdAt: now,
          updatedAt: now,
        },
      ];
      document.queueEpisodeIds = ['ep-1003', 'ep-2002', 'ep-1001'];
    });
    const list = await library(
      await request('/app/library/playlists/previous-playlist', 'PATCH', {
        episodeIds: ['ep-1001', 'ep-2002'],
      }),
    );
    expect(list.playlists[0].episodeIds).toEqual(['ep-1001', 'ep-2002']);
    expect(
      (
        await request('/app/library/playlists/previous-playlist', 'PATCH', {
          episodeIds: ['ep-2002', 'ep-1003'],
        })
      ).status,
    ).toBe(404);
    const queue = await library(
      await request('/app/library/queue', 'PUT', { episodeIds: ['ep-2002', 'ep-1001'] }),
    );
    expect(queue.queueEpisodeIds).toEqual(['ep-2002', 'ep-1001']);
    expect(
      (await request('/app/library/queue', 'PUT', { episodeIds: ['ep-2002', 'ep-1003'] })).status,
    ).toBe(404);
  });
  it('validates private profile fields and leaves another account unchanged', async () => {
    const before = await repository.getCustomerProfile('usr-listener-2');
    const result = await request('/app/account', 'PATCH', {
      gender: 'female',
      birthDate: '1994-02-28',
      interests: ['كتب', 'عمل', 'كتب'],
      onboarded: true,
    });
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({
      gender: 'female',
      birthDate: '1994-02-28',
      interests: ['كتب', 'عمل'],
      onboarded: true,
    });
    expect(await repository.getCustomerProfile('usr-listener-2')).toEqual(before);
    for (const birthDate of ['1994-02-31', '2999-01-01', '1899-01-01', 'not-a-date']) {
      expect((await request('/app/account', 'PATCH', { birthDate })).status).toBe(400);
    }
    expect((await request('/app/account', 'PATCH', { birthDate: null, gender: null })).status).toBe(
      200,
    );
  });

  it('saves and removes published episodes/articles idempotently with owner isolation', async () => {
    await request('/app/library/saved/episodes/ep-1001', 'PUT');
    const saved = await library(await request('/app/library/saved/episodes/ep-1001', 'PUT'));
    expect(saved.savedEpisodeIds).toEqual(['ep-1001']);
    expect(
      (await library(await request('/app/library', 'GET', undefined, 'usr-listener-2')))
        .savedEpisodeIds,
    ).toEqual([]);
    expect(
      (await library(await request('/app/library/saved/articles/art-1', 'PUT'))).savedArticleIds,
    ).toEqual(['art-1']);
    expect((await request('/app/library/saved/articles/art-2', 'PUT')).status).toBe(404);
    expect((await request('/app/library/saved/episodes/ep-1003', 'PUT')).status).toBe(404);
    const deleted = await library(await request('/app/library/saved/episodes/ep-1001', 'DELETE'));
    expect(deleted.savedEpisodeIds).toEqual([]);
    expect((await request('/app/library/saved/episodes/ep-1001', 'DELETE')).status).toBe(200);
  });

  it('creates, reorders, renames and deletes playlists without cross-account access', async () => {
    const created = await library(
      await request('/app/library/playlists', 'POST', { name: 'لوقت الطريق' }),
    );
    const id = created.playlists[0].id;
    expect(
      (
        await request(
          `/app/library/playlists/${id}`,
          'PATCH',
          { name: 'اسم غير مصرح' },
          'usr-listener-2',
        )
      ).status,
    ).toBe(404);
    expect(
      (await request(`/app/library/playlists/${id}`, 'DELETE', undefined, 'usr-listener-2')).status,
    ).toBe(404);
    await request(`/app/library/playlists/${id}`, 'PATCH', { episodeIds: ['ep-1001', 'ep-1002'] });
    const reordered = await library(
      await request(`/app/library/playlists/${id}`, 'PATCH', {
        name: 'قائمتي',
        description: 'حلقتان للطريق',
        episodeIds: ['ep-1002', 'ep-1001'],
      }),
    );
    expect(reordered.playlists[0]).toMatchObject({
      name: 'قائمتي',
      description: 'حلقتان للطريق',
      episodeIds: ['ep-1002', 'ep-1001'],
    });
    expect(
      (await request(`/app/library/playlists/${id}`, 'PATCH', { episodeIds: ['ep-1003'] })).status,
    ).toBe(404);
    expect(
      (
        await request(`/app/library/playlists/${id}`, 'PATCH', {
          episodeIds: ['ep-1001', 'ep-1001'],
        })
      ).status,
    ).toBe(400);
    expect(
      (await library(await request(`/app/library/playlists/${id}`, 'DELETE'))).playlists,
    ).toEqual([]);
  });

  it('validates bookmarks and supports owner-only editing and removal', async () => {
    const created = await library(
      await request('/app/library/bookmarks', 'POST', {
        episodeId: 'ep-1001',
        positionSec: 130,
        label: 'فكرة مفيدة',
      }),
    );
    const id = created.bookmarks[0].id;
    expect(
      (await request(`/app/library/bookmarks/${id}`, 'PATCH', { label: 'لا' }, 'usr-listener-2'))
        .status,
    ).toBe(404);
    expect(
      (await request(`/app/library/bookmarks/${id}`, 'DELETE', undefined, 'usr-listener-2')).status,
    ).toBe(404);
    const edited = await library(
      await request(`/app/library/bookmarks/${id}`, 'PATCH', { label: 'أرجع لهذه الفكرة' }),
    );
    expect(edited.bookmarks[0].label).toBe('أرجع لهذه الفكرة');
    expect(
      (
        await request('/app/library/bookmarks', 'POST', {
          episodeId: 'ep-1001',
          positionSec: 999999,
        })
      ).status,
    ).toBe(400);
    expect(
      (await request('/app/library/bookmarks', 'POST', { episodeId: 'ep-1001', positionSec: 3000 }))
        .status,
    ).toBe(422);
    expect(
      (await library(await request(`/app/library/bookmarks/${id}`, 'DELETE'))).bookmarks,
    ).toEqual([]);
  });

  it('persists an ordered queue and rejects draft, duplicate and oversized entries', async () => {
    const queued = await library(
      await request('/app/library/queue', 'PUT', { episodeIds: ['ep-1002', 'ep-1001'] }),
    );
    expect(queued.queueEpisodeIds).toEqual(['ep-1002', 'ep-1001']);
    expect((await request('/app/library/queue', 'PUT', { episodeIds: ['ep-1003'] })).status).toBe(
      404,
    );
    expect(
      (await request('/app/library/queue', 'PUT', { episodeIds: ['ep-1001', 'ep-1001'] })).status,
    ).toBe(400);
    expect(
      (
        await request('/app/library/queue', 'PUT', {
          episodeIds: Array.from({ length: 201 }, (_, n) => `ep-${n}`),
        })
      ).status,
    ).toBe(400);
    expect(
      (await library(await request('/app/library', 'GET', undefined, 'usr-listener-2')))
        .queueEpisodeIds,
    ).toEqual([]);
  });

  it('shares follow/progress state with existing routes and clears history independently', async () => {
    await request('/app/library/follows/shw-petroly', 'PUT');
    expect(((await (await request('/app/follows')).json()) as { showId: string }[])[0].showId).toBe(
      'shw-petroly',
    );
    await request('/app/library/progress', 'PUT', { episodeId: 'ep-1001', positionSec: 100 });
    await request('/app/progress', 'PUT', { episodeId: 'ep-1002', positionSec: 20 });
    expect((await library(await request('/app/library'))).progress).toHaveLength(2);
    expect(
      (await request('/app/progress', 'PUT', { episodeId: 'ep-1003', positionSec: 0 })).status,
    ).toBe(422);
    expect(
      (await request('/app/library/progress', 'PUT', { episodeId: 'ep-1001', positionSec: 9999 }))
        .status,
    ).toBe(422);
    const one = await library(await request('/app/library/progress/ep-1001', 'DELETE'));
    expect(one.progress.map((item) => item.episodeId)).toEqual(['ep-1002']);
    const none = await library(await request('/app/library/progress', 'DELETE'));
    expect(none.progress).toEqual([]);
    expect(none.followedShowIds).toEqual(['shw-petroly']);
  });

  it('clears the current library across all domains and preserves other users and profile', async () => {
    await request('/app/library/follows/shw-petroly', 'PUT');
    await request('/app/library/progress', 'PUT', { episodeId: 'ep-1001', positionSec: 100 });
    await request('/app/library/saved/episodes/ep-1001', 'PUT');
    await request('/app/library/playlists', 'POST', { name: 'قائمتي' });
    await request('/app/library/bookmarks', 'POST', { episodeId: 'ep-1001', positionSec: 2 });
    await request('/app/library/queue', 'PUT', { episodeIds: ['ep-1001'] });
    await request('/app/library/saved/episodes/ep-1002', 'PUT', undefined, 'usr-listener-2');
    const profile = await repository.getCustomerProfile('usr-listener-1');
    const cleared = await library(await request('/app/library', 'DELETE'));
    for (const value of Object.values(cleared)) expect(value).toEqual([]);
    expect(await repository.getCustomerProfile('usr-listener-1')).toEqual(profile);
    expect(
      (await library(await request('/app/library', 'GET', undefined, 'usr-listener-2')))
        .savedEpisodeIds,
    ).toEqual(['ep-1002']);
  });

  it('rejects library writes with forged user IDs and enforces storage limits atomically', async () => {
    expect(
      (await request('/app/library/queue', 'PUT', { episodeIds: [], userId: 'usr-listener-2' }))
        .status,
    ).toBe(400);
    await expect(
      repository.mutateCustomerLibrary('usr-listener-1', (document) => {
        document.savedEpisodeIds = Array.from({ length: 2001 }, (_, n) => `ep-${n}`);
      }),
    ).rejects.toThrow('Library limit reached');
    expect((await repository.getCustomerLibraryDocument('usr-listener-1')).savedEpisodeIds).toEqual(
      [],
    );
  });
});
