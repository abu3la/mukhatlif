'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  CLIENT_SURFACE_HEADER,
  type RegistrationAnswers,
  type RegistrationForm,
} from '@mukhtalif/types';
import { useCustomer } from '../customer-provider';
import { BusyButton } from '../busy-button';
import './registration.css';
export function Registration({ id }: { id: string }) {
  const { config } = useCustomer();
  const [form, setForm] = useState<RegistrationForm | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<RegistrationAnswers>({});
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [retry, setRetry] = useState(0);
  const requestId = useRef('');
  const sending = useRef(false);
  useEffect(() => {
    setSent(false);
    setAnswers({});
    setFields({});
    setForm(null);
    requestId.current = '';
  }, [id]);
  useEffect(() => {
    const fieldId = Object.keys(fields).find((key) => key !== '_form');
    if (fieldId && !busy) document.getElementById(fieldId)?.focus();
  }, [fields, busy]);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setError('');
    if (!config.apiOrigin) {
      setError('خدمة التسجيل غير متاحة الآن.');
      setLoading(false);
      return;
    }
    fetch(`${config.apiOrigin}/registration/${encodeURIComponent(id)}`, {
      signal: abort.signal,
      cache: 'no-store',
      headers: { [CLIENT_SURFACE_HEADER]: 'web' },
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? 'تعذّر تحميل النموذج.');
        setForm(data);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [id, config.apiOrigin, retry]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current || !form) return;
    sending.current = true;
    setBusy(true);
    setError('');
    setFields({});
    const data = new FormData(event.currentTarget);
    requestId.current ||= crypto.randomUUID();
    try {
      const response = await fetch(`${config.apiOrigin}/registration/${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [CLIENT_SURFACE_HEADER]: 'web' },
        body: JSON.stringify({
          requestId: requestId.current,
          revision: form.revision,
          answers,
          privacyAccepted: data.get('privacy') === 'on',
          companyWebsite: data.get('companyWebsite') ?? '',
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setFields(result.fields ?? {});
        throw new Error(result.error ?? 'تعذّر إرسال التسجيل. حاول مجددًا.');
      }
      setSent(true);
    } catch (e) {
      setError(
        e instanceof Error && /[\u0600-\u06ff]/.test(e.message)
          ? e.message
          : 'تعذّر إرسال التسجيل. تحقق من اتصالك وحاول مجددًا.',
      );
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  function change(key: string, value: string | string[] | boolean) {
    setAnswers((old) => ({ ...old, [key]: value }));
  }
  return (
    <main className="page registration-page">
      {loading ? (
        <p role="status" className="registration-loading">
          <span className="action-loading-indicator" aria-hidden="true" /> تحميل النموذج
        </p>
      ) : !form ? (
        <section>
          <h1>التسجيل</h1>
          <p role="alert">{error}</p>
          <BusyButton onClick={() => setRetry((n) => n + 1)}>إعادة المحاولة</BusyButton>
        </section>
      ) : (
        <>
          <header>
            <h1>{form.title}</h1>
            <p className="registration-description">{form.description}</p>
          </header>
          {sent ? (
            <section className="registration-result" role="status">
              <h2>وصل تسجيلك</h2>
              <p>{form.successMessage}</p>
            </section>
          ) : form.status !== 'published' ? (
            <section className="registration-result">
              <h2>التسجيل مغلق</h2>
              <p>هذا النموذج لا يستقبل تسجيلات جديدة حاليًا.</p>
            </section>
          ) : (
            <form onSubmit={submit} className="registration-sheet">
              <p>
                <span className="registration-required">*</span> مطلوب
              </p>
              <div className="registration-honeypot" aria-hidden="true">
                <label>
                  موقع الشركة
                  <input name="companyWebsite" tabIndex={-1} autoComplete="off" />
                </label>
              </div>
              <fieldset disabled={busy}>
                {form.fields.map((field) => {
                  const hint = `${field.id}-hint`,
                    err = `${field.id}-error`;
                  const common = {
                    id: field.id,
                    required: field.required,
                    'aria-invalid': Boolean(fields[field.id]),
                    'aria-describedby': `${hint} ${err}`,
                  };
                  return (
                    <div className="registration-field" key={field.id}>
                      {field.type !== 'checkbox' && (
                        <label htmlFor={field.id}>
                          {field.label}
                          {field.required && <span className="registration-required"> *</span>}
                        </label>
                      )}
                      {field.help && <p id={hint}>{field.help}</p>}
                      {field.type === 'textarea' ? (
                        <textarea
                          {...common}
                          maxLength={6000}
                          value={String(answers[field.id] ?? '')}
                          onChange={(e) => change(field.id, e.target.value)}
                        />
                      ) : field.type === 'select' ? (
                        <select
                          {...common}
                          value={String(answers[field.id] ?? '')}
                          onChange={(e) => change(field.id, e.target.value)}
                        >
                          <option value="">اختر من القائمة</option>
                          {field.options.map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                        </select>
                      ) : field.type === 'multiselect' ? (
                        <div role="group" aria-label={field.label}>
                          {field.options.map((o) => (
                            <label className="registration-choice" key={o}>
                              <input
                                type="checkbox"
                                checked={
                                  Array.isArray(answers[field.id]) &&
                                  (answers[field.id] as string[]).includes(o)
                                }
                                onChange={(e) => {
                                  const previous = Array.isArray(answers[field.id])
                                    ? (answers[field.id] as string[])
                                    : [];
                                  change(
                                    field.id,
                                    e.target.checked
                                      ? [...previous, o]
                                      : previous.filter((v) => v !== o),
                                  );
                                }}
                              />
                              {o}
                            </label>
                          ))}
                        </div>
                      ) : field.type === 'checkbox' ? (
                        <label className="registration-choice">
                          <input
                            {...common}
                            type="checkbox"
                            checked={answers[field.id] === true}
                            onChange={(e) => change(field.id, e.target.checked)}
                          />
                          {field.label}
                          {field.required && <span className="registration-required"> *</span>}
                        </label>
                      ) : (
                        <input
                          {...common}
                          type={
                            field.type === 'phone'
                              ? 'tel'
                              : field.type === 'number'
                                ? 'text'
                                : field.type
                          }
                          inputMode={field.type === 'number' ? 'decimal' : undefined}
                          maxLength={500}
                          value={String(answers[field.id] ?? '')}
                          onChange={(e) => change(field.id, e.target.value)}
                        />
                      )}
                      {fields[field.id] && (
                        <p id={err} className="registration-error">
                          {fields[field.id]}
                        </p>
                      )}
                    </div>
                  );
                })}
                <label className="registration-choice registration-privacy">
                  <input type="checkbox" name="privacy" required />{' '}
                  <span>
                    أوافق على استخدام بياناتي لإدارة هذا التسجيل والتواصل بشأنه وفق{' '}
                    <Link href="/privacy" target="_blank">
                      سياسة الخصوصية
                    </Link>
                    .
                  </span>
                </label>
              </fieldset>
              {error && (
                <p role="alert" className="registration-error">
                  {error}
                </p>
              )}
              <BusyButton
                type="submit"
                className="registration-submit"
                aria-busy={busy}
                loadingMode="replace"
              >
                إرسال
              </BusyButton>
            </form>
          )}
        </>
      )}
    </main>
  );
}
