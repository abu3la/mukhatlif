import { type FormEvent, useState } from 'react';
import { useAdminAuth } from '@/application';
import { AdminAuthError, MIN_ADMIN_PASSWORD_LENGTH } from '@/data';
import { Button, Field, Input, PageHeader } from '@/shared/ui/primitives';

function passwordErrorMessage(error: unknown): string {
  if (error instanceof AdminAuthError) {
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
  return 'تعذّر حفظ كلمة المرور. حاول مرة أخرى.';
}

export function AccountSecurityView() {
  const auth = useAdminAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSaved(false);
    if (password.length < MIN_ADMIN_PASSWORD_LENGTH) {
      setError(`استخدم ${MIN_ADMIN_PASSWORD_LENGTH} محرفًا على الأقل.`);
      return;
    }
    if (password !== confirmation) {
      setError('كلمتا المرور غير متطابقتين.');
      return;
    }
    try {
      await auth.changePassword(password);
      setPassword('');
      setConfirmation('');
      setSaved(true);
    } catch (caught) {
      setError(passwordErrorMessage(caught));
    }
  }

  return (
    <>
      <PageHeader title="أمان الحساب" />
      <section className="card account-security" aria-labelledby="password-settings-title">
        <header className="account-security__header">
          <h2 id="password-settings-title">تغيير كلمة المرور</h2>
          <p>ستستخدم كلمة المرور الجديدة عند دخولك القادم إلى الاستوديو.</p>
          {auth.viewer ? (
            <bdi className="account-security__email" dir="ltr">
              {auth.viewer.email}
            </bdi>
          ) : null}
        </header>

        <form
          className="account-security__form"
          aria-label="تغيير كلمة المرور"
          onSubmit={(event) => void submit(event)}
        >
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
                setError('');
                setSaved(false);
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
                setError('');
                setSaved(false);
              }}
            />
          </Field>

          {error ? (
            <p className="notice notice--error" role="alert">
              {error}
            </p>
          ) : null}
          {saved ? (
            <p className="notice notice--success" role="status">
              حُفظت كلمة المرور. استخدمها عند تسجيل الدخول القادم.
            </p>
          ) : null}

          <Button
            className="account-security__submit"
            type="submit"
            variant="primary"
            disabled={
              auth.isSubmitting ||
              password.length < MIN_ADMIN_PASSWORD_LENGTH ||
              confirmation.length < MIN_ADMIN_PASSWORD_LENGTH
            }
            aria-busy={auth.isSubmitting}
          >
            {auth.isSubmitting ? 'جارٍ الحفظ…' : 'حفظ كلمة المرور'}
          </Button>
        </form>
      </section>
    </>
  );
}
