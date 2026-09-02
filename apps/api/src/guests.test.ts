import { describe, expect, it } from 'vitest';
import type { Guest, GuestDirectory, GuestSocial, PaginatedList } from '@mukhtalif/types';
import type { Env } from './env';
import app from './index';

const localEnv: Env = {
  APP_ENV: 'development',
  ALLOW_DEV_AUTH: 'true',
  CORS_ALLOWED_ORIGINS: 'http://localhost:3001',
};

const jsonHeaders = { 'Content-Type': 'application/json' };

function request(
  path: string,
  identityId?: string,
  init: Omit<RequestInit, 'headers'> & { headers?: HeadersInit } = {},
) {
  const headers = new Headers(init.headers);
  if (identityId) headers.set('x-dev-user', identityId);
  return app.request(path, { ...init, headers }, localEnv);
}

const post = (path: string, identityId: string | undefined, body: unknown) =>
  request(path, identityId, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(body) });

const patch = (path: string, identityId: string | undefined, body: unknown) =>
  request(path, identityId, { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify(body) });

async function createGuest(name?: string): Promise<Guest> {
  const response = await post('/studio/guests', 'usr-admin-1', name === undefined ? {} : { name });
  expect(response.status).toBe(201);
  return (await response.json()) as Guest;
}

describe('guest authorization', () => {
  it('denies an anonymous caller', async () => {
    expect((await request('/studio/guests')).status).toBe(401);
  });

  it('denies an application user who has no Studio membership', async () => {
    expect((await request('/studio/guests', 'usr-listener-1')).status).toBe(403);
  });

  it('allows an editor to read and manage guests', async () => {
    expect((await request('/studio/guests', 'usr-editor-1')).status).toBe(200);
    const created = await post('/studio/guests', 'usr-editor-1', { name: 'ضيف المحرر' });
    expect(created.status).toBe(201);
  });

  it('rejects every guest mutation for a caller without guests.manage', async () => {
    const guest = await createGuest('ضيف الصلاحيات');
    const denials = await Promise.all([
      post('/studio/guests', 'usr-listener-1', {}),
      patch(`/studio/guests/${guest.id}`, 'usr-listener-1', { name: 'x' }),
      post(`/studio/guests/${guest.id}/socials`, 'usr-listener-1', {
        platform: 'x',
        handle: 'a',
      }),
      request(`/studio/guests/${guest.id}/appearances/ep-1001`, 'usr-listener-1', {
        method: 'DELETE',
      }),
    ]);
    for (const response of denials) expect(response.status).toBe(403);
  });
});

describe('guest records', () => {
  it('creates a blank guest with a generated slug that satisfies the stored format', async () => {
    const guest = await createGuest();
    expect(guest.name).toBe('');
    expect(guest.bio).toBe('');
    expect(guest.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('derives distinct slugs for two guests sharing one Latin name', async () => {
    const first = await createGuest('Layla Otaibi');
    const second = await createGuest('Layla Otaibi');
    expect(first.slug).toBe('layla-otaibi');
    expect(second.slug).not.toBe(first.slug);
    expect(second.slug).toMatch(/^layla-otaibi-[0-9a-f]{6}$/);
  });

  it('rejects a duplicate explicit slug', async () => {
    await post('/studio/guests', 'usr-admin-1', { slug: 'fixed-slug' });
    const duplicate = await post('/studio/guests', 'usr-admin-1', { slug: 'fixed-slug' });
    expect(duplicate.status).toBe(422);
  });

  it('updates only the supplied fields and leaves the slug server-owned', async () => {
    const guest = await createGuest('مها السبيعي');
    const response = await patch(`/studio/guests/${guest.id}`, 'usr-admin-1', {
      role: 'محللة بيانات',
      city: 'جدة',
    });
    expect(response.status).toBe(200);
    const updated = (await response.json()) as Guest;
    expect(updated).toMatchObject({
      name: 'مها السبيعي',
      role: 'محللة بيانات',
      city: 'جدة',
      slug: guest.slug,
    });
  });

  it('rejects an attempt to rewrite the slug through an update', async () => {
    const guest = await createGuest('سلمان');
    const response = await patch(`/studio/guests/${guest.id}`, 'usr-admin-1', {
      slug: 'rewritten',
    });
    expect(response.status).toBe(400);
  });

  it('returns 404 for an unknown guest', async () => {
    expect((await request('/studio/guests/gst-missing', 'usr-admin-1')).status).toBe(404);
  });
});

describe('guest social links', () => {
  it('creates, updates, and deletes a link', async () => {
    const guest = await createGuest('رابط اجتماعي');
    const created = await post(`/studio/guests/${guest.id}/socials`, 'usr-admin-1', {
      platform: 'linkedin',
      handle: 'social-handle',
    });
    expect(created.status).toBe(201);
    const social = (await created.json()) as GuestSocial;
    expect(social).toMatchObject({ guestId: guest.id, platform: 'linkedin' });

    const updated = await patch(`/studio/guests/socials/${social.id}`, 'usr-admin-1', {
      handle: 'updated-handle',
    });
    expect(updated.status).toBe(200);
    expect(((await updated.json()) as GuestSocial).handle).toBe('updated-handle');

    const removed = await request(`/studio/guests/socials/${social.id}`, 'usr-admin-1', {
      method: 'DELETE',
    });
    expect(removed.status).toBe(204);
    expect(
      (await request(`/studio/guests/socials/${social.id}`, 'usr-admin-1', { method: 'DELETE' }))
        .status,
    ).toBe(404);
  });

  it('rejects a second link for the same platform on one guest', async () => {
    const guest = await createGuest('منصة مكررة');
    const body = { platform: 'x' as const, handle: 'first' };
    expect((await post(`/studio/guests/${guest.id}/socials`, 'usr-admin-1', body)).status).toBe(201);
    const duplicate = await post(`/studio/guests/${guest.id}/socials`, 'usr-admin-1', {
      platform: 'x',
      handle: 'second',
    });
    expect(duplicate.status).toBe(422);
  });

  it('rejects an unknown platform and an empty handle', async () => {
    const guest = await createGuest('تحقق');
    expect(
      (await post(`/studio/guests/${guest.id}/socials`, 'usr-admin-1', {
        platform: 'tiktok',
        handle: 'a',
      })).status,
    ).toBe(400);
    expect(
      (await post(`/studio/guests/${guest.id}/socials`, 'usr-admin-1', {
        platform: 'x',
        handle: '   ',
      })).status,
    ).toBe(400);
  });

  it('returns 404 when linking a social account to an unknown guest', async () => {
    const response = await post('/studio/guests/gst-missing/socials', 'usr-admin-1', {
      platform: 'website',
      handle: 'example.com',
    });
    expect(response.status).toBe(404);
  });
});

describe('guest appearances', () => {
  it('links a guest to an episode idempotently and unlinks once', async () => {
    const guest = await createGuest('ضيف الحلقة');
    const first = await post(`/studio/guests/${guest.id}/appearances`, 'usr-admin-1', {
      episodeId: 'ep-1002',
    });
    expect(first.status).toBe(201);

    const repeat = await post(`/studio/guests/${guest.id}/appearances`, 'usr-admin-1', {
      episodeId: 'ep-1002',
    });
    expect(repeat.status).toBe(200);

    const appearances = await request(`/studio/guests/${guest.id}/appearances`, 'usr-admin-1');
    expect(await appearances.json()).toEqual([{ guestId: guest.id, episodeId: 'ep-1002' }]);

    const removed = await request(
      `/studio/guests/${guest.id}/appearances/ep-1002`,
      'usr-admin-1',
      { method: 'DELETE' },
    );
    expect(removed.status).toBe(204);
    expect(
      (await request(`/studio/guests/${guest.id}/appearances/ep-1002`, 'usr-admin-1', {
        method: 'DELETE',
      })).status,
    ).toBe(404);
  });

  it('rejects an unknown episode with 422 and an unknown guest with 404', async () => {
    const guest = await createGuest('مرجع مفقود');
    expect(
      (await post(`/studio/guests/${guest.id}/appearances`, 'usr-admin-1', {
        episodeId: 'ep-missing',
      })).status,
    ).toBe(422);
    expect(
      (await post('/studio/guests/gst-missing/appearances', 'usr-admin-1', {
        episodeId: 'ep-1002',
      })).status,
    ).toBe(404);
  });
});

describe('guest directory and paging', () => {
  it('returns the whole directory when no paging parameter is supplied', async () => {
    const response = await request('/studio/guests', 'usr-admin-1');
    const directory = (await response.json()) as GuestDirectory;
    expect(Array.isArray(directory.guests)).toBe(true);
    expect(Array.isArray(directory.socials)).toBe(true);
    expect(Array.isArray(directory.appearances)).toBe(true);
  });

  it('returns the paginated envelope once a paging parameter is supplied', async () => {
    const response = await request('/studio/guests?page=1&perPage=1', 'usr-admin-1');
    const page = (await response.json()) as PaginatedList<Guest>;
    expect(page.items).toHaveLength(1);
    expect(page.pageInfo.perPage).toBe(1);
    expect(page.pageInfo.total).toBeGreaterThan(0);
    expect(page.pageInfo.hasPreviousPage).toBe(false);
  });

  it('searches guests by name', async () => {
    await createGuest('Zubaida Almutairi');
    const response = await request(
      '/studio/guests?page=1&perPage=10&search=Zubaida',
      'usr-admin-1',
    );
    const page = (await response.json()) as PaginatedList<Guest>;
    expect(page.pageInfo.total).toBe(1);
    expect(page.items[0].name).toBe('Zubaida Almutairi');
  });
});
