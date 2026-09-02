'use client';

import { useId, useState, type FormEvent } from 'react';
import {
  buildNewsletterSubscriptionPayload,
  hasNewsletterValidationErrors,
  submitNewsletterSubscription,
  validateNewsletterSubscription,
  type NewsletterValidationErrors,
} from './newsletter-signup-model';

type SubmissionState =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting' }
  | { readonly status: 'success' }
  | { readonly status: 'error'; readonly message: string };

interface NewsletterSignupProps {
  readonly apiOrigin: string | null;
}

export function NewsletterSignup({ apiOrigin }: NewsletterSignupProps) {
  const prefix = useId().replaceAll(':', '');
  const emailErrorId = `${prefix}-email-error`;
  const consentErrorId = `${prefix}-consent-error`;
  const [state, setState] = useState<SubmissionState>({ status: 'idle' });
  const [errors, setErrors] = useState<NewsletterValidationErrors>({});

  function clearFieldError(field: keyof NewsletterValidationErrors) {
    setErrors((current) => ({ ...current, [field]: undefined }));
    if (state.status === 'error') setState({ status: 'idle' });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.status === 'submitting') return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    const validationErrors = validateNewsletterSubscription(formData);
    setErrors(validationErrors);
    if (hasNewsletterValidationErrors(validationErrors)) return;

    setState({ status: 'submitting' });
    const result = await submitNewsletterSubscription(
      apiOrigin,
      buildNewsletterSubscriptionPayload(formData),
    );
    if (!result.ok) {
      setState({ status: 'error', message: result.message });
      return;
    }

    form.reset();
    setState({ status: 'success' });
  }

  return (
    <section className="newsletter-signup" aria-labelledby={`${prefix}-title`}>
      <h2 className="newsletter-signup__title" id={`${prefix}-title`}>
        النشرة البريدية
      </h2>
      <p className="newsletter-signup__intro">ملخصات من مختلف تصل إلى بريدك.</p>

      {state.status === 'success' ? (
        <div className="newsletter-signup__success" role="status" aria-live="polite">
          <p>استلمنا طلب اشتراكك.</p>
          <button type="button" onClick={() => setState({ status: 'idle' })}>
            الاشتراك ببريد آخر
          </button>
        </div>
      ) : (
        <form
          className="newsletter-signup__form"
          noValidate
          onSubmit={submit}
          aria-busy={state.status === 'submitting'}
        >
          <div className="newsletter-signup__fields">
            <div className="newsletter-signup__field">
              <label htmlFor={`${prefix}-first-name`}>
                الاسم الأول <span>(اختياري)</span>
              </label>
              <input
                id={`${prefix}-first-name`}
                name="firstName"
                type="text"
                autoComplete="given-name"
                maxLength={160}
              />
            </div>
            <div className="newsletter-signup__field">
              <label htmlFor={`${prefix}-email`}>البريد الإلكتروني</label>
              <input
                id={`${prefix}-email`}
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                maxLength={254}
                required
                dir="ltr"
                aria-invalid={errors.email ? true : undefined}
                aria-describedby={errors.email ? emailErrorId : undefined}
                onChange={() => clearFieldError('email')}
              />
              {errors.email ? (
                <p className="newsletter-signup__field-error" id={emailErrorId} role="alert">
                  {errors.email}
                </p>
              ) : null}
            </div>
          </div>

          <div className="newsletter-signup__honeypot" aria-hidden="true">
            <label htmlFor={`${prefix}-company-website`}>موقع الشركة</label>
            <input
              id={`${prefix}-company-website`}
              name="companyWebsite"
              type="text"
              tabIndex={-1}
              autoComplete="off"
            />
          </div>

          <label className="newsletter-signup__consent">
            <input
              name="consentAccepted"
              type="checkbox"
              required
              aria-invalid={errors.consent ? true : undefined}
              aria-describedby={errors.consent ? consentErrorId : undefined}
              onChange={() => clearFieldError('consent')}
            />
            <span>أوافق على تلقي النشرة البريدية من مختلف، ويمكنني إلغاء الاشتراك في أي وقت.</span>
          </label>
          {errors.consent ? (
            <p className="newsletter-signup__field-error" id={consentErrorId} role="alert">
              {errors.consent}
            </p>
          ) : null}

          <button
            className="newsletter-signup__submit"
            type="submit"
            disabled={state.status === 'submitting'}
          >
            {state.status === 'submitting' ? 'جارٍ الاشتراك…' : 'الاشتراك في النشرة'}
          </button>
          {state.status === 'error' ? (
            <p className="newsletter-signup__feedback" role="alert">
              {state.message}
            </p>
          ) : null}
        </form>
      )}
    </section>
  );
}
