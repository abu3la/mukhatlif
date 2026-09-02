import { type FormEvent, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { adminPaths, useAdminAuth } from '@/application';
import { AdminAuthError } from '@/data';
import { BrandMark } from '@/shared/ui/brand-mark';
import { Button, Field, Input, Select } from '@/shared/ui/primitives';

function safeReturnTo(value: unknown): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value
    : adminPaths.overview;
}

function signInErrorMessage(error: unknown): string {
  if (error instanceof AdminAuthError) {
    if (error.code === 'INVALID_CREDENTIALS') {
      return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
    }
    if (error.code === 'RATE_LIMITED') {
      return 'تكررت المحاولات بسرعة. انتظر قليلًا ثم حاول مرة أخرى.';
    }
    if (error.code === 'NETWORK') {
      return 'تعذّر الاتصال بخدمة الدخول. تحقق من الشبكة وحاول مرة أخرى.';
    }
  }
  return 'تعذّر تسجيل الدخول. حاول مرة أخرى.';
}

export function LoginView() {
  const location = useLocation();
  const auth = useAdminAuth();
  const returnTo = safeReturnTo(
    (location.state as { returnTo?: unknown } | null)?.returnTo,
  );
  const initialAccount = auth.demoAccounts[0];
  const [selectedDemoId, setSelectedDemoId] = useState(initialAccount?.id ?? '');
  const [email, setEmail] = useState(initialAccount?.email ?? '');
  const [password, setPassword] = useState(initialAccount?.password ?? '');
  const [formError, setFormError] = useState('');
  const selectedAccount = useMemo(
    () => auth.demoAccounts.find((account) => account.id === selectedDemoId),
    [auth.demoAccounts, selectedDemoId],
  );

  if (auth.status === 'authenticated' || auth.status === 'denied') {
    return <Navigate to={returnTo} replace />;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    try {
      await auth.signIn(email, password);
    } catch (error) {
      setFormError(signInErrorMessage(error));
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="login-title">
        <header className="auth-panel__header">
          <BrandMark height={30} />
          <div>
            <h1 id="login-title">الدخول إلى استوديو الإدارة</h1>
            <p>استخدم حساب فريق مختلف المصرّح له.</p>
          </div>
        </header>

        {auth.demoAccounts.length > 0 ? (
          <section className="demo-account-panel" aria-labelledby="demo-account-title">
            <div>
              <h2 id="demo-account-title">حسابات العرض المحلية</h2>
              <p>اختر حسابًا لتجربة الصلاحيات في نسخة الاجتماع.</p>
            </div>
            <Field label="حساب العرض">
              <Select
                value={selectedDemoId}
                onChange={(event) => {
                  const account = auth.demoAccounts.find(
                    (candidate) => candidate.id === event.target.value,
                  );
                  setSelectedDemoId(event.target.value);
                  if (account) {
                    setEmail(account.email);
                    setPassword(account.password);
                  }
                }}
              >
                {auth.demoAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </Select>
            </Field>
            {selectedAccount ? (
              <p className="demo-account-panel__credentials">
                <bdi dir="ltr">{selectedAccount.email}</bdi>
                <span aria-hidden="true"> · </span>
                <bdi dir="ltr">{selectedAccount.password}</bdi>
              </p>
            ) : null}
          </section>
        ) : null}

        <form className="auth-form" onSubmit={(event) => void submit(event)}>
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
              disabled={auth.isSubmitting}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <Field label="كلمة المرور">
            <Input
              type="password"
              name="password"
              value={password}
              dir="ltr"
              lang="en"
              autoComplete="current-password"
              required
              disabled={auth.isSubmitting}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          {formError || auth.status === 'error' ? (
            <p className="notice notice--error" role="alert">
              {formError || 'تعذّر التحقق من الجلسة. حاول مرة أخرى.'}
            </p>
          ) : null}
          <Button
            className="auth-form__submit"
            type="submit"
            variant="primary"
            disabled={auth.isSubmitting || auth.status === 'restoring'}
            aria-busy={auth.isSubmitting}
          >
            {auth.isSubmitting ? 'جارٍ تسجيل الدخول…' : 'تسجيل الدخول'}
          </Button>
        </form>
      </section>
    </main>
  );
}
