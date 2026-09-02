import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStorage } from '@/test/memory-storage';
import type { AdminAuthError } from './admin-auth-gateway';
import {
  FIXTURE_ADMIN_ACCOUNTS,
  FIXTURE_CREATED_ACCOUNT_PASSWORD,
  FixtureAdminAuthGateway,
} from './fixture-admin-auth-gateway';

describe('FixtureAdminAuthGateway', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it.each(FIXTURE_ADMIN_ACCOUNTS)(
    'signs in and restores the $role fixture account',
    async (account) => {
      const gateway = new FixtureAdminAuthGateway({ storage });

      const session = await gateway.signInWithPassword(account.email, account.password);
      expect(session.subject).toEqual({ id: account.id, email: account.email });

      const restoredGateway = new FixtureAdminAuthGateway({ storage });
      await expect(restoredGateway.restoreSession()).resolves.toEqual(session);
    },
  );

  it('does not expose a persisted fixture session as an invitation session', async () => {
    const gateway = new FixtureAdminAuthGateway({ storage });
    await gateway.signInWithPassword(
      FIXTURE_ADMIN_ACCOUNTS[0].email,
      FIXTURE_ADMIN_ACCOUNTS[0].password,
    );

    await expect(gateway.restoreInvitationSession()).resolves.toBeNull();
  });

  it('rejects invalid credentials without creating a session', async () => {
    const gateway = new FixtureAdminAuthGateway({ storage });

    await expect(
      gateway.signInWithPassword(FIXTURE_ADMIN_ACCOUNTS[0].email, 'wrong-password'),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' } satisfies Partial<AdminAuthError>);
    expect(gateway.getCurrentSession()).toBeNull();
  });

  it('registers and authenticates a created local account without changing seed accounts', async () => {
    const gateway = new FixtureAdminAuthGateway({ storage });
    const seedCount = gateway.demoAccounts.length;
    const registered = gateway.registerAccount({
      id: 'user_created_local',
      name: 'مها السالم',
      email: '  MAHA.SALEM@EXAMPLE.COM ',
      role: 'editor',
      locale: 'en',
    });

    expect(registered).toEqual({
      id: 'user_created_local',
      name: 'مها السالم',
      email: 'maha.salem@example.com',
      password: FIXTURE_CREATED_ACCOUNT_PASSWORD,
      role: 'editor',
      locale: 'en',
    });
    expect(gateway.demoAccounts).toHaveLength(seedCount + 1);
    await expect(
      gateway.signInWithPassword(
        'MAHA.SALEM@EXAMPLE.COM',
        FIXTURE_CREATED_ACCOUNT_PASSWORD,
      ),
    ).resolves.toMatchObject({
      subject: {
        id: 'user_created_local',
        email: 'maha.salem@example.com',
      },
    });

    for (const account of FIXTURE_ADMIN_ACCOUNTS) {
      await expect(
        gateway.signInWithPassword(account.email, account.password),
      ).resolves.toMatchObject({ subject: { id: account.id, email: account.email } });
    }
  });

  it('rejects duplicate identifiers and emails in the local account registry', () => {
    const gateway = new FixtureAdminAuthGateway({ storage });
    const account = {
      id: 'user_created_local',
      name: 'مها السالم',
      email: 'maha.salem@example.com',
      role: 'listener' as const,
      locale: 'ar' as const,
    };
    gateway.registerAccount(account);

    expect(() => gateway.registerAccount(account)).toThrow(/already exists/);
    expect(() =>
      gateway.registerAccount({
        ...account,
        id: 'user_second_local',
        email: 'MAHA.SALEM@example.com',
      }),
    ).toThrow(/already exists/);
  });

  it('notifies subscribers and clears the persisted session on sign-out', async () => {
    const gateway = new FixtureAdminAuthGateway({ storage });
    const listener = vi.fn();
    gateway.subscribe(listener);

    await gateway.signInWithPassword(
      FIXTURE_ADMIN_ACCOUNTS[1].email,
      FIXTURE_ADMIN_ACCOUNTS[1].password,
    );
    await gateway.signOut();

    expect(listener).toHaveBeenNthCalledWith(1, expect.objectContaining({
      subject: expect.objectContaining({ id: FIXTURE_ADMIN_ACCOUNTS[1].id }),
    }));
    expect(listener).toHaveBeenLastCalledWith(null);
    await expect(
      new FixtureAdminAuthGateway({ storage }).restoreSession(),
    ).resolves.toBeNull();
  });
});
