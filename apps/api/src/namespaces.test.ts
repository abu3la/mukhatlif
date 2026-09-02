import { describe, expect, it } from 'vitest';
import { CLIENT_SURFACE_HEADER } from '@mukhtalif/types';
import type { Env } from './env';
import app from './index';

const localEnv: Env = {
  APP_ENV: 'development',
  ALLOW_DEV_AUTH: 'true',
  CORS_ALLOWED_ORIGINS: 'http://localhost:3001',
};

const jsonHeaders = { 'content-type': 'application/json' };

function request(
  path: string,
  options: { identityId?: string; surface?: string; method?: string; body?: string } = {},
) {
  const headers = new Headers();
  if (options.identityId) headers.set('x-dev-user', options.identityId);
  if (options.surface) headers.set(CLIENT_SURFACE_HEADER, options.surface);
  if (options.body) headers.set('content-type', jsonHeaders['content-type']);
  return app.request(path, { method: options.method ?? 'GET', headers, body: options.body }, localEnv);
}

describe('namespace separation', () => {
  it('serves the public catalogue anonymously', async () => {
    for (const path of ['/home', '/shows', '/episodes', '/articles', '/plans']) {
      expect((await request(path)).status).toBe(200);
    }
  });

  it('keeps the public catalogue published-only regardless of who is asking', async () => {
    // The old combined route widened for a caller holding episodes.view. An
    // operator browsing the public site must never be shown a draft there.
    for (const identityId of [undefined, 'usr-listener-1', 'usr-editor-1', 'usr-admin-1']) {
      const episodes = (await (
        await request('/episodes?status=draft', { identityId })
      ).json()) as { status: string }[];
      expect(episodes.every((episode) => episode.status === 'published')).toBe(true);
    }
  });

  it('exposes no mutating handler on the public catalogue', async () => {
    const writes = [
      { path: '/shows', method: 'POST' },
      { path: '/episodes', method: 'POST' },
      { path: '/articles', method: 'POST' },
    ];
    for (const write of writes) {
      const response = await request(write.path, {
        identityId: 'usr-admin-1',
        method: write.method,
        body: '{}',
      });
      // 404, not 403: there is no handler to authorize against.
      expect(response.status).toBe(404);
    }
  });

  it('requires an application user on the listener namespace', async () => {
    expect((await request('/app/me')).status).toBe(401);
    expect((await request('/app/me', { identityId: 'usr-listener-1' })).status).toBe(200);
    // A Studio member is not an application user.
    expect((await request('/app/me', { identityId: 'usr-admin-1' })).status).toBe(403);
  });

  it('requires Studio membership on the studio namespace', async () => {
    expect((await request('/studio/episodes')).status).toBe(401);
    expect((await request('/studio/episodes', { identityId: 'usr-listener-1' })).status).toBe(403);
    expect((await request('/studio/episodes', { identityId: 'usr-editor-1' })).status).toBe(200);
  });

  it('no longer serves the pre-split paths', async () => {
    for (const path of ['/me', '/follows', '/progress', '/studio-members', '/roles', '/audit-logs']) {
      expect((await request(path, { identityId: 'usr-admin-1' })).status).toBe(404);
    }
  });

  it('describes its namespaces at the service root', async () => {
    const index = (await (await request('/')).json()) as {
      namespaces: Record<string, { surfaces: string[] }>;
    };
    expect(Object.keys(index.namespaces)).toEqual(['public', 'app', 'studio']);
    expect(index.namespaces.studio.surfaces).toEqual(['studio']);
  });
});

describe('client surface', () => {
  it('is optional, so a client can adopt the header independently', async () => {
    expect((await request('/studio/episodes', { identityId: 'usr-editor-1' })).status).toBe(200);
    expect((await request('/app/me', { identityId: 'usr-listener-1' })).status).toBe(200);
  });

  it('accepts the surface that owns each namespace', async () => {
    expect(
      (await request('/studio/episodes', { identityId: 'usr-editor-1', surface: 'studio' })).status,
    ).toBe(200);
    for (const surface of ['web', 'mobile']) {
      expect(
        (await request('/app/me', { identityId: 'usr-listener-1', surface })).status,
      ).toBe(200);
    }
  });

  it('refuses a listener surface on a studio path before any permission check', async () => {
    for (const surface of ['web', 'mobile']) {
      const response = await request('/studio/episodes', {
        identityId: 'usr-admin-1',
        surface,
      });
      expect(response.status).toBe(403);
      expect((await response.json()) as { code: string }).toMatchObject({
        code: 'SURFACE_NOT_ALLOWED',
      });
    }
  });

  it('refuses the studio surface on a listener path', async () => {
    const response = await request('/app/me', {
      identityId: 'usr-listener-1',
      surface: 'studio',
    });
    expect(response.status).toBe(403);
  });

  it('lets every surface read the public catalogue', async () => {
    for (const surface of ['web', 'mobile', 'studio']) {
      expect((await request('/shows', { surface })).status).toBe(200);
    }
  });

  it('rejects an unrecognised surface rather than ignoring the typo', async () => {
    const response = await request('/shows', { surface: 'desktop' });
    expect(response.status).toBe(400);
    expect((await response.json()) as { code: string }).toMatchObject({
      code: 'UNKNOWN_CLIENT_SURFACE',
    });
  });

  it('matches the header case-insensitively', async () => {
    expect((await request('/shows', { surface: 'WEB' })).status).toBe(200);
  });
});
