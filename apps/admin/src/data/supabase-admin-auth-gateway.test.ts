import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createClientMock = vi.hoisted(() => vi.fn());

vi.mock('@supabase/supabase-js', () => ({ createClient: createClientMock }));

import { SupabaseAdminAuthGateway } from './supabase-admin-auth-gateway';

function createSupabaseClientMock(
  getSession: () => Promise<unknown> = async () => ({ data: { session: null }, error: null }),
  updateUser: (attributes: {
    password: string;
    nonce?: string;
  }) => Promise<unknown> = async () => ({
    data: { user: null },
    error: null,
  }),
  reauthenticate: () => Promise<unknown> = async () => ({
    data: { user: null, session: null },
    error: null,
  }),
) {
  const onAuthStateChange = vi.fn(() => ({
    data: { subscription: { unsubscribe: vi.fn() } },
  }));

  return {
    client: {
      auth: {
        getSession,
        reauthenticate,
        updateUser,
        onAuthStateChange,
      },
    } as unknown as SupabaseClient,
    getSession,
    reauthenticate,
    updateUser,
  };
}

function setBrowserUrl(path: string) {
  window.history.replaceState({}, '', path);
}

describe('SupabaseAdminAuthGateway', () => {
  beforeEach(() => {
    createClientMock.mockReset();
    setBrowserUrl('/');
  });

  afterEach(() => setBrowserUrl('/'));

  it('enables URL session detection only for a default Supabase invitation hash', () => {
    setBrowserUrl(
      '/invite#access_token=access&refresh_token=refresh&expires_in=3600&token_type=bearer&type=invite',
    );
    const { client } = createSupabaseClientMock();
    createClientMock.mockReturnValue(client);

    new SupabaseAdminAuthGateway({
      url: 'https://project.supabase.co',
      anonKey: 'anon-key',
    });

    expect(createClientMock).toHaveBeenCalledWith('https://project.supabase.co', 'anon-key', {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    });
  });

  it('does not detect a session when /invite is opened normally', async () => {
    setBrowserUrl('/invite');
    const storedSession = {
      access_token: 'manager-token',
      user: { id: 'manager-1', email: 'manager@mukhtalif.test' },
    };
    const getSession = vi.fn(async () => ({ data: { session: storedSession }, error: null }));
    const { client } = createSupabaseClientMock(getSession);
    createClientMock.mockReturnValue(client);

    const gateway = new SupabaseAdminAuthGateway({
      url: 'https://project.supabase.co',
      anonKey: 'anon-key',
    });

    expect(createClientMock).toHaveBeenCalledWith(
      'https://project.supabase.co',
      'anon-key',
      expect.objectContaining({ auth: expect.objectContaining({ detectSessionInUrl: false }) }),
    );
    await expect(gateway.restoreInvitationSession()).resolves.toBeNull();
    expect(getSession).not.toHaveBeenCalled();
  });

  it('restores a session only after Supabase consumes the invitation hash', async () => {
    setBrowserUrl(
      '/invite#access_token=access&refresh_token=refresh&expires_in=3600&token_type=bearer&type=invite',
    );
    const invitationSession = {
      access_token: 'invite-token',
      user: { id: 'invitee-1', email: 'invitee@mukhtalif.test' },
    };
    const getSession = vi.fn(async () => {
      // This mirrors Supabase clearing the fragment after it validates it.
      setBrowserUrl('/invite');
      return { data: { session: invitationSession }, error: null };
    });
    const { client } = createSupabaseClientMock(getSession);
    const gateway = new SupabaseAdminAuthGateway(
      { url: 'https://project.supabase.co', anonKey: 'anon-key' },
      client,
    );

    await expect(gateway.restoreInvitationSession()).resolves.toEqual({
      subject: { id: 'invitee-1', email: 'invitee@mukhtalif.test' },
      accessToken: 'invite-token',
    });
  });

  it.each(['magiclink', 'email', 'recovery'])(
    'rejects a %s hash even on the invite path',
    async (type) => {
      setBrowserUrl(
        `/invite#access_token=access&refresh_token=refresh&expires_in=3600&token_type=bearer&type=${type}`,
      );
      const getSession = vi.fn(async () => ({ data: { session: null }, error: null }));
      const { client } = createSupabaseClientMock(getSession);
      createClientMock.mockReturnValue(client);

      const gateway = new SupabaseAdminAuthGateway({
        url: 'https://project.supabase.co',
        anonKey: 'anon-key',
      });

      expect(createClientMock).toHaveBeenCalledWith(
        'https://project.supabase.co',
        'anon-key',
        expect.objectContaining({ auth: expect.objectContaining({ detectSessionInUrl: false }) }),
      );
      await expect(gateway.restoreInvitationSession()).resolves.toBeNull();
      expect(getSession).not.toHaveBeenCalled();
    },
  );

  it('does not fall back to a persisted session if Supabase cannot consume the hash', async () => {
    setBrowserUrl(
      '/invite#access_token=stale&refresh_token=refresh&expires_in=3600&token_type=bearer&type=invite',
    );
    const storedSession = {
      access_token: 'manager-token',
      user: { id: 'manager-1', email: 'manager@mukhtalif.test' },
    };
    const getSession = vi.fn(async () => ({ data: { session: storedSession }, error: null }));
    const { client } = createSupabaseClientMock(getSession);
    const gateway = new SupabaseAdminAuthGateway(
      { url: 'https://project.supabase.co', anonKey: 'anon-key' },
      client,
    );

    await expect(gateway.restoreInvitationSession()).resolves.toBeNull();
  });

  it('requests a reauthentication code from Supabase Auth', async () => {
    const reauthenticate = vi.fn(async () => ({
      data: { user: null, session: null },
      error: null,
    }));
    const { client } = createSupabaseClientMock(undefined, undefined, reauthenticate);
    const gateway = new SupabaseAdminAuthGateway(
      { url: 'https://project.supabase.co', anonKey: 'anon-key' },
      client,
    );

    await expect(gateway.requestPasswordChangeVerification()).resolves.toBeUndefined();
    expect(reauthenticate).toHaveBeenCalledOnce();
  });

  it('changes the password only with the email verification code', async () => {
    const updateUser = vi.fn(async () => ({ data: { user: { id: 'auth-1' } }, error: null }));
    const { client } = createSupabaseClientMock(undefined, updateUser);
    const gateway = new SupabaseAdminAuthGateway(
      { url: 'https://project.supabase.co', anonKey: 'anon-key' },
      client,
    );

    await expect(
      gateway.changePassword('A-new-secure-password-2026!', ' 123456 '),
    ).resolves.toBeUndefined();
    expect(updateUser).toHaveBeenCalledWith({
      password: 'A-new-secure-password-2026!',
      nonce: '123456',
    });
  });

  it('maps a rejected reauthentication nonce to a verification-code error', async () => {
    const updateUser = vi.fn(async () => ({
      data: { user: null },
      error: {
        code: 'reauthentication_not_valid',
        message: 'Reauthentication token is invalid',
        status: 400,
      },
    }));
    const { client } = createSupabaseClientMock(undefined, updateUser);
    const gateway = new SupabaseAdminAuthGateway(
      { url: 'https://project.supabase.co', anonKey: 'anon-key' },
      client,
    );

    await expect(
      gateway.changePassword('A-new-secure-password-2026!', '654321'),
    ).rejects.toMatchObject({ code: 'INVALID_VERIFICATION_CODE' });
  });

  it('maps a rejected password to a recoverable weak-password error', async () => {
    const updateUser = vi.fn(async () => ({
      data: { user: null },
      error: { code: 'weak_password', message: 'Password is too weak', status: 422 },
    }));
    const { client } = createSupabaseClientMock(undefined, updateUser);
    const gateway = new SupabaseAdminAuthGateway(
      { url: 'https://project.supabase.co', anonKey: 'anon-key' },
      client,
    );

    await expect(gateway.changePassword('weak-password', '123456')).rejects.toMatchObject({
      code: 'WEAK_PASSWORD',
    });
  });
});
