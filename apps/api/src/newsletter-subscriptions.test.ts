import { afterEach, describe, expect, it, vi } from 'vitest';
import { mailchimpSubscriberHash } from './mailchimp/audience-client';
import app from './index';
import { getRepository } from './repo';
import { createMemoryRepository } from './repo/memory';
import type { Env } from './env';

const localEnv: Env = {
  APP_ENV: 'development',
  ALLOW_DEV_AUTH: 'true',
  CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
};

const newsletterEnv: Env = {
  ...localEnv,
  NEWSLETTER_MAILCHIMP_SYNC_ENABLED: 'true',
  NEWSLETTER_MAILCHIMP_API_KEY: 'newsletter-api-key-us21',
  NEWSLETTER_MAILCHIMP_SERVER_PREFIX: 'us21',
  NEWSLETTER_MAILCHIMP_AUDIENCE_ID: 'legacy_audience',
};

let requestAddress = 80;

function request(
  body: unknown,
  options: { address?: string; env?: Env; headers?: Record<string, string> } = {},
) {
  return app.request(
    '/newsletter/subscriptions',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': options.address ?? `203.0.113.${requestAddress++}`,
        ...options.headers,
      },
      body: JSON.stringify(body),
    },
    options.env ?? localEnv,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('public newsletter consent intake', () => {
  it('saves explicit consent before reporting an unconfigured provider', async () => {
    const email = `unconfigured-${crypto.randomUUID()}@example.com`;
    const response = await request(
      { email: `  ${email.toUpperCase()} `, firstName: '  سارة  ', consentAccepted: true },
      {
        headers: {
          origin: 'http://localhost:3000',
          referer: 'http://localhost:3000/newsletter?campaign=private-token',
          'user-agent': 'newsletter-test-agent',
        },
      },
    );

    expect(response.status).toBe(202);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ accepted: true });

    const repo = getRepository(localEnv);
    const stored = await repo.getNewsletterSubscriptionByEmail(email);
    expect(stored).toMatchObject({
      email,
      firstName: 'سارة',
      syncStatus: 'unconfigured',
      syncAttemptCount: 1,
      syncError: 'NEWSLETTER_PROVIDER_NOT_CONFIGURED',
    });
    if (!stored) throw new Error('Newsletter subscription was not saved');
    const events = await repo.listNewsletterConsentEvents(stored.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventKind: 'explicit_consent',
      email,
      consentVersion: 1,
      sourceMetadata: {
        formVersion: 1,
        requestOrigin: 'http://localhost:3000',
        referrerOrigin: 'http://localhost:3000',
        referrerPath: '/newsletter',
        userAgent: 'newsletter-test-agent',
      },
    });
    expect(JSON.stringify(events[0])).not.toContain('203.0.113.');
    expect(JSON.stringify(events[0])).not.toContain('private-token');
  });

  it('deduplicates the canonical email while appending every explicit consent event', async () => {
    const email = `dedupe-${crypto.randomUUID()}@example.com`;
    const first = await request({ email, firstName: 'سارة', consentAccepted: true });
    const before = await getRepository(localEnv).getNewsletterSubscriptionByEmail(email);
    const second = await request({
      email: email.toUpperCase(),
      firstName: 'نورة',
      consentAccepted: true,
    });
    const after = await getRepository(localEnv).getNewsletterSubscriptionByEmail(email);

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(await first.json()).toEqual(await second.json());
    expect(after?.id).toBe(before?.id);
    expect(after?.firstName).toBe('نورة');
    expect(await getRepository(localEnv).listNewsletterConsentEvents(after!.id)).toHaveLength(2);
  });

  it('silently absorbs the honeypot without persisting or contacting Mailchimp', async () => {
    const email = `honeypot-${crypto.randomUUID()}@example.com`;
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const response = await request(
      {
        email,
        consentAccepted: true,
        companyWebsite: 'https://spam.example',
      },
      { env: newsletterEnv },
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: true });
    expect(await getRepository(localEnv).getNewsletterSubscriptionByEmail(email)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects missing consent, client-supplied source fields, malformed email, and oversized input', async () => {
    expect((await request({ email: 'person@example.com' })).status).toBe(400);
    expect(
      (
        await request({
          email: 'person@example.com',
          consentAccepted: true,
          source: 'mailchimp-import',
        })
      ).status,
    ).toBe(400);
    expect((await request({ email: 'not-email', consentAccepted: true })).status).toBe(400);
    expect(
      (
        await request({
          email: 'person@example.com',
          firstName: 'x'.repeat(5_000),
          consentAccepted: true,
        })
      ).status,
    ).toBe(413);
  });

  it('rate limits the newsletter scope independently with an HMAC-backed key', async () => {
    const address = '198.51.100.181';
    for (let index = 0; index < 5; index += 1) {
      const response = await request(
        { email: `limited-${index}@example.com`, consentAccepted: true },
        { address },
      );
      expect(response.status).toBe(202);
    }
    const limited = await request(
      { email: 'limited-last@example.com', consentAccepted: true },
      { address },
    );
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
  });
});

describe('newsletter Mailchimp save-first sync', () => {
  it('uses the independent audience configuration and explicitly re-opts an unsubscribed member', async () => {
    const email = `mailchimp-${crypto.randomUUID()}@example.com`;
    const memberHash = mailchimpSubscriberHash(email);
    let providerCall = 0;
    const fetcher = vi.fn(async () => {
      providerCall += 1;
      if (providerCall === 1) {
        return Response.json({ id: memberHash, status: 'unsubscribed' });
      }
      if (providerCall === 2) return Response.json({ id: memberHash, status: 'pending' });
      if (providerCall === 3) return new Response(null, { status: 204 });
      throw new Error('Unexpected Mailchimp request');
    }) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetcher);

    const response = await request(
      { email, firstName: 'ليان', consentAccepted: true },
      { env: newsletterEnv },
    );
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: true });
    expect(await getRepository(localEnv).getNewsletterSubscriptionByEmail(email)).toMatchObject({
      syncStatus: 'synced',
      syncAttemptCount: 1,
    });

    expect(fetcher).toHaveBeenCalledTimes(3);
    const [, memberInit] = (fetcher as ReturnType<typeof vi.fn>).mock.calls[1] as [
      string,
      RequestInit,
    ];
    const memberBody = JSON.parse(String(memberInit.body)) as Record<string, unknown>;
    expect(memberBody).toMatchObject({ status: 'pending', status_if_new: 'pending' });
    expect(memberBody).not.toHaveProperty('tags');
    const [tagUrl, tagInit] = (fetcher as ReturnType<typeof vi.fn>).mock.calls[2] as [
      string,
      RequestInit,
    ];
    expect(tagUrl).toMatch(/\/tags$/);
    expect(JSON.parse(String(tagInit.body))).toEqual({
      tags: [{ name: 'nlpage', status: 'active' }],
    });
  });

  it('keeps consent on tag failure and retries a pending member without another confirmation', async () => {
    const email = `tag-retry-${crypto.randomUUID()}@example.com`;
    const memberHash = mailchimpSubscriberHash(email);
    let providerCall = 0;
    const fetcher = vi.fn(async () => {
      providerCall += 1;
      if (providerCall === 1 || providerCall === 3) {
        return Response.json({ id: memberHash, status: 'pending' });
      }
      if (providerCall === 2) return new Response('{"detail":"tag unavailable"}', { status: 503 });
      if (providerCall === 4) return new Response(null, { status: 204 });
      throw new Error('Unexpected Mailchimp request');
    }) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetcher);

    const first = await request({ email, consentAccepted: true }, { env: newsletterEnv });
    expect(first.status).toBe(202);
    expect(await first.json()).toEqual({ accepted: true });
    expect(await getRepository(localEnv).getNewsletterSubscriptionByEmail(email)).toMatchObject({
      syncStatus: 'failed',
      syncAttemptCount: 1,
      syncError: 'MAILCHIMP_AUDIENCE_TAG_FAILED',
    });

    const retry = await request({ email, consentAccepted: true }, { env: newsletterEnv });
    expect(retry.status).toBe(202);
    expect(await retry.json()).toEqual({ accepted: true });
    expect(await getRepository(localEnv).getNewsletterSubscriptionByEmail(email)).toMatchObject({
      syncStatus: 'synced',
      syncAttemptCount: 2,
    });

    expect(fetcher).toHaveBeenCalledTimes(4);
    const methods = (fetcher as ReturnType<typeof vi.fn>).mock.calls.map(
      ([, init]) => (init as RequestInit).method,
    );
    expect(methods).toEqual([undefined, 'POST', undefined, 'POST']);
  });

  it('never falls back to campaign-publishing credentials', async () => {
    const email = `campaign-only-${crypto.randomUUID()}@example.com`;
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const response = await request(
      { email, consentAccepted: true },
      {
        env: {
          ...localEnv,
          MAILCHIMP_API_KEY: 'campaign-api-key-us1',
          MAILCHIMP_SERVER_PREFIX: 'us1',
          MAILCHIMP_AUDIENCE_ID: 'campaign_audience',
          MAILCHIMP_RECIPIENT_SEGMENT_ID: '31415',
          MAILCHIMP_FROM_NAME: 'مختلف',
          MAILCHIMP_REPLY_TO: 'studio@mukhtalif.net',
          PUBLIC_WEB_URL: 'http://localhost:3000',
        },
      },
    );

    expect(response.status).toBe(202);
    expect(fetcher).not.toHaveBeenCalled();
    expect(await getRepository(localEnv).getNewsletterSubscriptionByEmail(email)).toMatchObject({
      syncStatus: 'unconfigured',
    });
  });

  it('retains consent and an opaque 202 on partial configuration or provider failure', async () => {
    const partialEmail = `partial-${crypto.randomUUID()}@example.com`;
    const partial = await request(
      { email: partialEmail, consentAccepted: true },
      {
        env: {
          ...localEnv,
          NEWSLETTER_MAILCHIMP_SYNC_ENABLED: 'true',
          NEWSLETTER_MAILCHIMP_API_KEY: 'newsletter-api-key-us21',
        },
      },
    );
    expect(partial.status).toBe(202);
    expect(await partial.json()).toEqual({ accepted: true });
    expect(
      await getRepository(localEnv).getNewsletterSubscriptionByEmail(partialEmail),
    ).toMatchObject({
      syncStatus: 'failed',
      syncError: 'NEWSLETTER_PROVIDER_CONFIG_INVALID',
    });

    const failedEmail = `failed-${crypto.randomUUID()}@example.com`;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"detail":"private provider detail"}', { status: 503 })),
    );
    const failed = await request(
      { email: failedEmail, consentAccepted: true },
      { env: newsletterEnv },
    );
    expect(failed.status).toBe(202);
    expect(await failed.json()).toEqual({ accepted: true });
    expect(
      await getRepository(localEnv).getNewsletterSubscriptionByEmail(failedEmail),
    ).toMatchObject({
      syncStatus: 'failed',
      syncError: 'MAILCHIMP_AUDIENCE_UNAVAILABLE',
    });
  });
});

describe('newsletter repository concurrency guards', () => {
  it('treats a repeated server request id as one append-only event', async () => {
    const repo = createMemoryRepository();
    const requestId = crypto.randomUUID();
    const input = {
      email: `rpc-replay-${crypto.randomUUID()}@example.com`,
      firstName: 'أمل',
      consentAcceptedAt: new Date().toISOString(),
      sourceMetadata: { requestId, formVersion: 1 as const },
    };
    const first = await repo.recordNewsletterSubscriptionRequest(input);
    const replay = await repo.recordNewsletterSubscriptionRequest(input);

    expect(replay.subscription.id).toBe(first.subscription.id);
    expect(replay.consentEvent.id).toBe(first.consentEvent.id);
    expect(await repo.listNewsletterConsentEvents(first.subscription.id)).toHaveLength(1);
  });

  it('does not let an older provider result overwrite the latest consent request', async () => {
    const repo = createMemoryRepository();
    const email = `stale-${crypto.randomUUID()}@example.com`;
    const first = await repo.recordNewsletterSubscriptionRequest({
      email,
      consentAcceptedAt: new Date().toISOString(),
      sourceMetadata: { requestId: crypto.randomUUID(), formVersion: 1 },
    });
    const latest = await repo.recordNewsletterSubscriptionRequest({
      email,
      consentAcceptedAt: new Date().toISOString(),
      sourceMetadata: { requestId: crypto.randomUUID(), formVersion: 1 },
    });

    await expect(
      repo.completeNewsletterSubscriptionSync(
        first.subscription.id,
        first.consentEvent.id,
        'failed',
        'STALE_FAILURE',
      ),
    ).resolves.toBeNull();
    await expect(
      repo.completeNewsletterSubscriptionSync(
        latest.subscription.id,
        latest.consentEvent.id,
        'synced',
      ),
    ).resolves.toMatchObject({ syncStatus: 'synced', syncAttemptCount: 1 });
  });
});
