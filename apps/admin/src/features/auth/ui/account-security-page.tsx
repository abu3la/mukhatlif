import { type ChangeEvent, type FormEvent, useState } from 'react';
import { useAdminAuth } from '@/application';
import { AdminAuthError, MIN_ADMIN_PASSWORD_LENGTH } from '@/data';
import { Button, Field, Input, PageHeader } from '@/shared/ui/primitives';

const VERIFICATION_CODE_LENGTH = 6;

function passwordErrorMessage(error: unknown, action: 'send' | 'save'): string {
  if (error instanceof AdminAuthError) {
    if (error.code === 'INVALID_VERIFICATION_CODE') {
      return 'الرمز غير صحيح أو انتهت صلاحيته. أرسل رمزًا جديدًا وحاول مرة أخرى.';
    }
    if (error.code === 'WEAK_PASSWORD') {
      return 'اختر كلمة مرور أقوى تحتوي على 12 محرفًا على الأقل.';
    }
    if (error.code === 'RATE_LIMITED') {
      return 'تكررت المحاولات بسرعة. انتظر قليلًا ثم حاول مرة أخرى.';
    }
    if (error.code === 'NETWORK') {
      return 'تعذّر الاتصال بخدمة الدخول. تحقق من الشبكة وحاول مرة أخرى.';
    }
    if (error.code === 'INVALID_CREDENTIALS') {
      return 'انتهت الجلسة. سجّل الدخول ثم حاول مرة أخرى.';
    }
  }
  return action === 'send'
    ? 'تعذّر إرسال الرمز. حاول مرة أخرى.'
    : 'تعذّر حفظ كلمة المرور. حاول مرة أخرى.';
}

function normalizeVerificationCode(value: string): string {
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
  const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
  return value
    .replace(/[٠-٩]/g, (digit) => String(arabicDigits.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(persianDigits.indexOf(digit)))
    .replace(/\D/g, '')
    .slice(0, VERIFICATION_CODE_LENGTH);
}

export function AccountSecurityView() {
  const auth = useAdminAuth();
  const [verificationSent, setVerificationSent] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  function clearFeedback() {
    setError('');
    setSaved(false);
  }

  async function requestVerificationCode() {
    clearFeedback();
    try {
      await auth.requestPasswordChangeVerification();
      setVerificationSent(true);
      setVerificationCode('');
    } catch (caught) {
      setError(passwordErrorMessage(caught, 'send'));
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFeedback();
    if (!/^\d{6}$/.test(verificationCode)) {
      setError('أدخل رمز التحقق المكوّن من 6 أرقام.');
      return;
    }
    if (password.length < MIN_ADMIN_PASSWORD_LENGTH) {
      setError(`استخدم ${MIN_ADMIN_PASSWORD_LENGTH} محرفًا على الأقل.`);
      return;
    }
    if (password !== confirmation) {
      setError('كلمتا المرور غير متطابقتين.');
      return;
    }
    try {
      await auth.changePassword(password, verificationCode);
      setVerificationCode('');
      setPassword('');
      setConfirmation('');
      setSaved(true);
    } catch (caught) {
      setError(passwordErrorMessage(caught, 'save'));
    }
  }

  function updateVerificationCode(event: ChangeEvent<HTMLInputElement>) {
    setVerificationCode(normalizeVerificationCode(event.target.value));
    clearFeedback();
  }

  return (
    <>
      <PageHeader title="أمان الحساب" />
      <section className="card account-security" aria-labelledby="password-settings-title">
        <header className="account-security__header">
          <h2 id="password-settings-title">تغيير كلمة المرور</h2>
          <p>سنرسل رمز تحقق إلى بريدك قبل تغيير كلمة المرور.</p>
          {auth.viewer ? (
            <bdi className="account-security__email" dir="ltr">
              {auth.viewer.email}
            </bdi>
          ) : null}
        </header>

        {!verificationSent ? (
          <div className="account-security__form" aria-live="polite">
            {error ? (
              <p className="notice notice--error" role="alert">
                {error}
              </p>
            ) : null}
            <Button
              className="account-security__submit"
              type="button"
              variant="primary"
              disabled={auth.isSubmitting}
              aria-busy={auth.isSubmitting}
              onClick={() => void requestVerificationCode()}
            >
              {auth.isSubmitting ? 'جارٍ الإرسال…' : 'إرسال رمز التحقق'}
            </Button>
          </div>
        ) : saved ? (
          <div className="account-security__form">
            <p className="notice notice--success" role="status">
              حُفظت كلمة المرور. استخدمها عند تسجيل الدخول القادم.
            </p>
          </div>
        ) : (
          <form
            className="account-security__form"
            aria-label="تغيير كلمة المرور"
            onSubmit={(event) => void submit(event)}
          >
            <p className="notice notice--success" role="status">
              أرسلنا رمزًا من 6 أرقام إلى بريدك.
            </p>

            <Field label="رمز التحقق" hint="أدخل الرمز المكوّن من 6 أرقام.">
              <Input
                className="account-security__code"
                type="text"
                name="verification-code"
                value={verificationCode}
                dir="ltr"
                lang="en"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={VERIFICATION_CODE_LENGTH}
                required
                disabled={auth.isSubmitting}
                onChange={updateVerificationCode}
              />
            </Field>
            <Field
              label="كلمة المرور الجديدة"
              hint={`${MIN_ADMIN_PASSWORD_LENGTH} محرفًا على الأقل.`}
            >
              <Input
                type="password"
                name="new-password"
                value={password}
                dir="ltr"
                lang="en"
                autoComplete="new-password"
                minLength={MIN_ADMIN_PASSWORD_LENGTH}
                required
                disabled={auth.isSubmitting}
                onChange={(event) => {
                  setPassword(event.target.value);
                  clearFeedback();
                }}
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
                minLength={MIN_ADMIN_PASSWORD_LENGTH}
                required
                disabled={auth.isSubmitting}
                onChange={(event) => {
                  setConfirmation(event.target.value);
                  clearFeedback();
                }}
              />
            </Field>

            {error ? (
              <p className="notice notice--error" role="alert">
                {error}
              </p>
            ) : null}

            <div className="account-security__actions">
              <Button
                className="account-security__submit"
                type="submit"
                variant="primary"
                disabled={
                  auth.isSubmitting ||
                  verificationCode.length !== VERIFICATION_CODE_LENGTH ||
                  password.length < MIN_ADMIN_PASSWORD_LENGTH ||
                  confirmation.length < MIN_ADMIN_PASSWORD_LENGTH
                }
                aria-busy={auth.isSubmitting}
              >
                {auth.isSubmitting ? 'جارٍ الحفظ…' : 'حفظ كلمة المرور'}
              </Button>
              <button
                className="account-security__resend"
                type="button"
                disabled={auth.isSubmitting}
                onClick={() => void requestVerificationCode()}
              >
                إرسال رمز جديد
              </button>
            </div>
          </form>
        )}
      </section>
    </>
  );
}
