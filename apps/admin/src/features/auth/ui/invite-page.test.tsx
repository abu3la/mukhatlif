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
    signInWithPassword: async () => {
      throw new Error('not used');
    },
    verifyEmailLink: vi.fn(async () => ({
      subject: { id: 'auth-1', email: 'new@mukhtalif.test' },
      accessToken: 'token',
    })),
    sendSignInEmail: vi.fn(async () => undefined),
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

    await waitFor(() => expect(gateway.verifyEmailLink).toHaveBeenCalledWith('abc123', 'invite'));
    expect(await screen.findByLabelText(/^كلمة المرور/)).toBeInTheDocument();
    expect(await screen.findByText(/نورة الشمري/)).toBeInTheDocument();
  });

  it('treats a link without the invite type as a re-sent sign-in token', async () => {
    const gateway = gatewayStub();
    renderInvite(gateway, repositoryStub(INVITED), '?token_hash=xyz789&type=magiclink');

    await waitFor(() => expect(gateway.verifyEmailLink).toHaveBeenCalledWith('xyz789', 'signin'));
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

  it('offers to resend when opened without a link, and asks for nothing else', async () => {
    const gateway = gatewayStub();
    const repository = repositoryStub(INVITED);
    renderInvite(gateway, repository);

    expect(await screen.findByRole('button', { name: 'إرسال رابط جديد' })).toBeInTheDocument();
    // The password step must not be reachable without a verified link.
    expect(screen.queryByLabelText(/^كلمة المرور/)).not.toBeInTheDocument();
    await waitFor(() => expect(gateway.restoreInvitationSession).toHaveBeenCalledTimes(1));
    expect(gateway.restoreSession).not.toHaveBeenCalled();
    expect(repository.readInvitation).not.toHaveBeenCalled();
  });

  it('answers a resend identically whether or not the address was invited', async () => {
    const user = userEvent.setup();
    const gateway = gatewayStub();
    renderInvite(gateway, repositoryStub(INVITED));

    await screen.findByRole('button', { name: 'إرسال رابط جديد' });
    await user.type(screen.getByLabelText('البريد الإلكتروني'), 'stranger@example.test');
    await user.click(screen.getByRole('button', { name: 'إرسال رابط جديد' }));

    await waitFor(() =>
      expect(gateway.sendSignInEmail).toHaveBeenCalledWith('stranger@example.test'),
    );
    // A distinguishable answer would let anyone probe who has been invited.
    expect(await screen.findByRole('status')).toHaveTextContent(/إن كان هذا البريد مدعوًّا/);
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
    renderInvite(gatewayStub(), repository, INVITE_LINK);

    await setPassword(user, 'a-long-enough-pass');

    expect(repository.acceptInvitation).toHaveBeenCalledWith('a-long-enough-pass');
    expect(await screen.findByRole('status')).toHaveTextContent(/أصبح حسابك جاهزًا/);
  });

  it('refreshes authorization before offering the Studio transition after acceptance', async () => {
    const user = userEvent.setup();
    const repository = repositoryStub(INVITED);
    let resolveRetry: (() => void) | undefined;
    const retry = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRetry = resolve;
        }),
    );
    const auth = authStub({ retry });
    renderInvite(gatewayStub(), repository, INVITE_LINK, auth);

    await setPassword(user, 'a-long-enough-pass');

    await waitFor(() => expect(repository.acceptInvitation).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(retry).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/أصبح حسابك جاهزًا/)).not.toBeInTheDocument();

    resolveRetry?.();

    expect(await screen.findByRole('status')).toHaveTextContent(/أصبح حسابك جاهزًا/);
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
