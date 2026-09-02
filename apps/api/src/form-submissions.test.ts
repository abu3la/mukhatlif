import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FormSubmission, PaginatedList } from '@mukhtalif/types';
import { FORM_NOTIFICATION_POLICIES, type Env } from './env';
import app from './index';

const localEnv: Env = {
  APP_ENV: 'development',
  ALLOW_DEV_AUTH: 'true',
  CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
};

const resendEnv: Env = {
  ...localEnv,
  DEPLOYMENT_PLATFORM: 'cloudflare-workers',
  RESEND_ENVIRONMENT: 'development',
  RESEND_API_KEY: 're_test_1234567890',
  FORMS_FROM_EMAIL: 'forms@devmail.mukhtalif.net',
  FORM_NOTIFICATION_RECIPIENTS_JSON: JSON.stringify(
    FORM_NOTIFICATION_POLICIES.development.recipients,
  ),
};

let requestAddress = 10;

function request(
  path: string,
  options: {
    identityId?: string;
    method?: string;
    body?: unknown;
    address?: string;
    env?: Env;
  } = {},
) {
  const headers = new Headers();
  if (options.identityId) headers.set('x-dev-user', options.identityId);
  if (options.body !== undefined) headers.set('content-type', 'application/json');
  headers.set('cf-connecting-ip', options.address ?? `203.0.113.${requestAddress++}`);
  return app.request(
    path,
    {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    },
    options.env ?? localEnv,
  );
}

const envelope = (payload: Record<string, unknown>, companyWebsite = '') => ({
  payload,
  privacyAccepted: true,
  companyWebsite,
});

const validBodies = {
  sponsorship: envelope({
    organizationName: 'شركة الاختبار',
    contactName: 'سارة محمد',
    email: 'sponsor@example.com',
    phone: '+966 50 123 4567',
  }),
  partnership: envelope({
    organizationName: 'مؤسسة الشراكة',
    contactName: 'خالد علي',
    email: 'partner@example.com',
    phone: '+966501234568',
    proposal: 'نقترح إنتاج سلسلة مشتركة حول الاقتصاد الإبداعي.',
  }),
  guest_suggestion: envelope({
    guestName: 'نورة القحطاني',
    profession: 'مهندسة طاقة',
    showName: 'بترولي',
  }),
  careers: envelope({
    name: 'ليان أحمد',
    email: 'career@example.com',
    phone: '+966501234569',
    desiredRole: 'منتجة محتوى',
    whyMukhtalif: 'أؤمن بقيمة المحتوى العربي المتخصص وأرغب في تطويره.',
    skills: 'البحث والتحرير وإدارة الإنتاج.',
  }),
  production_service: envelope({
    name: 'عبدالله صالح',
    email: 'production@example.com',
    phone: '+966501234560',
    details: 'نحتاج إنتاج موسم من ثماني حلقات صوتية.',
  }),
  guest_review: envelope({
    guestName: 'ضيف التجربة',
    showName: 'غلاف',
    overallRating: 5,
    hostRating: 4,
  }),
} as const;

async function studioSubmissions(identityId = 'usr-editor-1'): Promise<FormSubmission[]> {
  const response = await request('/studio/form-submissions', { identityId });
  expect(response.status).toBe(200);
  return (await response.json()) as FormSubmission[];
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('public form intake', () => {
  it('accepts and persists every supported form type', async () => {
    for (const [type, body] of Object.entries(validBodies)) {
      const response = await request(`/forms/${type}`, { method: 'POST', body });
      expect(response.status, type).toBe(202);
      expect(response.headers.get('cache-control'), type).toBe('no-store');
      expect(await response.json()).toEqual({ accepted: true });
    }
    const submissions = await studioSubmissions();
    for (const type of Object.keys(validBodies)) {
      expect(
        submissions.some((submission) => submission.type === type),
        type,
      ).toBe(true);
    }
  });

  it('rejects unknown forms, malformed values, missing consent, and oversized bodies', async () => {
    expect(
      (await request('/forms/not-a-form', { method: 'POST', body: validBodies.sponsorship }))
        .status,
    ).toBe(404);
    expect(
      (
        await request('/forms/sponsorship', {
          method: 'POST',
          body: envelope({ ...validBodies.sponsorship.payload, email: 'not-an-email' }),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request('/forms/sponsorship', {
          method: 'POST',
          body: { payload: validBodies.sponsorship.payload },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request('/forms/partnership', {
          method: 'POST',
          body: envelope({
            ...validBodies.partnership.payload,
            proposal: 'x'.repeat(50_000),
          }),
        })
      ).status,
    ).toBe(413);
  });

  it('rejects unsafe control characters before any public text is stored', async () => {
    for (const character of ['\u0000', '\u001b', '\u0085']) {
      const response = await request('/forms/sponsorship', {
        method: 'POST',
        body: envelope({
          ...validBodies.sponsorship.payload,
          contactName: `سارة${character}محمد`,
        }),
      });
      expect(response.status).toBe(400);
    }

    const multiline = await request('/forms/sponsorship', {
      method: 'POST',
      body: envelope({
        ...validBodies.sponsorship.payload,
        message: 'السطر الأول\nالسطر الثاني',
      }),
    });
    expect(multiline.status).toBe(202);
  });

  it('accepts and normalizes Arabic-Indic phone digits', async () => {
    const marker = `arabic-phone-${crypto.randomUUID()}@example.com`;
    const response = await request('/forms/sponsorship', {
      method: 'POST',
      body: envelope({
        ...validBodies.sponsorship.payload,
        email: marker,
        phone: '+٩٦٦ ٥٠ ١٢٣ ٤٥٦٧',
      }),
    });
    expect(response.status).toBe(202);
    const stored = (await studioSubmissions()).find(
      (submission) => submission.type === 'sponsorship' && submission.payload.email === marker,
    );
    expect(stored?.type).toBe('sponsorship');
    if (stored?.type !== 'sponsorship') throw new Error('Sponsorship submission was not stored');
    expect(stored.payload.phone).toBe('+966 50 123 4567');
  });

  it('silently absorbs the honeypot without creating an inbox record', async () => {
    const marker = `honeypot-${crypto.randomUUID()}@example.com`;
    const response = await request('/forms/sponsorship', {
      method: 'POST',
      body: envelope({ ...validBodies.sponsorship.payload, email: marker }, 'https://spam.example'),
    });
    expect(response.status).toBe(202);
    expect(
      (
        await request('/forms/sponsorship', {
          method: 'POST',
          body: { companyWebsite: 'https://spam.example' },
        })
      ).status,
    ).toBe(202);
    const submissions = await studioSubmissions();
    expect(
      submissions.some(
        (submission) => submission.type === 'sponsorship' && submission.payload.email === marker,
      ),
    ).toBe(false);
  });

  it('rate limits one address and form type with a retry hint', async () => {
    const address = '198.51.100.27';
    for (let index = 0; index < 6; index += 1) {
      expect(
        (
          await request('/forms/guest_review', {
            method: 'POST',
            body: validBodies.guest_review,
            address,
          })
        ).status,
      ).toBe(202);
    }
    const limited = await request('/forms/guest_review', {
      method: 'POST',
      body: validBodies.guest_review,
      address,
    });
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
  });
});

describe('save-first notification delivery', () => {
  it('keeps an unconfigured notification in the Studio inbox', async () => {
    const marker = `unconfigured-${crypto.randomUUID()}@example.com`;
    const response = await request('/forms/sponsorship', {
      method: 'POST',
      body: envelope({ ...validBodies.sponsorship.payload, email: marker }),
    });
    expect(response.status).toBe(202);
    const stored = (await studioSubmissions()).find(
      (submission) => submission.type === 'sponsorship' && submission.payload.email === marker,
    );
    expect(stored).toMatchObject({
      notificationStatus: 'unconfigured',
      notificationAttemptCount: 1,
      notificationError: 'NOTIFICATION_NOT_CONFIGURED',
    });
    expect(stored?.sourceMetadata).not.toHaveProperty('clientAddress');
    expect(stored?.sourceMetadata).not.toHaveProperty('ip');
  });

  it('keeps a deployed routing policy dormant without its API key', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const marker = `unrouted-${crypto.randomUUID()}@example.com`;
    const response = await request('/forms/careers', {
      method: 'POST',
      body: envelope({ ...validBodies.careers.payload, email: marker }),
      env: { ...resendEnv, RESEND_API_KEY: '' },
    });
    expect(response.status).toBe(202);
    expect(fetchMock).not.toHaveBeenCalled();

    const stored = (await studioSubmissions()).find(
      (submission) => submission.type === 'careers' && submission.payload.email === marker,
    );
    expect(stored).toMatchObject({
      notificationStatus: 'unconfigured',
      notificationAttemptCount: 1,
      notificationError: 'NOTIFICATION_NOT_CONFIGURED',
    });
  });

  it('saves when Resend fails, then retries exactly once through the protected endpoint', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'provider unavailable' }), { status: 503 }),
      );
    const marker = `failed-${crypto.randomUUID()}@example.com`;
    const response = await request('/forms/sponsorship', {
      method: 'POST',
      body: envelope({ ...validBodies.sponsorship.payload, email: marker }),
      env: resendEnv,
    });
    expect(response.status).toBe(202);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        'Idempotency-Key': expect.stringMatching(/^form-submission\/frm-/),
      }),
    });
    const outbound = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      from: string;
      to: string[];
      reply_to: string;
      text: string;
    };
    expect(outbound).toMatchObject({
      from: 'forms@devmail.mukhtalif.net',
      to: ['aaahashmi95@gmail.com'],
      reply_to: marker,
    });
    expect(outbound.text.startsWith('وصل طلب جديد إلى استوديو مختلف.\n')).toBe(true);
    expect(outbound.text).not.toContain('تم استلام');
    expect(outbound.text).toContain('البريد الإلكتروني');

    const failed = (await studioSubmissions()).find(
      (submission) => submission.type === 'sponsorship' && submission.payload.email === marker,
    );
    expect(failed).toMatchObject({
      notificationStatus: 'failed',
      notificationAttemptCount: 1,
      notificationAttemptedAt: expect.any(String),
      notificationError: 'DELIVERY_REJECTED',
    });

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'email-provider-123' }), { status: 200 }),
    );
    const retried = await request(`/studio/form-submissions/${failed!.id}/notification/retry`, {
      method: 'POST',
      identityId: 'usr-editor-1',
      env: resendEnv,
    });
    expect(retried.status).toBe(200);
    expect(await retried.json()).toMatchObject({
      notificationStatus: 'sent',
      notificationAttemptCount: 2,
      notificationProviderMessageId: 'email-provider-123',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const duplicate = await request(`/studio/form-submissions/${failed!.id}/notification/retry`, {
      method: 'POST',
      identityId: 'usr-editor-1',
      env: resendEnv,
    });
    expect(duplicate.status).toBe(409);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('saves before rejecting a partially configured notifier', async () => {
    const marker = `invalid-config-${crypto.randomUUID()}@example.com`;
    const response = await request('/forms/sponsorship', {
      method: 'POST',
      body: envelope({ ...validBodies.sponsorship.payload, email: marker }),
      env: { ...localEnv, RESEND_API_KEY: 're_test_1234567890' },
    });
    expect(response.status).toBe(202);

    const stored = (await studioSubmissions()).find(
      (submission) => submission.type === 'sponsorship' && submission.payload.email === marker,
    );
    expect(stored).toMatchObject({
      notificationStatus: 'failed',
      notificationAttemptCount: 1,
      notificationError: 'NOTIFICATION_CONFIG_INVALID',
    });
  });
});

describe('Studio form inbox', () => {
  it('requires Studio membership and the form permissions', async () => {
    expect((await request('/studio/form-submissions')).status).toBe(401);
    expect(
      (await request('/studio/form-submissions', { identityId: 'usr-listener-1' })).status,
    ).toBe(403);
    expect((await request('/studio/form-submissions', { identityId: 'usr-editor-1' })).status).toBe(
      200,
    );
    expect(
      (await request('/studio/form-submissions', { identityId: 'usr-editor-1' })).headers.get(
        'cache-control',
      ),
    ).toBe('private, no-store');
  });

  it('lists, filters, pages, reads, assigns, annotates, and resolves a request', async () => {
    const marker = `workflow-${crypto.randomUUID()}@example.com`;
    await request('/forms/production_service', {
      method: 'POST',
      body: envelope({ ...validBodies.production_service.payload, email: marker }),
    });
    const created = (await studioSubmissions()).find(
      (submission) =>
        submission.type === 'production_service' && submission.payload.email === marker,
    )!;

    const pageResponse = await request(
      '/studio/form-submissions?type=production_service&status=new&page=1&perPage=1',
      { identityId: 'usr-editor-1' },
    );
    expect(pageResponse.status).toBe(200);
    const page = (await pageResponse.json()) as PaginatedList<FormSubmission>;
    expect(page.items).toHaveLength(1);
    expect(page.pageInfo.total).toBeGreaterThan(0);

    expect(
      (await request(`/studio/form-submissions/${created.id}`, { identityId: 'usr-editor-1' }))
        .status,
    ).toBe(200);

    const updated = await request(`/studio/form-submissions/${created.id}`, {
      method: 'PATCH',
      identityId: 'usr-editor-1',
      body: {
        status: 'resolved',
        assigneeId: 'usr-editor-1',
        internalNotes: 'تم التواصل وتحديد اجتماع تمهيدي.',
      },
    });
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({
      status: 'resolved',
      assigneeId: 'usr-editor-1',
      internalNotes: 'تم التواصل وتحديد اجتماع تمهيدي.',
      resolvedAt: expect.any(String),
    });

    const invalidAssignee = await request(`/studio/form-submissions/${created.id}`, {
      method: 'PATCH',
      identityId: 'usr-editor-1',
      body: { assigneeId: 'missing-member' },
    });
    expect(invalidAssignee.status).toBe(422);
  });
});
