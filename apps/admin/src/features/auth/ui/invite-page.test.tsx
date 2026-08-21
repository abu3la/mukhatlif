import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
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
    restoreSession: async () => null,
    signInWithPassword: async () => {
      throw new Error('not used');
    },
    verifyEmailCode: vi.fn(async () => ({
      subject: { id: 'auth-1', email: 'new@mukhtalif.test' },
      accessToken: 'token',
    })),
    verifyEmailLink: vi.fn(async () => ({
      subject: { id: 'auth-1', email: 'new@mukhtalif.test' },
      accessToken: 'token',
    })),
    sendEmailCode: vi.fn(async () => undefined),
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

function renderInvite(
  gateway: AdminAuthGateway,
  repository: AdminRepository,
  search = '',
) {
  return render(
    <MemoryRouter initialEntries={[`/invite${search}`]}>
      <InviteView authGateway={gateway} repository={repository} />
    </MemoryRouter>,
  );
}

const INVITED: AdminInvitationState = {
  status: 'invited',
  email: 'new@mukhtalif.test',
  displayName: 'نورة الشمري',
  roleName: 'مدير المحتوى',
};

async function submitCode(user: ReturnType<typeof userEvent.setup>, code = '123456') {
  await user.type(screen.getByLabelText('البريد الإلكتروني'), 'new@mukhtalif.test');
  await user.type(screen.getByLabelText(/رمز التأكيد/), code);
  await user.click(screen.getByRole('button', { name: 'تأكيد الرمز' }));
}

describe('invitation acceptance', () => {
  afterEach(cleanup);

  it('verifies the code, then asks for a password and names the invitee', async () => {
    const user = userEvent.setup();
    const gateway = gatewayStub();
    const repository = repositoryStub(INVITED);
    renderInvite(gateway, repository);

    await submitCode(user);

    // The invitation email carries an invite-type token, not a sign-in code.
    expect(gateway.verifyEmailCode).toHaveBeenCalledWith(
      'new@mukhtalif.test',
      '123456',
      'invite',
    );
    expect(await screen.findByText(/نورة الشمري/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^كلمة المرور/)).toBeInTheDocument();
  });

  it('keeps the code button disabled until six digits are entered', async () => {
    const user = userEvent.setup();
    renderInvite(gatewayStub(), repositoryStub(INVITED));

    const submit = screen.getByRole('button', { name: 'تأكيد الرمز' });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText(/رمز التأكيد/), '12345');
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText(/رمز التأكيد/), '6');
    expect(submit).toBeEnabled();
  });

  it('discards anything that is not a digit', async () => {
    const user = userEvent.setup();
    renderInvite(gatewayStub(), repositoryStub(INVITED));

    const field = screen.getByLabelText(/رمز التأكيد/);
    await user.type(field, '12ab34');
    expect(field).toHaveValue('1234');
  });

  it('never offers to set a password for an identity with no invitation', async () => {
    const user = userEvent.setup();
    const gateway = gatewayStub();
    const repository = repositoryStub({ status: 'none' });
    renderInvite(gateway, repository);

    await submitCode(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(/لا توجد دعوة/);
    expect(screen.queryByLabelText(/^كلمة المرور/)).not.toBeInTheDocument();
    // A verified code that leads nowhere must not leave a session behind.
    expect(gateway.signOut).toHaveBeenCalled();
  });

  it('refuses an invitation that was already accepted and signs out again', async () => {
    const user = userEvent.setup();
    const gateway = gatewayStub();
    renderInvite(gateway, repositoryStub({ status: 'active' }));

    await submitCode(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(/قُبلت هذه الدعوة من قبل/);
    expect(gateway.signOut).toHaveBeenCalled();
  });

  it('distinguishes an expired code from a wrong one', async () => {
    const user = userEvent.setup();
    renderInvite(
      gatewayStub({
        verifyEmailCode: vi.fn(async () => {
          throw new AdminAuthError('EXPIRED_CODE', 'expired');
        }),
      }),
      repositoryStub(INVITED),
    );

    await submitCode(user);
    expect(await screen.findByRole('alert')).toHaveTextContent(/انتهت صلاحية الرمز/);
  });

  it('switches to the sign-in code type after a resend', async () => {
    const user = userEvent.setup();
    const gateway = gatewayStub();
    renderInvite(gateway, repositoryStub(INVITED));

    await user.type(screen.getByLabelText('البريد الإلكتروني'), 'new@mukhtalif.test');
    await user.click(screen.getByRole('button', { name: /أرسل رمزًا جديدًا/ }));
    await waitFor(() => expect(gateway.sendEmailCode).toHaveBeenCalledWith('new@mukhtalif.test'));

    await user.type(screen.getByLabelText(/رمز التأكيد/), '654321');
    await user.click(screen.getByRole('button', { name: 'تأكيد الرمز' }));

    // A re-sent code is a sign-in token, so verifying it as an invite would fail.
    expect(gateway.verifyEmailCode).toHaveBeenCalledWith(
      'new@mukhtalif.test',
      '654321',
      'signin',
    );
  });

  it('rejects mismatched passwords before calling the API', async () => {
    const user = userEvent.setup();
    const repository = repositoryStub(INVITED);
    renderInvite(gatewayStub(), repository);
    await submitCode(user);

    await user.type(await screen.findByLabelText(/^كلمة المرور/), 'a-long-enough-pass');
    await user.type(screen.getByLabelText('تأكيد كلمة المرور'), 'a-different-pass');
    await user.click(screen.getByRole('button', { name: /حفظ كلمة المرور/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/غير متطابقتين/);
    expect(repository.acceptInvitation).not.toHaveBeenCalled();
  });

  it('accepts a matching password and confirms completion', async () => {
    const user = userEvent.setup();
    const repository = repositoryStub(INVITED);
    renderInvite(gatewayStub(), repository);
    await submitCode(user);

    await user.type(await screen.findByLabelText(/^كلمة المرور/), 'a-long-enough-pass');
    await user.type(screen.getByLabelText('تأكيد كلمة المرور'), 'a-long-enough-pass');
    await user.click(screen.getByRole('button', { name: /حفظ كلمة المرور/ }));

    expect(repository.acceptInvitation).toHaveBeenCalledWith('a-long-enough-pass');
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
    renderInvite(gatewayStub(), repository);
    await submitCode(user);

    await user.type(await screen.findByLabelText(/^كلمة المرور/), 'a-long-enough-pass');
    await user.type(screen.getByLabelText('تأكيد كلمة المرور'), 'a-long-enough-pass');
    await user.click(screen.getByRole('button', { name: /حفظ كلمة المرور/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/قُبلت هذه الدعوة من قبل/);
  });

  it('accepts the token an invitation link carries, skipping the code step', async () => {
    const gateway = gatewayStub();
    const repository = repositoryStub(INVITED);
    renderInvite(gateway, repository, '?token_hash=abc123&type=invite');

    // The default Supabase invite email sends a link, not a visible code.
    await waitFor(() => expect(gateway.verifyEmailLink).toHaveBeenCalledWith('abc123', 'invite'));
    expect(await screen.findByLabelText(/^كلمة المرور/)).toBeInTheDocument();
    expect(gateway.verifyEmailCode).not.toHaveBeenCalled();
  });

  it('treats a link without the invite type as a re-sent sign-in token', async () => {
    const gateway = gatewayStub();
    renderInvite(gateway, repositoryStub(INVITED), '?token_hash=xyz789&type=magiclink');

    await waitFor(() => expect(gateway.verifyEmailLink).toHaveBeenCalledWith('xyz789', 'signin'));
  });

  it('strips the single-use token from the URL rather than leaving it in history', async () => {
    const gateway = gatewayStub();
    renderInvite(gateway, repositoryStub(INVITED), '?token_hash=abc123&type=invite');

    await waitFor(() => expect(gateway.verifyEmailLink).toHaveBeenCalled());
    // A credential left in the address bar reaches history and the Referer of
    // whatever the page loads next.
    await waitFor(() => expect(window.location.search).not.toContain('abc123'));
  });

  it('consumes a link token once, even though the token is single-use', async () => {
    const gateway = gatewayStub();
    const { rerender } = renderInvite(
      gateway,
      repositoryStub(INVITED),
      '?token_hash=abc123&type=invite',
    );
    await waitFor(() => expect(gateway.verifyEmailLink).toHaveBeenCalledTimes(1));

    rerender(
      <MemoryRouter initialEntries={['/invite?token_hash=abc123&type=invite']}>
        <InviteView authGateway={gateway} repository={repositoryStub(INVITED)} />
      </MemoryRouter>,
    );
    expect(gateway.verifyEmailLink).toHaveBeenCalledTimes(1);
  });

  it('reports a spent or expired link instead of showing an empty code form', async () => {
    const gateway = gatewayStub({
      verifyEmailLink: vi.fn(async () => {
        throw new AdminAuthError('EXPIRED_CODE', 'expired');
      }),
    });
    renderInvite(gateway, repositoryStub(INVITED), '?token_hash=stale&type=invite');

    expect(await screen.findByRole('alert')).toHaveTextContent(/انتهت صلاحية الرمز/);
  });
});
