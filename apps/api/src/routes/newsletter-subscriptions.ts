import { Hono, type Context } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type {
  NewsletterSubscriptionReceipt,
  NewsletterSubscriptionSourceMetadata,
} from '@mukhtalif/types';
import { toPaginatedList } from '@mukhtalif/types';
import {
  newsletterSubscriberListQuerySchema,
  newsletterSubscriptionRequestSchema,
} from '@mukhtalif/validation';
import { requirePermission, type AppEnv } from '../auth';
import {
  ApiConfigurationError,
  getFormRateLimitSecret,
  getNewsletterMailchimpConfig,
} from '../env';
import { MailchimpAudienceApiError, MailchimpAudienceClient } from '../mailchimp/audience-client';
import { getRepository, type Repository } from '../repo';
import { formRateLimitKey } from '../security/form-rate-limit';

const MAX_NEWSLETTER_BODY_BYTES = 4_096;
const RATE_LIMIT = 5;
const RATE_WINDOW_SECONDS = 15 * 60;
const receipt: NewsletterSubscriptionReceipt = { accepted: true };

function safeOrigin(input: string | undefined): string | undefined {
  if (!input) return undefined;
  try {
    const url = new URL(input);
    return ['http:', 'https:'].includes(url.protocol) ? url.origin.slice(0, 2048) : undefined;
  } catch {
    return undefined;
  }
}

function safeReferrer(input: string | undefined): { origin?: string; path?: string } {
  if (!input) return {};
  try {
    const url = new URL(input);
    if (!['http:', 'https:'].includes(url.protocol)) return {};
    const path = url.pathname.slice(0, 2048);
    return { origin: url.origin.slice(0, 2048), ...(path ? { path } : {}) };
  } catch {
    return {};
  }
}

function sourceMetadata(
  c: Context<AppEnv>,
  requestId: string,
): NewsletterSubscriptionSourceMetadata {
  const referrer = safeReferrer(c.req.header('referer'));
  const requestOrigin = safeOrigin(c.req.header('origin'));
  const userAgent = c.req.header('user-agent')?.slice(0, 500);
  const country = c.req.header('cf-ipcountry')?.trim().toUpperCase();
  const clientSurface = c.get('clientSurface');
  return {
    requestId,
    formVersion: 1,
    ...(clientSurface ? { clientSurface } : {}),
    ...(requestOrigin ? { requestOrigin } : {}),
    ...(referrer.origin ? { referrerOrigin: referrer.origin } : {}),
    ...(referrer.path ? { referrerPath: referrer.path } : {}),
    ...(userAgent ? { userAgent } : {}),
    ...(country && /^[A-Z]{2}$/.test(country) ? { countryCode: country } : {}),
  };
}

async function readPublicJson(c: Context<AppEnv>): Promise<unknown> {
  const declaredLength = Number(c.req.header('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_NEWSLETTER_BODY_BYTES) {
    throw new RangeError('NEWSLETTER_BODY_TOO_LARGE');
  }

  const stream = c.req.raw.body;
  if (!stream) return JSON.parse('') as unknown;
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_NEWSLETTER_BODY_BYTES) {
        await reader.cancel('NEWSLETTER_BODY_TOO_LARGE');
        throw new RangeError('NEWSLETTER_BODY_TOO_LARGE');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(
    new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(body),
  ) as unknown;
}

function hasHoneypotValue(body: unknown): boolean {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const value = (body as Record<string, unknown>).companyWebsite;
  return typeof value === 'string' && Boolean(value.trim());
}

async function safelyCompleteSync(
  repo: Repository,
  subscriptionId: string,
  consentEventId: string,
  status: 'synced' | 'failed' | 'unconfigured',
  errorCode?: string,
): Promise<void> {
  try {
    await repo.completeNewsletterSubscriptionSync(
      subscriptionId,
      consentEventId,
      status,
      errorCode,
    );
  } catch {
    // Consent is already durable. A later explicit request can safely retry the
    // idempotent Mailchimp PUT; never turn provider bookkeeping into data loss.
  }
}

async function attemptMailchimpSync(
  env: AppEnv['Bindings'],
  repo: Repository,
  subscriptionId: string,
  consentEventId: string,
  email: string,
  firstName?: string,
): Promise<void> {
  let config;
  try {
    config = getNewsletterMailchimpConfig(env);
  } catch (error) {
    await safelyCompleteSync(
      repo,
      subscriptionId,
      consentEventId,
      'failed',
      error instanceof ApiConfigurationError
        ? 'NEWSLETTER_PROVIDER_CONFIG_INVALID'
        : 'NEWSLETTER_PROVIDER_UNAVAILABLE',
    );
    return;
  }
  if (!config) {
    await safelyCompleteSync(
      repo,
      subscriptionId,
      consentEventId,
      'unconfigured',
      'NEWSLETTER_PROVIDER_NOT_CONFIGURED',
    );
    return;
  }

  try {
    await new MailchimpAudienceClient(config).requestDoubleOptIn(email, firstName);
    await safelyCompleteSync(repo, subscriptionId, consentEventId, 'synced');
  } catch (error) {
    await safelyCompleteSync(
      repo,
      subscriptionId,
      consentEventId,
      'failed',
      error instanceof MailchimpAudienceApiError ? error.code : 'NEWSLETTER_PROVIDER_UNAVAILABLE',
    );
  }
}

export const publicNewsletterSubscriptionsRoute = new Hono<AppEnv>()
  .use('*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
  })
  .post('/subscriptions', async (c) => {
    const clientAddress =
      c.env.CLIENT_ADDRESS ?? c.req.header('cf-connecting-ip')?.trim() ?? 'unknown';
    const rateKey = await formRateLimitKey(
      getFormRateLimitSecret(c.env),
      'newsletter_subscription',
      clientAddress,
    );
    const repo = getRepository(c.env);
    const rate = await repo.claimFormSubmissionRateLimit(rateKey, RATE_LIMIT, RATE_WINDOW_SECONDS);
    if (!rate.allowed) {
      c.header('Retry-After', String(rate.retryAfterSeconds));
      return c.json({ error: 'Too many submissions', code: 'RATE_LIMITED' }, 429);
    }

    let body: unknown;
    try {
      body = await readPublicJson(c);
    } catch (error) {
      if (error instanceof RangeError) {
        return c.json({ error: 'Newsletter subscription body is too large' }, 413);
      }
      return c.json({ error: 'Invalid JSON body' }, 400);
    }
    if (hasHoneypotValue(body)) return c.json(receipt, 202);

    const parsed = newsletterSubscriptionRequestSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: 'Invalid newsletter subscription' }, 400);

    const now = new Date().toISOString();
    const recorded = await repo.recordNewsletterSubscriptionRequest({
      email: parsed.data.email,
      ...(parsed.data.firstName ? { firstName: parsed.data.firstName } : {}),
      consentAcceptedAt: now,
      sourceMetadata: sourceMetadata(c, crypto.randomUUID()),
    });
    await attemptMailchimpSync(
      c.env,
      repo,
      recorded.subscription.id,
      recorded.consentEvent.id,
      recorded.subscription.email,
      parsed.data.firstName,
    );
    return c.json(receipt, 202);
  });

/** Read-only local directory. It never contacts Mailchimp. */
export const studioNewsletterSubscribersRoute = new Hono<AppEnv>()
  .use('*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'private, no-store');
  })
  .use('*', requirePermission('subscribers.view'))
  .post('/query', zValidator('json', newsletterSubscriberListQuerySchema), async (c) => {
    const input = c.req.valid('json');
    const query = {
      page: input.page,
      perPage: input.perPage,
      ...(input.search ? { search: input.search } : {}),
    };
    const filter = {
      ...(input.localStatus ? { localStatus: input.localStatus } : {}),
      ...(input.mailchimpStatus ? { mailchimpStatus: input.mailchimpStatus } : {}),
    };
    const page = await getRepository(c.env).listNewsletterSubscribersPage(filter, query);
    return c.json(toPaginatedList(page, query));
  });
