import { CLIENT_SURFACE_HEADER } from '@mukhtalif/types';

export interface NewsletterSubscriptionPayload {
  readonly email: string;
  readonly firstName?: string;
  readonly consentAccepted: true;
  readonly companyWebsite?: string;
}

export interface NewsletterValidationErrors {
  readonly email?: string;
  readonly consent?: string;
}

export type NewsletterSubscriptionResult =
  { readonly ok: true } | { readonly ok: false; readonly message: string };

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/;
const GENERIC_ERROR = 'تعذّر الاشتراك. تحقق من اتصالك ثم حاول مرة أخرى.';

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

/** Builds the deliberately small public subscription contract and omits blank optional values. */
export function buildNewsletterSubscriptionPayload(
  formData: FormData,
): NewsletterSubscriptionPayload {
  const firstName = text(formData, 'firstName');
  const companyWebsite = text(formData, 'companyWebsite');
  return {
    email: text(formData, 'email'),
    ...(firstName ? { firstName } : {}),
    consentAccepted: true,
    ...(companyWebsite ? { companyWebsite } : {}),
  };
}

/** Keeps browser validation messages precise while the API remains the final authority. */
export function validateNewsletterSubscription(formData: FormData): NewsletterValidationErrors {
  const email = text(formData, 'email');
  const consentAccepted = formData.get('consentAccepted') === 'on';
  return {
    ...(!email
      ? { email: 'أدخل بريدك الإلكتروني.' }
      : !EMAIL_PATTERN.test(email) || email.length > 254
        ? { email: 'أدخل بريدًا إلكترونيًا صحيحًا.' }
        : {}),
    ...(!consentAccepted ? { consent: 'وافق على تلقي النشرة البريدية للمتابعة.' } : {}),
  };
}

export function hasNewsletterValidationErrors(errors: NewsletterValidationErrors): boolean {
  return Boolean(errors.email || errors.consent);
}

function submissionErrorMessage(status: number): string {
  if (status === 429) return 'أرسلت عدة طلبات خلال وقت قصير. حاول لاحقًا.';
  if (status === 400 || status === 422) {
    return 'راجع بريدك الإلكتروني وموافقتك ثم حاول مرة أخرى.';
  }
  return GENERIC_ERROR;
}

/** Sends one anonymous, consented subscription request from the public web surface. */
export async function submitNewsletterSubscription(
  apiBase: string | null,
  payload: NewsletterSubscriptionPayload,
  fetcher: Fetcher = fetch,
): Promise<NewsletterSubscriptionResult> {
  const origin = apiBase?.trim().replace(/\/+$/, '');
  if (!origin) return { ok: false, message: 'خدمة النشرة غير متاحة الآن. حاول لاحقًا.' };

  try {
    const response = await fetcher(`${origin}/newsletter/subscriptions`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        [CLIENT_SURFACE_HEADER]: 'web',
      },
      body: JSON.stringify(payload),
    });

    // The API acknowledges subscriptions asynchronously with 202. Any 2xx
    // acknowledgement is still a successful request from the visitor's view.
    if (response.ok) return { ok: true };
    return { ok: false, message: submissionErrorMessage(response.status) };
  } catch {
    return { ok: false, message: GENERIC_ERROR };
  }
}
