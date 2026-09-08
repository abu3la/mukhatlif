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
  login: ['تسجيل الدخول', 'متابعة الاستماع والوصول إلى المكتبة.'],
  signup: ['إنشاء حساب', 'حفظ الحلقات والقراءات وإنشاء قوائم تشغيل.'],
  confirm: ['تأكيد البريد الإلكتروني', 'افتح رابط التأكيد في بريدك لإكمال التسجيل.'],
  forgot: ['نسيت كلمة المرور؟', 'أدخل البريد الإلكتروني المرتبط بالحساب.'],
  reset: ['تغيير كلمة المرور', 'اختر كلمة مرور جديدة.'],
  callback: ['تأكيد الحساب', 'جارٍ التحقق من رابط التأكيد…'],
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
  const [linkError, setLinkError] = useState('');
  const [emailChangePending, setEmailChangePending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const client = customer.client;

  useEffect(() => {
    if (mode !== 'callback' && mode !== 'reset') return;
    let active = true;
    setCallbackChecked(false);
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const search = new URLSearchParams(window.location.search);
    const failed = [hash, search].some((params) =>
      ['error', 'error_code', 'error_description'].some((key) => Boolean(params.get(key))),
    );
    setLinkError(failed ? 'انتهت صلاحية الرابط أو تعذّر تأكيده. اطلب رسالة جديدة.' : '');
    const pending =
      !failed &&
      [hash, search].some(
        (params) =>
          params.get('message') ===
          'Confirmation link accepted. Please proceed to confirm link sent to the other email',
      );
    setEmailChangePending(pending);
    if (failed || pending) {
      setCallbackChecked(true);
      return;
    }
    if (!client) return;
    void client.auth.initialize().then(
      ({ error: initializationError }) => {
        if (!active) return;
        if (initializationError) {
          setLinkError('تعذّر تأكيد الرابط. افتح أحدث رابط تأكيد في المتصفح الذي بدأت منه.');
        } else if (new URLSearchParams(window.location.search).has('code')) {
          setLinkError(
            'افتح الرابط في المتصفح الذي بدأت منه، أو اطلب رابطًا جديدًا من هذا المتصفح.',
          );
        }
        setCallbackChecked(true);
      },
      () => {
        if (!active) return;
        setLinkError('تعذّر تأكيد الرابط. حاول فتحه مجددًا.');
        setCallbackChecked(true);
      },
    );
    return () => {
      active = false;
    };
  }, [mode, client]);

  useEffect(() => {
    if (
      ['reset', 'forgot'].includes(mode) ||
      customer.loading ||
      !customer.profile ||
      !customer.user
    )
      return;
    if (mode === 'callback' && (!callbackChecked || linkError || emailChangePending || error))
      return;
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
    linkError,
    emailChangePending,
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
    if (mode === 'reset' && (!callbackChecked || linkError || customer.loading || !customer.user))
      return;
    const form = event.currentTarget;
    const invalid = validateCustomerForm(form);
    setErrors(invalid);
    setError('');
    setMessage('');
    if (Object.keys(invalid).length || !client) return;
    if (mode === 'confirm') {
      await resend();
      return;
    }
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
            setMessage('تأكيد البريد الإلكتروني مطلوب للمتابعة.');
          }
          throw result.error;
        }
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
        setMessage('تم حفظ كلمة المرور الجديدة.');
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
      setMessage('تم إرسال رابط التأكيد. راجع البريد الوارد وغير المرغوب فيه.');
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
      <CustomerAuthFrame
        title={emailChangePending ? 'تأكيد عنوان البريد الآخر' : copy.callback[0]}
        intro={emailChangePending ? 'تغيير البريد يتطلب تأكيد العنوانين الحالي والجديد.' : copy.callback[1]}
      >
        {linkError || error || customer.error ? (
          <>
            <p role="alert">{linkError || error || customer.error}</p>
            <Link className="customer-primary" href={`/confirm?next=${encodeURIComponent(next)}`}>
              إرسال رسالة تأكيد جديدة
            </Link>
            <Link href={`/login?next=${encodeURIComponent(next)}`}>تسجيل الدخول</Link>
          </>
        ) : emailChangePending ? (
          <>
            <p role="status">
              افتح رسالة التأكيد الأخرى في بريدك الحالي أو الجديد، واستخدم رابطها لإكمال التغيير.
            </p>
            <Link
              className="customer-primary"
              href={customer.user ? '/account' : '/login?next=%2Faccount'}
            >
              {customer.user ? 'العودة إلى حسابي' : 'تسجيل الدخول'}
            </Link>
          </>
        ) : (
          <>
            <p role="status">
              {!callbackChecked || customer.loading || customer.user
                ? 'جارٍ تأكيد الحساب…'
                : 'لم نجد جلسة دخول. افتح أحدث رابط تأكيد في البريد الإلكتروني.'}
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

  if (mode === 'reset' && linkError)
    return (
      <CustomerAuthFrame title={copy.reset[0]} intro={copy.reset[1]}>
        <p className="customer-error" role="alert">
          {linkError}
        </p>
        <Link className="customer-primary" href={`/forgot?next=${encodeURIComponent(next)}`}>
          إرسال رابط جديد
        </Link>
      </CustomerAuthFrame>
    );

  const submitLabel = {
    login: 'تسجيل الدخول',
    signup: 'إنشاء حساب',
    confirm: resendAfter ? `إعادة الإرسال بعد ${resendAfter} ث` : 'إعادة إرسال رابط التأكيد',
    forgot: 'إرسال رابط الاستعادة',
    reset: 'حفظ كلمة المرور',
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
            label="تأكيد كلمة المرور"
            error={errors.passwordConfirm}
          />
        )}
        {mode === 'confirm' && (
          <p className="customer-muted">افتح الرابط في المتصفح الذي بدأت منه التسجيل.</p>
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
            إعادة تحميل الحساب
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
              إرسال رابط جديد
            </Link>
          </>
        ) : (
          <button
            className="customer-primary"
            disabled={
              busy ||
              !client ||
              (mode === 'confirm' && resendAfter > 0) ||
              (mode === 'reset' && (!callbackChecked || customer.loading))
            }
          >
            {busy ? 'جارٍ المتابعة…' : submitLabel}
          </button>
        )}
        {mode === 'confirm' && (
          <>
            <p className="customer-muted">بعد تأكيد بريدك، يمكنك تسجيل الدخول من أي جهاز.</p>
            <Link className="customer-form-link" href={`/login?next=${encodeURIComponent(next)}`}>
              تسجيل الدخول
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
              {mode === 'login' ? 'إنشاء حساب' : 'تسجيل الدخول'}
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
