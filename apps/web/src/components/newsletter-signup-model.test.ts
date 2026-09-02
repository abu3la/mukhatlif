import { describe, expect, it, vi } from 'vitest';
import { CLIENT_SURFACE_HEADER } from '@mukhtalif/types';
import {
  buildNewsletterSubscriptionPayload,
  hasNewsletterValidationErrors,
  submitNewsletterSubscription,
  validateNewsletterSubscription,
} from './newsletter-signup-model';

describe('newsletter subscription model', () => {
  it('trims values and omits blank optional fields from the public contract', () => {
    const formData = new FormData();
    formData.set('email', '  listener@example.com ');
    formData.set('firstName', ' نورة ');
    formData.set('companyWebsite', '');

    expect(buildNewsletterSubscriptionPayload(formData)).toEqual({
      email: 'listener@example.com',
      firstName: 'نورة',
      consentAccepted: true,
    });

    formData.set('companyWebsite', 'https://spam.example');
    expect(buildNewsletterSubscriptionPayload(formData)).toMatchObject({
      companyWebsite: 'https://spam.example',
    });
  });

  it('requires a usable email address and explicit consent', () => {
    const empty = new FormData();
    const emptyErrors = validateNewsletterSubscription(empty);
    expect(emptyErrors).toEqual({
      email: 'أدخل بريدك الإلكتروني.',
      consent: 'وافق على تلقي النشرة البريدية للمتابعة.',
    });
    expect(hasNewsletterValidationErrors(emptyErrors)).toBe(true);

    const invalid = new FormData();
    invalid.set('email', 'not-an-email');
    invalid.set('consentAccepted', 'on');
    expect(validateNewsletterSubscription(invalid)).toEqual({
      email: 'أدخل بريدًا إلكترونيًا صحيحًا.',
    });
  });

  it('posts the exact web contract and accepts an asynchronous 202 acknowledgement', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 202 }));
    const result = await submitNewsletterSubscription(
      'https://api.mukhtalif.example/',
      {
        email: 'listener@example.com',
        firstName: 'نورة',
        consentAccepted: true,
      },
      fetcher,
    );

    expect(result).toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledWith('https://api.mukhtalif.example/newsletter/subscriptions', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        [CLIENT_SURFACE_HEADER]: 'web',
      },
      body: JSON.stringify({
        email: 'listener@example.com',
        firstName: 'نورة',
        consentAccepted: true,
      }),
    });
  });

  it('returns an actionable message for a rate limit and a generic message for network failures', async () => {
    const limited = await submitNewsletterSubscription(
      'https://api.mukhtalif.example',
      { email: 'listener@example.com', consentAccepted: true },
      async () => new Response(null, { status: 429 }),
    );
    expect(limited).toEqual({
      ok: false,
      message: 'أرسلت عدة طلبات خلال وقت قصير. حاول لاحقًا.',
    });

    const offline = await submitNewsletterSubscription(
      'https://api.mukhtalif.example',
      { email: 'listener@example.com', consentAccepted: true },
      async () => {
        throw new Error('offline');
      },
    );
    expect(offline).toEqual({
      ok: false,
      message: 'تعذّر الاشتراك. تحقق من اتصالك ثم حاول مرة أخرى.',
    });
  });
});
