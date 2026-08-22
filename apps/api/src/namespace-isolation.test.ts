import { describe, expect, it } from 'vitest';
import type { Env } from './env';
import app from './index';

/**
 * Enumerates every mounted handler and asserts the namespace boundary holds for
 * all of them.
 *
 * These tests read the route table rather than a hand-written list, so a new
 * endpoint is covered the moment it is mounted. A route that forgets its guard
 * fails here instead of shipping.
 */
const localEnv: Env = {
  APP_ENV: 'development',
  ALLOW_DEV_AUTH: 'true',
  CORS_ALLOWED_ORIGINS: 'http://localhost:3001',
};

interface Route {
  method: string;
  path: string;
}

const ROUTES: Route[] = [
  ...new Map(
    (app as unknown as { routes: Route[] }).routes
      .filter((route) => route.method !== 'ALL')
      .map((route) => [`${route.method} ${route.path}`, route]),
  ).values(),
];

/** The service index is metadata, not a namespace member. */
const INDEX = 'GET /';

const studioRoutes = ROUTES.filter((route) => route.path.startsWith('/studio/'));
const appRoutes = ROUTES.filter((route) => route.path.startsWith('/app/'));
const publicRoutes = ROUTES.filter(
  (route) =>
    !route.path.startsWith('/studio/') &&
    !route.path.startsWith('/app/') &&
    `${route.method} ${route.path}` !== INDEX,
);

/** Substitutes a placeholder for every path parameter. */
function concrete(path: string): string {
  return path.replace(/:[A-Za-z0-9_]+/g, 'placeholder');
}

function request(route: Route, identityId?: string) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (identityId) headers.set('x-dev-user', identityId);
  const method = route.method === 'HEAD' ? 'HEAD' : route.method;
  const sendsBody = ['POST', 'PUT', 'PATCH'].includes(method);
  return app.request(
    concrete(route.path),
    { method, headers, body: sendsBody ? '{}' : undefined },
    localEnv,
  );
}

describe('route table', () => {
  it('mounts every handler in exactly one namespace', () => {
    expect(ROUTES.length).toBeGreaterThan(50);
    const stray = ROUTES.filter(
      (route) => route.path.includes('/studio/') && !route.path.startsWith('/studio/'),
    );
    expect(stray).toEqual([]);
    // Each list is disjoint by construction; assert none is empty so a
    // refactor that drops a whole namespace cannot pass silently.
    expect(studioRoutes.length).toBeGreaterThan(0);
    expect(appRoutes.length).toBeGreaterThan(0);
    expect(publicRoutes.length).toBeGreaterThan(0);
    expect(studioRoutes.length + appRoutes.length + publicRoutes.length).toBe(ROUTES.length - 1);
  });

  it('gives every path exactly one namespace prefix', () => {
    // A duplicate-registration check is not derivable from the route table:
    // Hono lists each middleware in a chain as its own entry, so a validator
    // plus a handler already share one method and path. What is checkable — and
    // what actually matters — is that no path sits under two prefixes, and that
    // every path is claimed by exactly one namespace. The behavioural tests
    // below then prove each namespace enforces its own rule.
    for (const route of ROUTES) {
      if (`${route.method} ${route.path}` === INDEX) continue;
      const prefixes = ['/studio/', '/app/'].filter((prefix) =>
        route.path.startsWith(prefix),
      );
      expect(prefixes.length, `${route.path} claims ${prefixes.length} namespaces`).toBeLessThan(2);
      // A namespace prefix may never appear anywhere but the start, which is
      // what would let /articles/studio/... slip past the guards.
      expect(route.path.indexOf('/studio/'), route.path).toBeLessThan(1);
      expect(route.path.indexOf('/app/'), route.path).toBeLessThan(1);
    }
  });

  it('exposes no mutating handler in the public namespace', () => {
    const mutations = publicRoutes.filter(
      (route) => !['GET', 'HEAD'].includes(route.method),
    );
    // A write cannot reach the anonymous catalogue: there is no handler to
    // authorize against, so it 404s rather than being refused.
    expect(mutations).toEqual([]);
  });
});

describe('studio namespace', () => {
  it.each(studioRoutes.map((route) => [`${route.method} ${route.path}`, route] as const))(
    'refuses an anonymous caller on %s',
    async (_label, route) => {
      const response = await request(route);
      expect(response.status).toBe(401);
    },
  );

  /**
   * Invitation acceptance is the deliberate exception. It authenticates on the
   * verified Auth identity rather than Studio membership, because an invitee
   * holds none until they accept — refusing a non-member there would make the
   * flow impossible. It is asserted separately below.
   */
  const membershipGated = studioRoutes.filter(
    (route) => !route.path.startsWith('/studio/invitations'),
  );

  it.each(membershipGated.map((route) => [`${route.method} ${route.path}`, route] as const))(
    'refuses an application-only identity on %s',
    async (_label, route) => {
      // usr-listener-1 has an app profile and no Studio membership.
      const response = await request(route, 'usr-listener-1');
      expect(response.status).toBe(403);
    },
  );

  it('tells an application-only identity it has no invitation, and nothing else', async () => {
    const response = await app.request(
      '/studio/invitations/me',
      { headers: { 'x-dev-user': 'usr-listener-1' } },
      localEnv,
    );
    expect(response.status).toBe(200);
    // The only safe answer: it reveals nothing the caller did not already know
    // about themselves, and names no Studio member, role, or permission.
    expect(await response.json()).toEqual({ status: 'none' });
  });

  it('refuses to accept an invitation for an identity that has none', async () => {
    const response = await app.request(
      '/studio/invitations/accept',
      {
        method: 'POST',
        headers: { 'x-dev-user': 'usr-listener-1', 'content-type': 'application/json' },
        body: JSON.stringify({ password: 'a-long-enough-passphrase' }),
      },
      localEnv,
    );
    expect(response.status).toBe(403);
    expect((await response.json()) as { code: string }).toMatchObject({ code: 'NO_INVITATION' });
  });
});

describe('listener namespace', () => {
  it.each(appRoutes.map((route) => [`${route.method} ${route.path}`, route] as const))(
    'refuses an anonymous caller on %s',
    async (_label, route) => {
      const response = await request(route);
      expect(response.status).toBe(401);
    },
  );

  it.each(appRoutes.map((route) => [`${route.method} ${route.path}`, route] as const))(
    'refuses a Studio-only identity on %s',
    async (_label, route) => {
      // usr-admin-1 operates the Studio and has no application profile.
      const response = await request(route, 'usr-admin-1');
      expect(response.status).toBe(403);
    },
  );
});

describe('public namespace', () => {
  it.each(publicRoutes.map((route) => [`${route.method} ${route.path}`, route] as const))(
    'serves %s without authentication',
    async (_label, route) => {
      const response = await request(route);
      // 404 is a legitimate answer for a placeholder identifier; 401 and 403
      // are not, because nothing here may require a caller.
      expect([200, 206, 302, 404, 416]).toContain(response.status);
    },
  );

  it('leaks no Studio-only field through any public read', async () => {
    const forbidden = [
      'audioKey',
      'storageKey',
      'authUserId',
      'auth_user_id',
      'syncToken',
      'sendToken',
      'campaignId',
      'needsSync',
      'service_role',
    ];
    for (const path of ['/home', '/shows', '/episodes', '/articles', '/plans']) {
      const body = await (await app.request(path, {}, localEnv)).text();
      for (const field of forbidden) {
        expect(body, `${path} exposed ${field}`).not.toContain(field);
      }
    }
  });

  it('never widens a public read for a caller who holds Studio permissions', async () => {
    for (const identityId of [undefined, 'usr-listener-1', 'usr-editor-1', 'usr-admin-1']) {
      const headers = new Headers();
      if (identityId) headers.set('x-dev-user', identityId);
      const episodes = (await (
        await app.request('/episodes?status=draft', { headers }, localEnv)
      ).json()) as { status: string }[];
      expect(episodes.every((episode) => episode.status === 'published')).toBe(true);
    }
  });
});
