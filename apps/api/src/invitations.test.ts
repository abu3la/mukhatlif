import { describe, expect, it } from 'vitest';
import type {
  StudioInvitationErrorResponse,
  StudioInvitationState,
  StudioMemberAccess,
} from '@mukhtalif/types';
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

const accept = (identityId: string | undefined, body: unknown) =>
  request('/studio/invitations/accept', identityId, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(body),
  });

async function inviteMember(email: string): Promise<StudioMemberAccess> {
  const response = await request('/studio/members', 'usr-admin-1', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      displayName: 'ضيف الاستوديو',
      email,
      role: 'editor',
      locale: 'ar',
    }),
  });
  expect(response.status).toBe(201);
  return (await response.json()) as StudioMemberAccess;
}

const STRONG_PASSWORD = 'a-long-enough-passphrase';

describe('invitation state', () => {
  it('requires a verified identity', async () => {
    expect((await request('/studio/invitations/me')).status).toBe(401);
    expect((await accept(undefined, { password: STRONG_PASSWORD })).status).toBe(401);
  });

  it('reports an invited member as pending before acceptance', async () => {
    const member = await inviteMember('pending@mukhtalif.test');
    expect(member.status).toBe('invited');
    expect(member.acceptedAt).toBeUndefined();

    const state = (await (
      await request('/studio/invitations/me', member.id)
    ).json()) as StudioInvitationState;
    expect(state).toMatchObject({
      status: 'invited',
      email: 'pending@mukhtalif.test',
      roleName: expect.any(String),
    });
  });

  it('reports an established operator as active', async () => {
    const state = (await (
      await request('/studio/invitations/me', 'usr-admin-1')
    ).json()) as StudioInvitationState;
    expect(state.status).toBe('active');
  });

  it('reports no invitation for an identity that only has an app profile', async () => {
    const state = (await (
      await request('/studio/invitations/me', 'usr-listener-1')
    ).json()) as StudioInvitationState;
    expect(state).toEqual({ status: 'none' });
  });

  it('never returns the Auth identity', async () => {
    const member = await inviteMember('nosecrets@mukhtalif.test');
    const state = await (await request('/studio/invitations/me', member.id)).json();
    expect(JSON.stringify(state)).not.toContain('authUserId');
    expect(state).not.toHaveProperty('authUserId');
  });
});

describe('invitation acceptance', () => {
  it('accepts once and marks the member active', async () => {
    const member = await inviteMember('accepts@mukhtalif.test');
    const response = await accept(member.id, { password: STRONG_PASSWORD });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'accepted',
      member: { id: member.id, email: 'accepts@mukhtalif.test' },
    });

    const state = (await (
      await request('/studio/invitations/me', member.id)
    ).json()) as StudioInvitationState;
    expect(state.status).toBe('active');
  });

  it('rejects a replayed acceptance so password setup cannot be reopened', async () => {
    const member = await inviteMember('replay@mukhtalif.test');
    expect((await accept(member.id, { password: STRONG_PASSWORD })).status).toBe(200);
    const replay = await accept(member.id, { password: 'another-long-passphrase' });
    expect(replay.status).toBe(409);
    expect(((await replay.json()) as StudioInvitationErrorResponse).code).toBe('ALREADY_ACCEPTED');
  });

  it('refuses acceptance for an established operator', async () => {
    const response = await accept('usr-admin-1', { password: STRONG_PASSWORD });
    expect(response.status).toBe(409);
  });

  it('refuses acceptance for an identity with no Studio membership', async () => {
    const response = await accept('usr-listener-1', { password: STRONG_PASSWORD });
    expect(response.status).toBe(403);
    expect(((await response.json()) as StudioInvitationErrorResponse).code).toBe('NO_INVITATION');
  });

  it('rejects a short, whitespace-only, or over-long password', async () => {
    const member = await inviteMember('weak@mukhtalif.test');
    for (const password of ['short', ' '.repeat(20), 'x'.repeat(73)]) {
      const response = await accept(member.id, { password });
      expect(response.status).toBe(400);
      expect(((await response.json()) as StudioInvitationErrorResponse).code).toBe('WEAK_PASSWORD');
    }
    // A rejected password must leave the invitation open.
    const state = (await (
      await request('/studio/invitations/me', member.id)
    ).json()) as StudioInvitationState;
    expect(state.status).toBe('invited');
  });

  it('rejects unknown fields and a malformed body', async () => {
    const member = await inviteMember('strict@mukhtalif.test');
    expect(
      (await accept(member.id, { password: STRONG_PASSWORD, role: 'admin' })).status,
    ).toBe(400);
    const malformed = await request('/studio/invitations/accept', member.id, {
      method: 'POST',
      headers: jsonHeaders,
      body: 'not json',
    });
    expect(malformed.status).toBe(400);
  });

  it('leaves the invited member out of the active directory count until accepted', async () => {
    const member = await inviteMember('directory@mukhtalif.test');
    const directory = (await (
      await request('/studio/members', 'usr-admin-1')
    ).json()) as StudioMemberAccess[];
    const listed = directory.find((candidate) => candidate.id === member.id);
    expect(listed?.status).toBe('invited');
  });
});
