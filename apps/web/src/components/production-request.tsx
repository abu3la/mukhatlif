'use client';

import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { CLIENT_SURFACE_HEADER } from '@mukhtalif/types';

type Draft = Record<string, string>;
const services = ['بودكاست', 'سلسلة مرئية', 'قصة علامة', 'أحتاج مساعدة في تحديد الشكل'];
const scopes = ['حلقة أو فيلم واحد', 'حلقة تجريبية لسلسلة', 'موسم كامل', 'تطوير الفكرة أولًا'];
const budgets = [
  'أقل من 25 ألف ريال',
  '25 إلى 75 ألف ريال',
  '75 إلى 150 ألف ريال',
  'أكثر من 150 ألف ريال',
  'لم أحدد بعد',
];
const timelines = ['خلال شهر', 'خلال 3 أشهر', 'بعد 3 أشهر', 'الجدول مرن'];

export function ProductionRequest({
  apiOrigin,
  initialService = '',
}: {
  apiOrigin: string | null;
  initialService?: string;
}) {
  const [step, setStep] = useState(1),
    [draft, setDraft] = useState<Draft>({
      service: services.includes(initialService) ? initialService : '',
    });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [sent, setSent] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  function transition(next: number) {
    setStep(next);
    setErrors({});
    setError('');
    requestAnimationFrame(() => heading.current?.focus());
  }
  function field(name: string, label: string, options?: string[], type = 'text', optional = false) {
    const props = {
      name,
      id: 'production-' + name,
      defaultValue: draft[name] || '',
      required: !optional,
      'aria-invalid': Boolean(errors[name]),
      'aria-describedby': 'production-' + name + '-error',
    };
    return (
      <div className="request-form__field">
        <label htmlFor={props.id}>
          {label}
          {optional ? ' (اختياري)' : ''}
        </label>
        {options ? (
          <select {...props}>
            <option value="">اختر</option>
            {options.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        ) : type === 'textarea' ? (
          <textarea {...props} rows={5} maxLength={name === 'idea' ? 4000 : 500} />
        ) : (
          <input
            {...props}
            type={type}
            maxLength={type === 'email' ? 254 : type === 'tel' ? 30 : 160}
            autoComplete={
              name === 'name'
                ? 'name'
                : name === 'email'
                  ? 'email'
                  : name === 'phone'
                    ? 'tel'
                    : 'off'
            }
            dir={type === 'email' || type === 'tel' ? 'ltr' : undefined}
          />
        )}
        <span
          id={props['aria-describedby']}
          className="request-form__feedback"
          role={errors[name] ? 'alert' : undefined}
        >
          {errors[name]}
        </span>
      </div>
    );
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || unknown) return;
    const form = event.currentTarget,
      next = { ...draft },
      invalid: Record<string, string> = {};
    for (const control of Array.from(form.elements)) {
      if (
        !(
          control instanceof HTMLInputElement ||
          control instanceof HTMLSelectElement ||
          control instanceof HTMLTextAreaElement
        ) ||
        !control.name
      )
        continue;
      next[control.name] = control.value.trim();
      if (
        control.required &&
        (control.type === 'checkbox'
          ? !(control as HTMLInputElement).checked
          : !control.value.trim())
      )
        invalid[control.name] =
          control.type === 'checkbox' ? 'وافق على الخصوصية للمتابعة.' : 'أكمل هذا الحقل.';
      else if (
        control.name === 'phone' &&
        (!/^\+?[0-9٠-٩۰-۹\s().-]{7,30}$/.test(control.value.trim()) ||
          control.value.replace(/[^0-9٠-٩۰-۹]/g, '').length < 7)
      )
        invalid[control.name] = 'أدخل رقم جوال صحيحًا.';
      else if (control.validity.typeMismatch)
        invalid[control.name] =
          control.type === 'email' ? 'أدخل بريدًا إلكترونيًا صحيحًا.' : 'راجع هذا الحقل.';
    }
    setDraft(next);
    setErrors(invalid);
    if (Object.keys(invalid).length) {
      (form.elements.namedItem(Object.keys(invalid)[0]!) as HTMLElement | null)?.focus();
      return;
    }
    if (step < 3) {
      transition(step + 1);
      return;
    }
    if (!apiOrigin) {
      setError('خدمة الطلبات غير متاحة الآن. حاول لاحقًا.');
      return;
    }
    if (
      ![
        'idea',
        'service',
        'audience',
        'scope',
        'budget',
        'timeline',
        'name',
        'email',
        'phone',
      ].every((key) => next[key])
    ) {
      transition(1);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const details = [
        ['الفكرة', next.idea],
        ['الجمهور', next.audience],
        ['شكل الإنتاج', next.service],
        ['نطاق العمل', next.scope],
        ['الميزانية التقريبية', next.budget],
        ['موعد الإطلاق', next.timeline],
      ]
        .map(([name, value]) => `${name}: ${value}`)
        .join('\n\n');
      const response = await fetch(`${apiOrigin.replace(/\/$/, '')}/forms/production_service`, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          [CLIENT_SURFACE_HEADER]: 'web',
        },
        body: JSON.stringify({
          payload: {
            name: next.name,
            email: next.email,
            phone: next.phone,
            ...(next.organizationName ? { organizationName: next.organizationName } : {}),
            details,
          },
          privacyAccepted: true,
          companyWebsite: next.companyWebsite || '',
        }),
      });
      if (!response.ok) {
        if (response.status === 503) {
          const result = (await response.json().catch(() => null)) as { code?: string } | null;
          if (result?.code === 'SUBMISSION_STATUS_UNKNOWN') {
            setUnknown(true);
            return;
          }
        }
        setError(
          response.status === 429
            ? 'أرسلت عدة طلبات خلال وقت قصير. انتظر قليلًا ثم حاول مرة أخرى.'
            : response.status === 400
              ? 'راجع بيانات الطلب، ثم أرسله مرة أخرى.'
              : 'تعذّر إرسال الطلب. تحقق من اتصالك ثم حاول مرة أخرى.',
        );
        return;
      }
      setSent(true);
    } catch {
      setError('تعذّر إرسال الطلب. تحقق من اتصالك ثم حاول مرة أخرى.');
    } finally {
      setBusy(false);
    }
  }
  if (unknown)
    return (
      <section className="request-form__success" role="alert">
        <h2>لم تتأكد حالة طلبك بعد.</h2>
        <p>قد يكون الطلب وصل إلى الفريق. لا تعِد إرساله الآن لتجنب تكراره، وتحقق لاحقًا.</p>
        <Link className="public-text-action" href="/">
          العودة للرئيسية
        </Link>
      </section>
    );
  if (sent)
    return (
      <section className="request-form__success" role="status">
        <h2>وصل طلبك إلى مختلف.</h2>
        <p>حفظنا فكرتك وتفاصيل المشروع، وسنتواصل معك عبر بياناتك.</p>
        <Link className="public-primary" href="/">
          العودة للرئيسية
        </Link>
      </section>
    );
  return (
    <div className="public-production">
      <p className="public-production__step">الخطوة {step} من 3</p>
      <h2 ref={heading} tabIndex={-1}>
        {step === 1 ? 'الفكرة' : step === 2 ? 'النطاق وبيانات التواصل' : 'راجع طلبك'}
      </h2>
      <form
        key={step}
        className="request-form"
        onSubmit={(event) => void submit(event)}
        noValidate
        aria-busy={busy}
      >
        {step === 1 ? (
          <>
            {field('idea', 'ما الفكرة التي تريد إنتاجها؟', undefined, 'textarea')}
            {field('service', 'شكل الإنتاج', services)}
            {field('audience', 'لمن تصنع هذا المحتوى؟')}
          </>
        ) : step === 2 ? (
          <>
            {field('scope', 'نطاق العمل', scopes)}
            {field('budget', 'الميزانية التقريبية', budgets)}
            <p className="request-form__hint">ميزانية تقترحها لمشروعك، وليست أسعار خدمات مختلف.</p>
            {field('timeline', 'موعد الإطلاق', timelines)}
            <div className="request-form__row">
              {field('name', 'اسمك')}
              {field('email', 'البريد الإلكتروني', undefined, 'email')}
            </div>
            <div className="request-form__row">
              {field('phone', 'رقم الجوال', undefined, 'tel')}
              {field('organizationName', 'اسم الجهة', undefined, 'text', true)}
            </div>
          </>
        ) : (
          <>
            <dl className="public-request-summary">
              {[
                ['الفكرة', 'idea'],
                ['الجمهور', 'audience'],
                ['الشكل', 'service'],
                ['النطاق', 'scope'],
                ['الميزانية', 'budget'],
                ['الإطلاق', 'timeline'],
                ['الاسم', 'name'],
                ['البريد الإلكتروني', 'email'],
                ['الجوال', 'phone'],
              ].map(([label, key]) => (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>
                    <bdi>{draft[key!]}</bdi>
                  </dd>
                </div>
              ))}
            </dl>
            <label className="request-form__privacy">
              <input
                name="privacyAccepted"
                type="checkbox"
                required
                aria-invalid={Boolean(errors.privacyAccepted)}
              />
              <span>
                أوافق على استخدام بياناتي لمتابعة الطلب وفق{' '}
                <Link href="/privacy">سياسة الخصوصية</Link>.
              </span>
            </label>
            {errors.privacyAccepted ? (
              <p role="alert" className="request-form__feedback">
                {errors.privacyAccepted}
              </p>
            ) : null}
            <div className="newsletter-signup__honeypot" aria-hidden="true">
              <label>
                موقع الشركة
                <input name="companyWebsite" tabIndex={-1} autoComplete="off" />
              </label>
            </div>
          </>
        )}
        {error ? (
          <p role="alert" className="request-form__feedback">
            {error}
          </p>
        ) : null}
        <div className="public-reading-controls">
          <button type="submit" className="public-primary" disabled={busy}>
            {busy
              ? 'جارٍ إرسال الطلب…'
              : step === 1
                ? 'التالي: حدد النطاق'
                : step === 2
                  ? 'التالي: راجع الملخص'
                  : 'أرسل الطلب'}
          </button>
          {step > 1 ? (
            <button
              type="button"
              className="public-text-action"
              disabled={busy}
              onClick={() => {
                const form = heading.current?.parentElement?.querySelector('form');
                if (form)
                  setDraft((current) => ({
                    ...current,
                    ...(Object.fromEntries(new FormData(form).entries()) as Draft),
                  }));
                transition(step - 1);
              }}
            >
              العودة
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
