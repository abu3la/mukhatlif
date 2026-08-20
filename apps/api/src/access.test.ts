import { describe, expect, it } from 'vitest';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSION_IDS } from '@mukhtalif/types';
import { getStudioInviteRedirectUrl, type Env } from './env';
import app from './index';
import { createMemoryRepository } from './repo/memory';

const localEnv: Env = {
  APP_ENV: 'development',
  ALLOW_DEV_AUTH: 'true',
  CORS_ALLOWED_ORIGINS: 'http://localhost:3001,https://admin.mukhtalif.test',
};

function request(
  path: string,
  identityId?: string,
  init: Omit<RequestInit, 'headers'> & { headers?: HeadersInit } = {},
  env: Env = localEnv,
) {
  const headers = new Headers(init.headers);
  if (identityId) headers.set('x-dev-user', identityId);
  return app.request(path, { ...init, headers }, env);
}

const jsonHeaders = { 'Content-Type': 'application/json' };

describe('authentication configuration', () => {
  it('fails closed when Supabase is absent outside explicitly enabled local development', async () => {
    const response = await request(
      '/studio/me',
      'usr-admin-1',
      {},
      {
        APP_ENV: 'production',
        ALLOW_DEV_AUTH: 'true',
        CORS_ALLOWED_ORIGINS: 'https://admin.mukhtalif.test',
      },
    );
    expect(response.status).toBe(503);
  });

  it('fails closed when only one Supabase credential is configured', async () => {
    const response = await request('/studio/me', undefined, {}, {
      ...localEnv,
      SUPABASE_URL: 'https://project.supabase.co',
    });
    expect(response.status).toBe(503);
  });

  it('resolves app users and Studio members independently by immutable Auth UUID', async () => {
    const repository = createMemoryRepository();
    const editorAuthId = '22222222-2222-4222-8222-222222222222';
    const listenerAuthId = '33333333-3333-4333-8333-333333333333';

    await expect(repository.getStudioMemberByAuthId(editorAuthId)).resolves.toMatchObject({
      id: 'usr-editor-1',
      role: 'editor',
    });
    await expect(repository.getUserByAuthId(editorAuthId)).resolves.toBeNull();
    await expect(repository.getUserByAuthId(listenerAuthId)).resolves.toMatchObject({
      id: 'usr-listener-1',
    });
    await expect(repository.getStudioMemberByAuthId(listenerAuthId)).resolves.toBeNull();
  });

  it('accepts only an explicit safe invitation redirect URL', () => {
    expect(
      getStudioInviteRedirectUrl({
        APP_ENV: 'production',
        STUDIO_INVITE_REDIRECT_URL: 'https://admin.mukhtalif.net/login?invited=true',
      }),
    ).toBe('https://admin.mukhtalif.net/login?invited=true');
    expect(
      getStudioInviteRedirectUrl({
        APP_ENV: 'development',
        STUDIO_INVITE_REDIRECT_URL: 'http://localhost:3001/login',
      }),
    ).toBe('http://localhost:3001/login');
    expect(() =>
      getStudioInviteRedirectUrl({
        APP_ENV: 'production',
        STUDIO_INVITE_REDIRECT_URL: 'http://admin.mukhtalif.net/login',
      }),
    ).toThrow('must use HTTPS');
    expect(() =>
      getStudioInviteRedirectUrl({
        APP_ENV: 'development',
        STUDIO_INVITE_REDIRECT_URL: 'https://user:password@example.com/login',
      }),
    ).toThrow('without credentials');
  });
});

describe('CORS allowlist', () => {
  it('allows configured origins and rejects all other browser origins', async () => {
    const allowed = await request('/', undefined, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:3001',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'Authorization',
      },
    });
    const rejected = await request('/', undefined, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://attacker.example',
        'Access-Control-Request-Method': 'GET',
      },
    });

    expect(allowed.headers.get('access-control-allow-origin')).toBe('http://localhost:3001');
    expect(rejected.headers.has('access-control-allow-origin')).toBe(false);
  });
});

describe('independent app and Studio identities', () => {
  it('lets Studio editors see drafts while app users remain limited to published content', async () => {
    // Drafts live in the Studio namespace. The public catalogue is
    // published-only unconditionally, so the same query cannot widen for an
    // editor who happens to be signed in while browsing the public site.
    const editorResponse = await request('/studio/episodes?status=draft', 'usr-editor-1');
    const listenerResponse = await request('/episodes?status=draft', 'usr-listener-1');
    const editorEpisodes = (await editorResponse.json()) as Array<{ status: string }>;
    const listenerEpisodes = (await listenerResponse.json()) as Array<{ status: string }>;

    expect(editorEpisodes.some((episode) => episode.status === 'draft')).toBe(true);
    expect(listenerEpisodes.every((episode) => episode.status === 'published')).toBe(true);

    // The public path stays published-only even for the editor themselves.
    const editorOnPublic = await request('/episodes?status=draft', 'usr-editor-1');
    const publicEpisodes = (await editorOnPublic.json()) as Array<{ status: string }>;
    expect(publicEpisodes.every((episode) => episode.status === 'published')).toBe(true);
  });

  it('never grants an app-only Auth identity Studio membership or permissions', async () => {
    const appMeResponse = await request('/app/me', 'usr-listener-1');
    const studioMeResponse = await request('/studio/me', 'usr-listener-1');
    const rolesResponse = await request('/studio/roles', 'usr-listener-1');
    const appProfile = (await appMeResponse.json()) as Record<string, unknown>;

    expect(appMeResponse.status).toBe(200);
    expect(appProfile).toMatchObject({ id: 'usr-listener-1', email: 'sara@example.com' });
    expect(appProfile).not.toHaveProperty('role');
    expect(appProfile).not.toHaveProperty('permissions');
    expect(studioMeResponse.status).toBe(403);
    expect(await studioMeResponse.json()).toEqual({
      error: 'Studio membership is not provisioned',
    });
    expect(rolesResponse.status).toBe(403);
  });

  it('keeps the Studio directory separate from app subscribers', async () => {
    const membersResponse = await request('/studio/members', 'usr-admin-1');
    const subscribersResponse = await request('/studio/subscribers', 'usr-admin-1');
    const members = (await membersResponse.json()) as Array<Record<string, unknown>>;
    const subscribers = (await subscribersResponse.json()) as Array<Record<string, unknown>>;

    expect(members.map((member) => member.email)).toEqual(
      expect.arrayContaining(['studio@mukhtalif.net', 'editor@mukhtalif.net']),
    );
    expect(members.map((member) => member.email)).not.toContain('sara@example.com');
    expect(subscribers.map((user) => user.email)).toEqual(
      expect.arrayContaining(['sara@example.com', 'khalid@example.com']),
    );
    expect(subscribers.map((user) => user.email)).not.toContain('studio@mukhtalif.net');
    expect(subscribers.every((user) => !('role' in user))).toBe(true);
    expect(subscribers.every((user) => !('authLinked' in user))).toBe(true);
  });

  it('validates subscription ownership against app users only', async () => {
    const response = await request('/studio/subscriptions', 'usr-admin-1', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ userId: 'usr-editor-1', planId: 'pln-plus' }),
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: 'Unknown user' });
  });
});

describe('granular Studio permissions', () => {
  it('returns Studio defaults without a listener role and resolves `/studio/me` only', async () => {
    const matrixResponse = await request('/studio/permissions', 'usr-admin-1');
    const matrix = (await matrixResponse.json()) as Record<string, string[]>;
    const studioMeResponse = await request('/studio/me', 'usr-editor-1');
    const studioMe = (await studioMeResponse.json()) as { permissions: string[] };
    const appMeResponse = await request('/app/me', 'usr-editor-1');

    expect(matrix.admin).toEqual(PERMISSION_IDS);
    expect(matrix.editor).toEqual(DEFAULT_ROLE_PERMISSIONS.editor);
    expect(matrix).not.toHaveProperty('listener');
    expect(studioMe.permissions).toEqual(DEFAULT_ROLE_PERMISSIONS.editor);
    expect(appMeResponse.status).toBe(403);
  });

  it('rejects malformed and protected-role permission updates', async () => {
    const missingView = await request('/studio/permissions/editor', 'usr-admin-1', {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ permissions: ['episodes.manage'] }),
    });
    const administrator = await request('/studio/permissions/admin', 'usr-admin-1', {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ permissions: [...PERMISSION_IDS] }),
    });
    const removedListener = await request('/studio/permissions/listener', 'usr-admin-1', {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ permissions: [] }),
    });

    expect(missingView.status).toBe(400);
    expect(administrator.status).toBe(409);
    expect(removedListener.status).toBe(404);
  });

  it('enforces view and manage independently and restores the editor fixture', async () => {
    const permissions = ['episodes.view', 'subscribers.view'];
    const updateResponse = await request('/studio/permissions/editor', 'usr-admin-1', {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ permissions }),
    });
    const draftResponse = await request('/studio/episodes?status=draft', 'usr-editor-1');
    const subscriptionsResponse = await request('/studio/subscriptions', 'usr-editor-1');
    const writeResponse = await request('/studio/shows', 'usr-editor-1', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({}),
    });
    // The public catalogue has no mutating handler at all, so a write cannot
    // reach it regardless of who the caller turns out to be.
    const publicWriteResponse = await request('/shows', 'usr-admin-1', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({}),
    });

    expect(updateResponse.status).toBe(200);
    expect(draftResponse.status).toBe(200);
    expect(subscriptionsResponse.status).toBe(200);
    expect(writeResponse.status).toBe(403);
    expect(publicWriteResponse.status).toBe(404);

    const restoreResponse = await request('/studio/permissions/editor', 'usr-admin-1', {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ permissions: [...DEFAULT_ROLE_PERMISSIONS.editor] }),
    });
    expect(restoreResponse.status).toBe(200);
  });
});

describe('Studio member access management', () => {
  it('returns safe membership summaries without Auth UUIDs', async () => {
    const response = await request('/studio/members', 'usr-admin-1');
    const body = (await response.json()) as Array<Record<string, unknown>>;

    expect(response.status).toBe(200);
    expect(body.some((member) => member.role === 'editor')).toBe(true);
    expect(body.every((member) => typeof member.roleName === 'string')).toBe(true);
    expect(body.every((member) => typeof member.authLinked === 'boolean')).toBe(true);
    expect(JSON.stringify(body)).not.toContain('authUserId');
    expect(JSON.stringify(body)).not.toContain('auth_user_id');
  });

  it('strictly validates role bodies and never promotes an app user', async () => {
    const malformed = await request('/studio/members/usr-editor-1/role', 'usr-admin-1', {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify({ role: 'editor', admin: true }),
    });
    const appUserTarget = await request('/studio/members/usr-listener-1/role', 'usr-admin-1', {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify({ role: 'editor' }),
    });

    expect(malformed.status).toBe(400);
    expect(appUserTarget.status).toBe(404);
  });

  it('blocks every self-targeted role request', async () => {
    const demotion = await request('/studio/members/usr-admin-1/role', 'usr-admin-1', {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify({ role: 'editor' }),
    });
    const noOp = await request('/studio/members/usr-admin-1/role', 'usr-admin-1', {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify({ role: 'admin' }),
    });
    expect(demotion.status).toBe(409);
    expect(noOp.status).toBe(409);
  });

  it('changes only a Studio member role and appends one Studio audit entry', async () => {
    const before = (await (await request('/studio/audit-logs', 'usr-admin-1')).json()) as Array<{
      action: string;
    }>;
    const updateResponse = await request('/studio/members/usr-editor-1/role', 'usr-admin-1', {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify({ role: 'admin' }),
    });
    const after = (await (await request('/studio/audit-logs', 'usr-admin-1')).json()) as Array<{
      action: string;
      actorStudioMemberId?: string;
      targetStudioMemberId?: string;
      previousRole?: string;
      newRole?: string;
    }>;

    expect(updateResponse.status).toBe(200);
    expect(after).toHaveLength(before.length + 1);
    expect(after[0]).toMatchObject({
      action: 'studio_member.role_changed',
      actorStudioMemberId: 'usr-admin-1',
      targetStudioMemberId: 'usr-editor-1',
      previousRole: 'editor',
      newRole: 'admin',
    });

    const restore = await request('/studio/members/usr-editor-1/role', 'usr-admin-1', {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify({ role: 'editor' }),
    });
    expect(restore.status).toBe(200);
  });
});

describe('dynamic Studio roles', () => {
  it('creates, browses, assigns, and authorizes a custom access-manager role', async () => {
    const seeded = (await (await request('/studio/roles', 'usr-admin-1')).json()) as Array<{
      id: string;
    }>;
    expect(seeded.map((role) => role.id)).toEqual(expect.arrayContaining(['admin', 'editor']));
    expect(seeded.map((role) => role.id)).not.toContain('listener');

    const createResponse = await request('/studio/roles', 'usr-admin-1', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({
        name: 'منسق البرامج',
        description: 'يدير أعضاء الاستوديو والأدوار دون امتلاك دور المشرف المحمي.',
        permissions: ['overview.view', 'access.view', 'access.manage'],
      }),
    });
    const role = (await createResponse.json()) as {
      id: string;
      memberCount: number;
      permissions: string[];
    };
    expect(createResponse.status).toBe(201);
    expect(role).toMatchObject({
      memberCount: 0,
      permissions: ['overview.view', 'access.view', 'access.manage'],
    });

    const inviteResponse = await request('/studio/members', 'usr-admin-1', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({
        displayName: 'منسق الصلاحيات',
        email: 'role.manager@example.com',
        role: role.id,
        locale: 'ar',
      }),
    });
    const manager = (await inviteResponse.json()) as { id: string; role: string };
    expect(inviteResponse.status).toBe(201);
    expect(manager.role).toBe(role.id);

    const meResponse = await request('/studio/me', manager.id);
    expect(await meResponse.json()).toMatchObject({
      role: role.id,
      permissions: ['overview.view', 'access.view', 'access.manage'],
    });
    expect((await request('/studio/members', manager.id)).status).toBe(200);
    expect(await (await request(`/studio/roles/${role.id}`, manager.id)).json()).toMatchObject({
      memberCount: 1,
    });

    const protectedAssignment = await request(
      '/studio/members/usr-editor-1/role',
      manager.id,
      {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify({ role: 'admin' }),
      },
    );
    expect(protectedAssignment.status).toBe(403);
  });

  it('separates access.view from access.manage for custom roles', async () => {
    const createResponse = await request('/studio/roles', 'usr-admin-1', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ name: 'مراجع الصلاحيات', permissions: ['access.view'] }),
    });
    const role = (await createResponse.json()) as { id: string };
    expect(createResponse.status).toBe(201);

    const assignment = await request('/studio/members/usr-editor-1/role', 'usr-admin-1', {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify({ role: role.id }),
    });
    expect(assignment.status).toBe(200);
    expect((await request('/studio/roles', 'usr-editor-1')).status).toBe(200);
    expect((await request('/studio/members', 'usr-editor-1')).status).toBe(200);
    expect(
      (
        await request('/studio/roles', 'usr-editor-1', {
          method: 'POST',
          headers: jsonHeaders,
          body: JSON.stringify({ name: 'محاولة غير مسموحة', permissions: [] }),
        })
      ).status,
    ).toBe(403);

    const restore = await request('/studio/members/usr-editor-1/role', 'usr-admin-1', {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify({ role: 'editor' }),
    });
    expect(restore.status).toBe(200);
  });
});

describe('Studio member invitations', () => {
  it('normalizes input and appends a Studio invitation audit entry', async () => {
    const before = (await (await request('/studio/audit-logs', 'usr-admin-1')).json()) as Array<{
      action: string;
    }>;
    const response = await request('/studio/members', 'usr-admin-1', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({
        displayName: '  ليان السالم  ',
        email: '  LIAN.STUDIO@EXAMPLE.COM  ',
        role: 'editor',
        locale: 'ar',
      }),
    });
    const member = (await response.json()) as Record<string, unknown>;
    const after = (await (await request('/studio/audit-logs', 'usr-admin-1')).json()) as Array<{
      action: string;
      actorStudioMemberId?: string;
      targetStudioMemberId?: string;
      invitedEmail?: string;
    }>;

    expect(response.status).toBe(201);
    expect(member).toMatchObject({
      displayName: 'ليان السالم',
      email: 'lian.studio@example.com',
      role: 'editor',
      authLinked: true,
    });
    expect(after).toHaveLength(before.length + 1);
    expect(after.find((entry) => entry.action === 'studio_member.invited')).toMatchObject({
      actorStudioMemberId: 'usr-admin-1',
      targetStudioMemberId: member.id,
      invitedEmail: 'lian.studio@example.com',
    });
  });

  it('does not treat an app profile as membership or implicitly link its Auth identity', async () => {
    const appEmailResponse = await request('/studio/members', 'usr-admin-1', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({
        displayName: 'عضو مستقل',
        email: 'sara@example.com',
        role: 'editor',
        locale: 'ar',
      }),
    });
    expect(appEmailResponse.status).toBe(409);
    expect(await appEmailResponse.json()).toMatchObject({
      code: 'AUTH_IDENTITY_ALREADY_EXISTS',
    });

    const appUser = await request('/app/me', 'usr-listener-1');
    expect(appUser.status).toBe(200);
    expect(await appUser.json()).toMatchObject({ email: 'sara@example.com' });
    const members = (await (
      await request('/studio/members', 'usr-admin-1')
    ).json()) as Array<{ email: string }>;
    expect(members.filter((member) => member.email === 'sara@example.com')).toHaveLength(0);
  });

  it('requires management permission and strictly rejects passwords or unknown fields', async () => {
    const input = {
      displayName: 'عضو جديد',
      email: 'strict.invite@example.com',
      role: 'editor',
      locale: 'ar',
    };
    const editorResponse = await request('/studio/members', 'usr-editor-1', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(input),
    });
    const passwordResponse = await request('/studio/members', 'usr-admin-1', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ ...input, password: 'NeverAcceptBrowserPasswords123!' }),
    });
    const malformedJsonResponse = await request('/studio/members', 'usr-admin-1', {
      method: 'POST',
      headers: jsonHeaders,
      body: '{',
    });

    expect(editorResponse.status).toBe(403);
    expect(passwordResponse.status).toBe(400);
    expect(await passwordResponse.json()).toEqual({
      error: 'Invalid Studio invitation request',
      code: 'VALIDATION_ERROR',
    });
    expect(malformedJsonResponse.status).toBe(400);
  });
});
