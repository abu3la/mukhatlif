import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { adminPaths, useAdminAuth } from '@/application';
import {
  AdminAuthError,
  AdminRepositoryError,
  type AdminAuthGateway,
  type AdminInvitationState,
  type AdminRepository,
  type EmailLinkPurpose,
} from '@/data';
import { BrandMark } from '@/shared/ui/brand-mark';
import { Button, Field, Input } from '@/shared/ui/primitives';

/**
 * Invitation acceptance.
 *
 * This is the one screen reachable by somebody who is not yet an operator, so
 * it authenticates on the link they were emailed rather than a password — an
 * invitee has none until the last step of this flow.
 *
 * Verifying the link only proves control of the mailbox, so it is a separate
 * step from setting the password. The API sets the password with its own
 * credential and flips the membership to active in one audited operation, so a
 * half-finished acceptance leaves a retryable pending invitation rather than an
 * active member who cannot sign in.
 */
const MIN_PASSWORD_LENGTH = 12;

function linkErrorMessage(error: unknown): string {
  if (error instanceof AdminAuthError) {
    if (error.code === 'EXPIRED_LINK') {
      return 'انتهت صلاحية الرابط أو استُخدم من قبل. اطلب رابطًا جديدًا.';
    }
    if (error.code === 'INVALID_LINK' || error.code === 'INVALID_CREDENTIALS') {
      return 'الرابط غير صالح. تأكد من فتحه كاملًا من رسالة الدعوة.';
    }
    if (error.code === 'RATE_LIMITED') {
      return 'تكررت المحاولات بسرعة. انتظر قليلًا ثم حاول مرة أخرى.';
    }
    if (error.code === 'NETWORK') {
      return 'تعذّر الاتصال بخدمة الدخول. تحقق من الشبكة وحاول مرة أخرى.';
    }
    if (error.code === 'UNSUPPORTED') {
      return 'هذه النسخة المحلية لا ترسل روابط بالبريد.';
    }
  }
  return 'تعذّر التحقق من الرابط. حاول مرة أخرى.';
}

function acceptErrorMessage(error: unknown): string {
  if (error instanceof AdminRepositoryError) {
    if (error.code === 'CONFLICT') return 'قُبلت هذه الدعوة من قبل. سجّل الدخول بكلمة مرورك.';
    if (error.code === 'FORBIDDEN') return 'لا توجد دعوة مرتبطة بهذا الحساب.';
    if (error.code === 'VALIDATION') {
      return `كلمة المرور لا تحقق الحد الأدنى: ${MIN_PASSWORD_LENGTH} محرفًا على الأقل.`;
    }
  }
  return 'تعذّر إكمال الدعوة. حاول مرة أخرى.';
}

export function InviteView({
  authGateway,
  repository,
}: {
  authGateway: AdminAuthGateway;
  repository: AdminRepository;
}) {
  const navigate = useNavigate();
  const auth = useAdminAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [step, setStep] = useState<'link' | 'password' | 'done'>('link');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [invitation, setInvitation] = useState<AdminInvitationState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const linkConsumed = useRef(false);

  /**
   * Accepts either supported Supabase invitation link form:
   *
   * - token_hash in the query string, used by re-sent sign-in links;
   * - an Auth session in the URL hash, used by default Supabase invitations.
   *
   * A query token is removed immediately: a single-use credential left in the
   * address bar reaches browser history and the Referer header of whatever the
   * page loads next.
   */
  useEffect(() => {
    const tokenHash = searchParams.get('token_hash');
    if (linkConsumed.current) return;
    linkConsumed.current = true;
    const purpose: EmailLinkPurpose = searchParams.get('type') === 'invite' ? 'invite' : 'signin';
    if (tokenHash) setSearchParams(new URLSearchParams(), { replace: true });

    void (async () => {
      setBusy(true);
      setError('');
      try {
        if (tokenHash) {
          await authGateway.verifyEmailLink(tokenHash, purpose);
        } else {
          const session = await authGateway.restoreInvitationSession();
          // Opening /invite normally is not enough to grant password setup.
          // Only a session that Supabase recovered from an invitation URL can
          // proceed to the invitation lookup below.
          if (!session) return;
        }
        // A verified link proves the mailbox, not Studio membership. Confirm
        // the invitation before offering to set a password for it.
        const state = await repository.readInvitation();
        if (state.status === 'invited') {
          setInvitation(state);
          setStep('password');
          return;
        }
        setError(
          state.status === 'active'
            ? 'قُبلت هذه الدعوة من قبل. سجّل الدخول بكلمة مرورك.'
            : 'لا توجد دعوة إلى الاستوديو مرتبطة بهذا الرابط.',
        );
        await authGateway.signOut();
      } catch (caught) {
        setError(linkErrorMessage(caught));
      } finally {
        setBusy(false);
      }
    })();
  }, [authGateway, repository, searchParams, setSearchParams]);

  async function resend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await authGateway.sendSignInEmail(email);
      // Deliberately the same message whether or not the address is known:
      // a different one would let anyone probe who has been invited.
      setNotice('إن كان هذا البريد مدعوًّا، فسيصله رابط جديد خلال دقائق.');
    } catch (caught) {
      setError(linkErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (password !== confirmation) {
      setError('كلمتا المرور غير متطابقتين.');
      return;
    }
    setBusy(true);
    try {
      await repository.acceptInvitation(password);
      // The provider may have already classified this session as denied while
      // the membership was still invited. Refresh it before offering the
      // transition to the Studio route.
      await auth.retry();
      setStep('done');
    } catch (caught) {
      setError(acceptErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="invite-title">
        <header className="auth-panel__header">
          <BrandMark height={30} />
          <div>
            <h1 id="invite-title">قبول دعوة الاستوديو</h1>
            <p>
              {step === 'link'
                ? 'افتح رابط الدعوة من رسالة البريد لإكمال إنشاء حسابك.'
                : step === 'password'
                  ? 'بقي أن تختار كلمة مرور لحسابك.'
                  : 'اكتمل إعداد حسابك.'}
            </p>
          </div>
        </header>

        {step === 'link' ? (
          <>
            {busy ? (
              <p className="notice" role="status" aria-live="polite">
                جارٍ التحقق من الرابط…
              </p>
            ) : null}
            {error ? (
              <p className="notice notice--error" role="alert">
                {error}
              </p>
            ) : null}
            {notice ? (
              <p className="notice" role="status">
                {notice}
              </p>
            ) : null}
            <form className="auth-form" onSubmit={(event) => void resend(event)}>
              <p className="invite-hint">
                إن لم يصلك الرابط أو انتهت صلاحيته، أدخل بريدك لإرسال رابط جديد.
              </p>
              <Field label="البريد الإلكتروني">
                <Input
                  type="email"
                  name="email"
                  value={email}
                  dir="ltr"
                  lang="en"
                  inputMode="email"
                  autoComplete="username"
                  required
                  disabled={busy}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </Field>
              <Button
                className="auth-form__submit"
                type="submit"
                variant="primary"
                disabled={busy || !email}
                aria-busy={busy}
              >
                {busy ? 'جارٍ الإرسال…' : 'إرسال رابط جديد'}
              </Button>
            </form>
          </>
        ) : null}

        {step === 'password' ? (
          <form className="auth-form" onSubmit={(event) => void accept(event)}>
            {invitation?.displayName ? (
              <p className="invite-identity">
                {invitation.displayName}
                {invitation.roleName ? (
                  <>
                    <span aria-hidden="true"> · </span>
                    {invitation.roleName}
                  </>
                ) : null}
              </p>
            ) : null}
            <Field label={`كلمة المرور (${MIN_PASSWORD_LENGTH} محرفًا على الأقل)`}>
              <Input
                type="password"
                name="new-password"
                value={password}
                dir="ltr"
                lang="en"
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
                required
                disabled={busy}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>
            <Field label="تأكيد كلمة المرور">
              <Input
                type="password"
                name="confirm-password"
                value={confirmation}
                dir="ltr"
                lang="en"
                autoComplete="new-password"
                required
                disabled={busy}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </Field>
            {error ? (
              <p className="notice notice--error" role="alert">
                {error}
              </p>
            ) : null}
            <Button
              className="auth-form__submit"
              type="submit"
              variant="primary"
              disabled={busy || password.length < MIN_PASSWORD_LENGTH}
              aria-busy={busy}
            >
              {busy ? 'جارٍ الحفظ…' : 'حفظ كلمة المرور والدخول'}
            </Button>
          </form>
        ) : null}

        {step === 'done' ? (
          <div className="auth-form">
            <p className="notice" role="status">
              أصبح حسابك جاهزًا. يمكنك الدخول إلى الاستوديو الآن.
            </p>
            <Button
              className="auth-form__submit"
              type="button"
              variant="primary"
              onClick={() => void navigate(adminPaths.overview, { replace: true })}
            >
              الدخول إلى الاستوديو
            </Button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
