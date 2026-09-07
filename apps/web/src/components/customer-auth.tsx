'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { customerError, safeCustomerReturn } from '@/lib/customer-utils';
import { useCustomer } from './customer-provider';
import {
  CustomerAuthFrame,
  CustomerField,
  CustomerPassword,
  validateCustomerForm,
} from './customer-ui';

type AuthMode = 'login' | 'signup' | 'confirm' | 'forgot' | 'reset' | 'callback';
const copy: Record<AuthMode, [string, string]> = {
  login: ['أهلًا بعودتك.', 'عد إلى ما تحب الاستماع إليه، وتابع من حيث توقفت.'],
  signup: ['حكايتك مع مختلف تبدأ هنا.', 'احفظ ما يعجبك، واجمع حلقاتك في قوائمك.'],
  confirm: [
    'خطوة لتأكيد البريد.',
    'اتبع الرابط في رسالة التأكيد، أو أدخل الرمز إن كان ظاهرًا فيها.',
  ],
  forgot: ['نسيت كلمة المرور؟', 'الاستعادة تبدأ بعنوان البريد المرتبط بحسابك.'],
  reset: ['بداية جديدة.', 'اختر كلمة مرور جديدة.'],
  callback: ['نجهّز حسابك.', 'لحظات وتعود إلى الاستماع.'],
};

export function CustomerAuth({
  mode,
  next: requestedNext,
  email: initialEmail = '',
}: {
  mode: AuthMode;
  next?: string;
  email?: string;
}) {
  const customer = useCustomer();
  const router = useRouter();
  const next = safeCustomerReturn(requestedNext, mode === 'signup' ? '/' : '/account');
  const [email, setEmail] = useState(initialEmail);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [resendAfter, setResendAfter] = useState(0);
  const [callbackChecked, setCallbackChecked] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const client = customer.client;

  useEffect(() => {
    if (mode !== 'callback') return;
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const search = new URLSearchParams(window.location.search);
    if (hash.get('error') || search.get('error'))
      setError('انتهت صلاحية الرابط أو تعذّر تأكيده. اطلب رسالة جديدة.');
    setCallbackChecked(true);
  }, [mode]);

  useEffect(() => {
    if (
      ['reset', 'forgot'].includes(mode) ||
      customer.loading ||
      !customer.profile ||
      !customer.user
    )
      return;
    if (mode === 'callback' && (!callbackChecked || error)) return;
    router.replace(
      customer.profile.onboarded ? next : `/onboarding?next=${encodeURIComponent(next)}`,
    );
  }, [
    mode,
    customer.loading,
    customer.profile,
    customer.user,
    next,
    router,
    callbackChecked,
    error,
  ]);

  useEffect(() => {
    if (resendAfter <= 0) return;
    const timer = window.setTimeout(() => setResendAfter((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [resendAfter]);

  const redirectTo = (path = '/auth/callback') =>
    `${window.location.origin}${path}?next=${encodeURIComponent(next)}`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const invalid = validateCustomerForm(form);
    setErrors(invalid);
    setError('');
    setMessage('');
    if (Object.keys(invalid).length || !client) return;
    const data = new FormData(form);
    const enteredEmail = String(data.get('email') || email).trim();
    const password = String(data.get('password') || '');
    setBusy(true);
    try {
      if (mode === 'signup') {
        const result = await client.auth.signUp({
          email: enteredEmail,
          password,
          options: {
            data: {
              display_name: String(data.get('name')).trim(),
              terms_accepted_at: new Date().toISOString(),
            },
            emailRedirectTo: redirectTo(),
          },
        });
        if (result.error) throw result.error;
        if (result.data.session) await customer.refresh();
        else
          router.push(
            `/confirm?email=${encodeURIComponent(enteredEmail)}&next=${encodeURIComponent(next)}`,
          );
      } else if (mode === 'login') {
        const result = await client.auth.signInWithPassword({ email: enteredEmail, password });
        if (result.error) {
          if (result.error.code === 'email_not_confirmed') {
            setEmail(enteredEmail);
            setMessage('أكّد بريدك قبل المتابعة.');
          }
          throw result.error;
        }
        await customer.refresh();
      } else if (mode === 'confirm') {
        const result = await client.auth.verifyOtp({
          email: enteredEmail,
          token: String(data.get('code')).trim(),
          type: 'signup',
        });
        if (result.error) throw result.error;
        await customer.refresh();
      } else if (mode === 'forgot') {
        const result = await client.auth.resetPasswordForEmail(enteredEmail, {
          redirectTo: redirectTo('/reset'),
        });
        if (result.error) throw result.error;
        setMessage('إذا كان بريدك مرتبطًا بحساب، فستصلك رسالة لاستعادة كلمة المرور.');
      } else if (mode === 'reset') {
        if (password !== String(data.get('passwordConfirm'))) {
          setErrors({ passwordConfirm: 'كلمتا المرور غير متطابقتين.' });
          (form.elements.namedItem('passwordConfirm') as HTMLElement)?.focus();
          return;
        }
        const result = await client.auth.updateUser({ password });
        if (result.error) throw result.error;
        setMessage('حفظنا كلمة المرور الجديدة.');
        await client.auth.signOut();
        router.replace(`/login?next=${encodeURIComponent(next)}`);
      }
    } catch (failure) {
      setError(customerError(failure));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!client || busy || resendAfter) return;
    const target = email.trim();
    if (!target || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
      setErrors({ email: 'أدخل بريدًا إلكترونيًا صحيحًا.' });
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await client.auth.resend({
        type: 'signup',
        email: target,
        options: { emailRedirectTo: redirectTo() },
      });
      if (result.error) throw result.error;
      setMessage('أرسلنا رسالة تأكيد جديدة. راجع بريدك والبريد غير المرغوب فيه.');
      setResendAfter(60);
    } catch (failure) {
      setError(customerError(failure));
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    if (!client) return;
    if (mode === 'signup') {
      const consent = formRef.current?.elements.namedItem('consent');
      if (consent instanceof HTMLInputElement && !consent.checked) {
        setErrors({ consent: 'وافق على الشروط للمتابعة.' });
        consent.focus();
        return;
      }
    }
    setBusy(true);
    setError('');
    const result = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectTo(), queryParams: { prompt: 'select_account' } },
    });
    if (result.error) {
      setError(customerError(result.error));
      setBusy(false);
    }
  }

  if (mode === 'callback')
    return (
      <CustomerAuthFrame title={copy.callback[0]} intro={copy.callback[1]}>
        {error || customer.error ? (
          <>
            <p role="alert">{error || customer.error}</p>
            <Link className="customer-primary" href={`/confirm?next=${encodeURIComponent(next)}`}>
              أرسل رسالة جديدة
            </Link>
            <Link href={`/login?next=${encodeURIComponent(next)}`}>تسجيل الدخول</Link>
          </>
        ) : (
          <>
            <p role="status">
              {customer.loading || customer.user
                ? 'جارٍ تأكيد الحساب…'
                : 'لم نجد جلسة دخول. افتح آخر رابط أرسلناه إلى بريدك.'}
            </p>
            {!customer.loading && !customer.user && (
              <Link className="customer-primary" href={`/login?next=${encodeURIComponent(next)}`}>
                تسجيل الدخول
              </Link>
            )}
          </>
        )}
      </CustomerAuthFrame>
    );

  const submitLabel = {
    login: 'تسجيل الدخول',
    signup: 'أنشئ حسابًا',
    confirm: 'تأكيد',
    forgot: 'أرسل رابط الاستعادة',
    reset: 'احفظ كلمة المرور',
  }[mode];
  return (
    <CustomerAuthFrame title={copy[mode][0]} intro={copy[mode][1]}>
      <form
        ref={formRef}
        onSubmit={submit}
        noValidate
        aria-busy={busy}
        onInput={(event) => {
          const field = event.target;
          if (!(field instanceof HTMLInputElement) || !field.name) return;
          setErrors((current) => {
            if (!current[field.name]) return current;
            const updated = { ...current };
            delete updated[field.name];
            return updated;
          });
        }}
      >
        {!client && !customer.loading && (
          <p className="customer-error" role="alert">
            تسجيل الدخول غير متاح الآن. حاول لاحقًا.
          </p>
        )}
        {customer.config.googleEnabled && (mode === 'login' || mode === 'signup') && (
          <>
            <button
              type="button"
              className="customer-google"
              onClick={() => void google()}
              disabled={busy || !client}
            >
              <img src="/handoff/google.svg" width="20" height="20" alt="" />
              {mode === 'signup' ? 'إنشاء حساب باستخدام Google' : 'تسجيل الدخول باستخدام Google'}
            </button>
            <p className="customer-auth-divider">
              <span>أو بالبريد الإلكتروني</span>
            </p>
          </>
        )}
        {mode === 'signup' && (
          <CustomerField
            name="name"
            label="الاسم"
            required
            maxLength={100}
            autoComplete="name"
            error={errors.name}
          />
        )}
        {mode !== 'reset' && (
          <CustomerField
            name="email"
            label="البريد الإلكتروني"
            type="email"
            dir="ltr"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            placeholder="name@example.com"
            required
            maxLength={254}
            error={errors.email}
          />
        )}
        {(mode === 'login' || mode === 'signup' || mode === 'reset') && (
          <CustomerPassword current={mode === 'login'} error={errors.password} />
        )}
        {mode === 'reset' && (
          <CustomerPassword
            name="passwordConfirm"
            label="أعد كلمة المرور"
            error={errors.passwordConfirm}
          />
        )}
        {mode === 'confirm' && (
          <CustomerField
            name="code"
            label="رمز التأكيد"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            minLength={6}
            maxLength={10}
            dir="ltr"
            error={errors.code}
            hint="استخدم الرمز الموجود في رسالة التأكيد."
          />
        )}
        {mode === 'signup' && (
          <div>
            <label className="customer-check">
              <input
                type="checkbox"
                name="consent"
                required
                aria-invalid={Boolean(errors.consent)}
                aria-describedby="consent-error"
              />
              <span>
                أوافق على{' '}
                <Link href="/terms" target="_blank">
                  الشروط
                </Link>{' '}
                و
                <Link href="/privacy" target="_blank">
                  الخصوصية
                </Link>
                .
              </span>
            </label>
            {errors.consent && (
              <p id="consent-error" className="customer-field-error">
                {errors.consent}
              </p>
            )}
          </div>
        )}
        {mode === 'login' && (
          <Link className="customer-form-link" href={`/forgot?next=${encodeURIComponent(next)}`}>
            نسيت كلمة المرور؟
          </Link>
        )}
        {(error || customer.error) && (
          <p className="customer-error" role="alert">
            {error || customer.error}
          </p>
        )}
        {customer.error && customer.user && (
          <button
            type="button"
            className="customer-text-button"
            disabled={busy}
            onClick={() => void customer.refresh()}
          >
            أعد تحميل الحساب
          </button>
        )}
        {message && (
          <p className="customer-message" role="status">
            {message}
          </p>
        )}
        {mode === 'reset' && !customer.loading && !customer.user ? (
          <>
            <p className="customer-error">افتح رابط الاستعادة من بريدك لتغيير كلمة المرور.</p>
            <Link className="customer-primary" href={`/forgot?next=${encodeURIComponent(next)}`}>
              أرسل رابطًا جديدًا
            </Link>
          </>
        ) : (
          <button className="customer-primary" disabled={busy || !client}>
            {busy ? 'جارٍ المتابعة…' : submitLabel}
          </button>
        )}
        {mode === 'confirm' && (
          <>
            <button
              type="button"
              className="customer-text-button"
              onClick={() => void resend()}
              disabled={busy || !client || resendAfter > 0}
            >
              {resendAfter ? `إعادة الإرسال بعد ${resendAfter} ث` : 'أعد إرسال رسالة التأكيد'}
            </button>
            <Link className="customer-form-link" href={`/signup?next=${encodeURIComponent(next)}`}>
              غيّر البريد الإلكتروني
            </Link>
          </>
        )}
        {mode === 'login' && message && (
          <Link
            className="customer-form-link"
            href={`/confirm?email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`}
          >
            متابعة تأكيد البريد
          </Link>
        )}
        {(mode === 'login' || mode === 'signup') && (
          <p className="customer-auth-switch">
            {mode === 'login' ? 'ليس لديك حساب؟ ' : 'لديك حساب؟ '}
            <Link
              href={`/${mode === 'login' ? 'signup' : 'login'}?next=${encodeURIComponent(next)}`}
            >
              {mode === 'login' ? 'أنشئ حسابًا' : 'سجّل الدخول'}
            </Link>
          </p>
        )}
        {mode === 'forgot' && (
          <Link className="customer-form-link" href={`/login?next=${encodeURIComponent(next)}`}>
            العودة لتسجيل الدخول
          </Link>
        )}
      </form>
    </CustomerAuthFrame>
  );
}
