import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { adminPaths } from '@/application';
import {
  AdminAuthError,
  AdminRepositoryError,
  type AdminAuthGateway,
  type AdminInvitationState,
  type AdminRepository,
  type EmailCodePurpose,
} from '@/data';
import { BrandMark } from '@/shared/ui/brand-mark';
import { Button, Field, Input } from '@/shared/ui/primitives';

/**
 * Invitation acceptance.
 *
 * This is the one screen reachable by somebody who is not yet an operator, so
 * it authenticates on the emailed code rather than a password — an invitee has
 * none until the last step of this flow.
 *
 * Verification and password setting are deliberately separate calls. The code
 * only proves control of the mailbox; the API sets the password with its own
 * credential and flips the membership to active in the same audited step, so a
 * half-finished acceptance leaves a retryable pending invitation rather than an
 * active member who cannot sign in.
 */
const CODE_LENGTH = 6;
const MIN_PASSWORD_LENGTH = 12;

function codeErrorMessage(error: unknown): string {
  if (error instanceof AdminAuthError) {
    if (error.code === 'EXPIRED_CODE') {
      return 'انتهت صلاحية الرمز. اطلب رمزًا جديدًا.';
    }
    if (error.code === 'INVALID_CODE' || error.code === 'INVALID_CREDENTIALS') {
      return 'الرمز غير صحيح. تأكد من آخر رسالة وصلتك.';
    }
    if (error.code === 'RATE_LIMITED') {
      return 'تكررت المحاولات بسرعة. انتظر قليلًا ثم حاول مرة أخرى.';
    }
    if (error.code === 'NETWORK') {
      return 'تعذّر الاتصال بخدمة الدخول. تحقق من الشبكة وحاول مرة أخرى.';
    }
    if (error.code === 'UNSUPPORTED') {
      return 'هذه النسخة المحلية لا ترسل رموزًا بالبريد.';
    }
  }
  return 'تعذّر التحقق من الرمز. حاول مرة أخرى.';
}

function acceptErrorMessage(error: unknown): string {
  if (error instanceof AdminRepositoryError) {
    if (error.code === 'CONFLICT') return 'قُبلت هذه الدعوة من قبل. سجّل الدخول بكلمة مرورك.';
    if (error.code === 'FORBIDDEN') return 'لا توجد دعوة مرتبطة بهذا البريد.';
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [step, setStep] = useState<'code' | 'password' | 'done'>('code');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  // Tracks which email the code came from. Supabase issues invitation tokens
  // and re-sent sign-in codes under different types, so this is remembered
  // rather than guessed.
  const [purpose, setPurpose] = useState<EmailCodePurpose>('invite');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [invitation, setInvitation] = useState<AdminInvitationState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const linkConsumed = useRef(false);

  /**
   * Accepts the token an invitation link carries.
   *
   * Supabase's default invite email sends a link, not a visible code, so
   * without this an invitee lands on a form asking for something they were
   * never sent. The token is removed from the URL immediately: leaving a
   * single-use credential in the address bar puts it into history, and into
   * the Referer header of anything the page loads next.
   */
  useEffect(() => {
    const tokenHash = searchParams.get('token_hash');
    if (!tokenHash || linkConsumed.current) return;
    linkConsumed.current = true;
    const linkPurpose: EmailCodePurpose =
      searchParams.get('type') === 'invite' ? 'invite' : 'signin';
    setSearchParams(new URLSearchParams(), { replace: true });

    void (async () => {
      setBusy(true);
      try {
        await authGateway.verifyEmailLink(tokenHash, linkPurpose);
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
        setError(codeErrorMessage(caught));
      } finally {
        setBusy(false);
      }
    })();
  }, [authGateway, repository, searchParams, setSearchParams]);

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await authGateway.verifyEmailCode(email, code, purpose);
      // The session now exists, but it does not by itself mean this person was
      // invited to the Studio: confirm the membership before offering to set a
      // password for it.
      const state = await repository.readInvitation();
      if (state.status === 'none') {
        setError('لا توجد دعوة إلى الاستوديو مرتبطة بهذا البريد.');
        await authGateway.signOut();
        return;
      }
      if (state.status === 'active') {
        setError('قُبلت هذه الدعوة من قبل. سجّل الدخول بكلمة مرورك.');
        await authGateway.signOut();
        return;
      }
      setInvitation(state);
      setStep('password');
    } catch (caught) {
      setError(codeErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await authGateway.sendEmailCode(email);
      setPurpose('signin');
      setCode('');
      setNotice('أرسلنا رمزًا جديدًا. استخدم آخر رسالة وصلتك.');
    } catch (caught) {
      setError(codeErrorMessage(caught));
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
              {step === 'code'
                ? 'أدخل بريدك والرمز الذي وصلك، ثم اختر كلمة مرور.'
                : step === 'password'
                  ? 'بقي أن تختار كلمة مرور لحسابك.'
                  : 'اكتمل إعداد حسابك.'}
            </p>
          </div>
        </header>

        <ol className="invite-steps" aria-label="خطوات قبول الدعوة">
          <li aria-current={step === 'code' ? 'step' : undefined}>التحقق من البريد</li>
          <li aria-current={step === 'password' ? 'step' : undefined}>كلمة المرور</li>
          <li aria-current={step === 'done' ? 'step' : undefined}>تم</li>
        </ol>

        {step === 'code' ? (
          <form className="auth-form" onSubmit={(event) => void verify(event)}>
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
            <Field label={`رمز التأكيد (${CODE_LENGTH} أرقام)`}>
              <Input
                name="code"
                value={code}
                dir="ltr"
                lang="en"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={CODE_LENGTH}
                required
                disabled={busy}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
              />
            </Field>
            {notice ? (
              <p className="notice" role="status">
                {notice}
              </p>
            ) : null}
            {error ? (
              <p className="notice notice--error" role="alert">
                {error}
              </p>
            ) : null}
            <Button
              className="auth-form__submit"
              type="submit"
              variant="primary"
              disabled={busy || code.length !== CODE_LENGTH}
              aria-busy={busy}
            >
              {busy ? 'جارٍ التحقق…' : 'تأكيد الرمز'}
            </Button>
            <Button
              type="button"
              variant="quiet"
              disabled={busy || !email}
              onClick={() => void resend()}
            >
              انتهت صلاحية الرمز؟ أرسل رمزًا جديدًا
            </Button>
          </form>
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
