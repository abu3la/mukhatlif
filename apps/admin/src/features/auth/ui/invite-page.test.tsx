import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AdminAuthContext, type AdminAuthContextValue } from '@/application';
import {
  AdminAuthError,
  AdminRepositoryError,
  type AdminAuthGateway,
  type AdminInvitationState,
  type AdminRepository,
} from '@/data';
import { InviteView } from './invite-page';

function gatewayStub(overrides: Partial<AdminAuthGateway> = {}): AdminAuthGateway {
  return {
    kind: 'supabase',
    demoAccounts: [],
    getCurrentSession: () => null,
    getAccessToken: () => null,
    restoreSession: vi.fn(async () => null),
    restoreInvitationSession: vi.fn(async () => null),
    signInWithPassword: vi.fn(async () => INVITE_SESSION),
    verifyEmailLink: vi.fn(async () => ({
      subject: { id: 'auth-1', email: 'new@mukhtalif.test' },
      accessToken: 'token',
    })),
    signOut: vi.fn(async () => undefined),
    subscribe: () => () => undefined,
    ...overrides,
  } as AdminAuthGateway;
}

function repositoryStub(
  invitation: AdminInvitationState,
  overrides: Partial<AdminRepository> = {},
): AdminRepository {
  return {
    readInvitation: vi.fn(async () => invitation),
    acceptInvitation: vi.fn(async () => undefined),
    ...overrides,
  } as unknown as AdminRepository;
}

function authStub(overrides: Partial<AdminAuthContextValue> = {}): AdminAuthContextValue {
  return {
    status: 'signed-out',
    viewer: null,
    deniedEmail: null,
    error: null,
    isSubmitting: false,
    demoAccounts: [],
    signIn: async () => undefined,
    changePassword: async () => undefined,
    signOut: async () => undefined,
    retry: vi.fn(async () => undefined),
    ...overrides,
  };
}

function renderInvite(
  gateway: AdminAuthGateway,
  repository: AdminRepository,
  search = '',
  auth = authStub(),
) {
  return render(
    <AdminAuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[`/invite${search}`]}>
        <InviteView authGateway={gateway} repository={repository} />
      </MemoryRouter>
    </AdminAuthContext.Provider>,
  );
}

const INVITED: AdminInvitationState = {
  status: 'invited',
  email: 'new@mukhtalif.test',
  displayName: 'نورة الشمري',
  roleName: 'مدير المحتوى',
};

const INVITE_LINK = '?token_hash=abc123&type=invite';
const INVITE_SESSION = {
  subject: { id: 'auth-1', email: 'new@mukhtalif.test' },
  accessToken: 'token',
};

async function setPassword(
  user: ReturnType<typeof userEvent.setup>,
  value: string,
  confirmation = value,
) {
  await user.type(await screen.findByLabelText(/^كلمة المرور/), value);
  await user.type(screen.getByLabelText('تأكيد كلمة المرور'), confirmation);
  await user.click(screen.getByRole('button', { name: /حفظ كلمة المرور/ }));
}

describe('invitation acceptance', () => {
  afterEach(cleanup);

  it('consumes the invitation link and goes straight to the password step', async () => {
    const gateway = gatewayStub();
    renderInvite(gateway, repositoryStub(INVITED), INVITE_LINK);

    await waitFor(() => expect(gateway.verifyEmailLink).toHaveBeenCalledWith('abc123'));
    expect(await screen.findByLabelText(/^كلمة المرور/)).toBeInTheDocument();
    expect(await screen.findByText(/نورة الشمري/)).toBeInTheDocument();
  });

  it('rejects a token that was not issued as a Studio invitation', async () => {
    const gateway = gatewayStub();
    const repository = repositoryStub(INVITED);
    renderInvite(gateway, repository, '?token_hash=xyz789&type=magiclink');

    expect(await screen.findByRole('alert')).toHaveTextContent(/ليس دعوة صادرة من الاستوديو/);
    expect(gateway.verifyEmailLink).not.toHaveBeenCalled();
    expect(repository.readInvitation).not.toHaveBeenCalled();
  });

  it('accepts a default Supabase invitation session from the URL and opens password setup', async () => {
    const gateway = gatewayStub({
      restoreInvitationSession: vi.fn(async () => INVITE_SESSION),
    });
    const repository = repositoryStub(INVITED);
    renderInvite(gateway, repository);

    await waitFor(() => expect(gateway.restoreInvitationSession).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(repository.readInvitation).toHaveBeenCalledTimes(1));
    expect(gateway.verifyEmailLink).not.toHaveBeenCalled();
    expect(gateway.restoreSession).not.toHaveBeenCalled();
    expect(await screen.findByLabelText(/^كلمة المرور/)).toBeInTheDocument();
    expect(screen.getByText(/نورة الشمري/)).toBeInTheDocument();
  });

  it('strips the single-use token from the URL rather than leaving it in history', async () => {
    const gateway = gatewayStub();
    renderInvite(gateway, repositoryStub(INVITED), INVITE_LINK);

    await waitFor(() => expect(gateway.verifyEmailLink).toHaveBeenCalled());
    await waitFor(() => expect(window.location.search).not.toContain('abc123'));
  });

  it('consumes a link token once, because the token is single-use', async () => {
    const gateway = gatewayStub();
    const auth = authStub();
    const { rerender } = renderInvite(gateway, repositoryStub(INVITED), INVITE_LINK, auth);
    await waitFor(() => expect(gateway.verifyEmailLink).toHaveBeenCalledTimes(1));

    rerender(
      <AdminAuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={[`/invite${INVITE_LINK}`]}>
          <InviteView authGateway={gateway} repository={repositoryStub(INVITED)} />
        </MemoryRouter>
      </AdminAuthContext.Provider>,
    );
    expect(gateway.verifyEmailLink).toHaveBeenCalledTimes(1);
  });

  it('does not expose a public invitation request when opened without a link', async () => {
    const gateway = gatewayStub();
    const repository = repositoryStub(INVITED);
    renderInvite(gateway, repository);

    expect(await screen.findByText('تُرسل الدعوات من داخل الاستوديو فقط.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'العودة إلى تسجيل الدخول' })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(screen.queryByLabelText('البريد الإلكتروني')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /إرسال رابط/ })).not.toBeInTheDocument();
    // The password step must not be reachable without a verified link.
    expect(screen.queryByLabelText(/^كلمة المرور/)).not.toBeInTheDocument();
    await waitFor(() => expect(gateway.restoreInvitationSession).toHaveBeenCalledTimes(1));
    expect(gateway.restoreSession).not.toHaveBeenCalled();
    expect(repository.readInvitation).not.toHaveBeenCalled();
  });

  it('never offers to set a password for an identity with no invitation', async () => {
    const gateway = gatewayStub();
    renderInvite(gateway, repositoryStub({ status: 'none' }), INVITE_LINK);

    expect(await screen.findByRole('alert')).toHaveTextContent(/لا توجد دعوة/);
    expect(screen.queryByLabelText(/^كلمة المرور/)).not.toBeInTheDocument();
    // A verified link that leads nowhere must not leave a session behind.
    await waitFor(() => expect(gateway.signOut).toHaveBeenCalled());
  });

  it('never offers a password for a restored session with no Studio invitation', async () => {
    const gateway = gatewayStub({
      restoreInvitationSession: vi.fn(async () => INVITE_SESSION),
    });
    renderInvite(gateway, repositoryStub({ status: 'none' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/لا توجد دعوة/);
    expect(screen.queryByLabelText(/^كلمة المرور/)).not.toBeInTheDocument();
    await waitFor(() => expect(gateway.signOut).toHaveBeenCalledTimes(1));
  });

  it('refuses an invitation that was already accepted and signs out again', async () => {
    const gateway = gatewayStub();
    renderInvite(gateway, repositoryStub({ status: 'active' }), INVITE_LINK);

    expect(await screen.findByRole('alert')).toHaveTextContent(/قُبلت هذه الدعوة من قبل/);
    await waitFor(() => expect(gateway.signOut).toHaveBeenCalled());
  });

  it('tells an expired link apart from a malformed one', async () => {
    renderInvite(
      gatewayStub({
        verifyEmailLink: vi.fn(async () => {
          throw new AdminAuthError('EXPIRED_LINK', 'expired');
        }),
      }),
      repositoryStub(INVITED),
      '?token_hash=stale&type=invite',
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(/انتهت صلاحية الرابط/);

    cleanup();
    renderInvite(
      gatewayStub({
        verifyEmailLink: vi.fn(async () => {
          throw new AdminAuthError('INVALID_LINK', 'bad token');
        }),
      }),
      repositoryStub(INVITED),
      '?token_hash=broken&type=invite',
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(/الرابط غير صالح/);
  });

  it('rejects mismatched passwords before calling the API', async () => {
    const user = userEvent.setup();
    const repository = repositoryStub(INVITED);
    renderInvite(gatewayStub(), repository, INVITE_LINK);

    await setPassword(user, 'a-long-enough-pass', 'a-different-pass');

    expect(await screen.findByRole('alert')).toHaveTextContent(/غير متطابقتين/);
    expect(repository.acceptInvitation).not.toHaveBeenCalled();
  });

  it('accepts a matching password and confirms completion', async () => {
    const user = userEvent.setup();
    const repository = repositoryStub(INVITED);
    const gateway = gatewayStub();
    renderInvite(gateway, repository, INVITE_LINK);

    await setPassword(user, 'a-long-enough-pass');

    expect(repository.acceptInvitation).toHaveBeenCalledWith('a-long-enough-pass');
    expect(gateway.signInWithPassword).toHaveBeenCalledWith(
      'new@mukhtalif.test',
      'a-long-enough-pass',
    );
    expect(await screen.findByRole('status')).toHaveTextContent(/أصبح حسابك جاهزًا/);
  });

  it('starts a fresh password session before refreshing access after acceptance', async () => {
    const user = userEvent.setup();
    const repository = repositoryStub(INVITED);
    const calls: string[] = [];
    const gateway = gatewayStub({
      signInWithPassword: vi.fn(async () => {
        calls.push('password-sign-in');
        return INVITE_SESSION;
      }),
    });
    let resolveRetry: (() => void) | undefined;
    const retry = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          calls.push('retry');
          resolveRetry = resolve;
        }),
    );
    const auth = authStub({ retry });
    renderInvite(gateway, repository, INVITE_LINK, auth);

    await setPassword(user, 'a-long-enough-pass');

    await waitFor(() => expect(repository.acceptInvitation).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(retry).toHaveBeenCalledTimes(1));
    expect(gateway.signInWithPassword).toHaveBeenCalledWith(
      'new@mukhtalif.test',
      'a-long-enough-pass',
    );
    expect(calls).toEqual(['password-sign-in', 'retry']);
    expect(screen.queryByText(/أصبح حسابك جاهزًا/)).not.toBeInTheDocument();

    resolveRetry?.();

    expect(await screen.findByRole('status')).toHaveTextContent(/أصبح حسابك جاهزًا/);
  });

  it('explains how to recover when the accepted invitation cannot start a new session', async () => {
    const user = userEvent.setup();
    const gateway = gatewayStub({
      signInWithPassword: vi.fn(async () => {
        throw new AdminAuthError('NETWORK', 'offline');
      }),
    });
    const auth = authStub();
    renderInvite(gateway, repositoryStub(INVITED), INVITE_LINK, auth);

    await setPassword(user, 'a-long-enough-pass');

    expect(await screen.findByRole('alert')).toHaveTextContent(/حُفظت كلمة المرور/);
    expect(auth.retry).not.toHaveBeenCalled();
  });

  it('reports a replayed acceptance as already used rather than a generic failure', async () => {
    const user = userEvent.setup();
    const repository = repositoryStub(INVITED, {
      acceptInvitation: vi.fn(async () => {
        throw new AdminRepositoryError({
          code: 'CONFLICT',
          operation: 'acceptInvitation',
          message: 'already accepted',
          retryable: false,
        });
      }),
    });
    renderInvite(gatewayStub(), repository, INVITE_LINK);

    await setPassword(user, 'a-long-enough-pass');

    expect(await screen.findByRole('alert')).toHaveTextContent(/قُبلت هذه الدعوة من قبل/);
  });
});
