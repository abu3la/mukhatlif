import { Hono, type Context } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  FORM_SUBMISSION_TYPES,
  toPaginatedList,
  type FormSubmission,
  type FormSubmissionPayload,
  type FormSubmissionReceipt,
  type FormSubmissionSourceMetadata,
  type FormSubmissionType,
} from '@mukhtalif/types';
import {
  formSubmissionListQuerySchema,
  isPaginatedRequest,
  publicFormSubmissionSchemas,
  resolveListQuery,
  updateFormSubmissionSchema,
} from '@mukhtalif/validation';
import { requirePermission, type AppEnv } from '../auth';
import { ApiConfigurationError, getFormNotificationConfig, getFormRateLimitSecret } from '../env';
import { FormEmailNotificationError, ResendEmailNotifier } from '../notifications/form-email';
import { getRepository, type CreateFormSubmissionRecordInput, type Repository } from '../repo';
import { formRateLimitKey } from '../security/form-rate-limit';

const MAX_PUBLIC_FORM_BODY_BYTES = 48_000;
const RATE_LIMIT = 6;
const RATE_WINDOW_SECONDS = 15 * 60;
const NOTIFICATION_STALE_MS = 5 * 60_000;
const receipt: FormSubmissionReceipt = { accepted: true };

type NotificationAttempt =
  | { status: 'sent' | 'failed' | 'unconfigured'; submission: FormSubmission }
  | { status: 'busy' }
  | { status: 'storage_error' };

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
    // Query strings routinely carry campaign identifiers and occasionally
    // one-time tokens. The pathname is enough attribution for this inbox.
    const path = url.pathname.slice(0, 2048);
    return { origin: url.origin.slice(0, 2048), ...(path ? { path } : {}) };
  } catch {
    return {};
  }
}

function sourceMetadata(
  c: Context<AppEnv>,
  requestId: string,
  privacyAcceptedAt: string,
): FormSubmissionSourceMetadata {
  const referrer = safeReferrer(c.req.header('referer'));
  const requestOrigin = safeOrigin(c.req.header('origin'));
  const userAgent = c.req.header('user-agent')?.slice(0, 500);
  const country = c.req.header('cf-ipcountry')?.trim().toUpperCase();
  const clientSurface = c.get('clientSurface');
  return {
    requestId,
    formVersion: 1,
    privacyAcceptedAt,
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
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PUBLIC_FORM_BODY_BYTES) {
    throw new RangeError('FORM_BODY_TOO_LARGE');
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
      if (byteLength > MAX_PUBLIC_FORM_BODY_BYTES) {
        await reader.cancel('FORM_BODY_TOO_LARGE');
        throw new RangeError('FORM_BODY_TOO_LARGE');
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

function notificationFailureCode(error: unknown): string {
  if (error instanceof ApiConfigurationError) return 'NOTIFICATION_CONFIG_INVALID';
  if (error instanceof FormEmailNotificationError) return error.code;
  return 'NOTIFICATION_DELIVERY_FAILED';
}

function hasHoneypotValue(body: unknown): boolean {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const value = (body as Record<string, unknown>).companyWebsite;
  return typeof value === 'string' && Boolean(value.trim());
}

/**
 * Claims one delivery lease before contacting Resend. Saving always happens
 * first, and every provider/configuration failure is recorded without turning
 * the public submission into a failed request.
 */
async function attemptNotification(
  env: AppEnv['Bindings'],
  repo: Repository,
  submissionId: string,
): Promise<NotificationAttempt> {
  let claim;
  try {
    claim = await repo.claimFormSubmissionNotification(
      submissionId,
      new Date(Date.now() - NOTIFICATION_STALE_MS).toISOString(),
    );
  } catch {
    return { status: 'storage_error' };
  }
  if (!claim) return { status: 'busy' };

  try {
    const config = getFormNotificationConfig(env);
    if (!config) {
      const submission = await repo.completeFormSubmissionNotification(
        submissionId,
        claim.claimToken,
        'unconfigured',
        'NOTIFICATION_NOT_CONFIGURED',
      );
      return submission ? { status: 'unconfigured', submission } : { status: 'storage_error' };
    }
    const recipients = config.recipients[claim.submission.type];
    if (!recipients?.length) {
      const submission = await repo.completeFormSubmissionNotification(
        submissionId,
        claim.claimToken,
        'unconfigured',
        'RECIPIENT_NOT_CONFIGURED',
      );
      return submission ? { status: 'unconfigured', submission } : { status: 'storage_error' };
    }
    const delivered = await new ResendEmailNotifier(config.apiKey).send({
      submission: claim.submission,
      fromEmail: config.fromEmail,
      recipients,
    });
    const submission = await repo.completeFormSubmissionNotification(
      submissionId,
      claim.claimToken,
      'sent',
      undefined,
      delivered.providerMessageId,
    );
    return submission ? { status: 'sent', submission } : { status: 'storage_error' };
  } catch (error) {
    try {
      const submission = await repo.completeFormSubmissionNotification(
        submissionId,
        claim.claimToken,
        'failed',
        notificationFailureCode(error),
      );
      return submission ? { status: 'failed', submission } : { status: 'storage_error' };
    } catch {
      return { status: 'storage_error' };
    }
  }
}

export const publicFormSubmissionsRoute = new Hono<AppEnv>()
  .use('*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
  })
  .post('/:type', async (c) => {
    const type = c.req.param('type');
    if (!(FORM_SUBMISSION_TYPES as readonly string[]).includes(type)) {
      return c.json({ error: 'Form not found' }, 404);
    }
    const formType = type as FormSubmissionType;
    // Hostinger's Node entry injects CLIENT_ADDRESS from the trusted proxy chain.
    // Cloudflare sets cf-connecting-ip itself for the Worker runtime. A browser
    // header can never override the Node value.
    const clientAddress =
      c.env.CLIENT_ADDRESS ?? c.req.header('cf-connecting-ip')?.trim() ?? 'unknown';
    const rateKey = await formRateLimitKey(getFormRateLimitSecret(c.env), formType, clientAddress);
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
      if (error instanceof RangeError) return c.json({ error: 'Form body is too large' }, 413);
      return c.json({ error: 'Invalid JSON body' }, 400);
    }
    // Do this before payload validation so a bot cannot use validation details
    // to discover that the hidden field changed the handling path.
    if (hasHoneypotValue(body)) return c.json(receipt, 202);

    const parsed = publicFormSubmissionSchemas[formType].safeParse(body);
    if (!parsed.success) return c.json({ error: 'Invalid form submission' }, 400);

    const now = new Date().toISOString();
    // `publicFormSubmissionSchemas` is keyed by the same discriminant. The
    // indexed lookup loses that correlation in TypeScript, so restore it only at
    // this validated boundary before handing the discriminated record to storage.
    const input = {
      type: formType,
      payload: parsed.data.payload as FormSubmissionPayload,
      sourceMetadata: sourceMetadata(c, crypto.randomUUID(), now),
    } as CreateFormSubmissionRecordInput;
    const submission = await repo.createFormSubmission(input);
    await attemptNotification(c.env, repo, submission.id);
    return c.json(receipt, 202);
  });

export const studioFormSubmissionsRoute = new Hono<AppEnv>()
  .use('*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'private, no-store');
  })
  .use('*', requirePermission('forms.view'))
  .get('/', zValidator('query', formSubmissionListQuerySchema), async (c) => {
    const input = c.req.valid('query');
    const filter = {
      type: input.type,
      status: input.status,
      assigneeId: input.assigneeId,
    };
    const repo = getRepository(c.env);
    if (!isPaginatedRequest(input)) return c.json(await repo.listFormSubmissions(filter));
    const query = resolveListQuery(input);
    return c.json(toPaginatedList(await repo.listFormSubmissionsPage(filter, query), query));
  })
  .get('/:id', async (c) => {
    const submission = await getRepository(c.env).getFormSubmission(c.req.param('id'));
    return submission ? c.json(submission) : c.json({ error: 'Form submission not found' }, 404);
  })
  .patch(
    '/:id',
    requirePermission('forms.manage'),
    zValidator('json', updateFormSubmissionSchema),
    async (c) => {
      const input = c.req.valid('json');
      const repo = getRepository(c.env);
      if (input.assigneeId) {
        const assignee = await repo.getStudioMember(input.assigneeId);
        if (!assignee || assignee.status !== 'active') {
          return c.json({ error: 'Active Studio assignee not found' }, 422);
        }
      }
      const submission = await repo.updateFormSubmission(c.req.param('id'), input);
      return submission ? c.json(submission) : c.json({ error: 'Form submission not found' }, 404);
    },
  )
  .post('/:id/notification/retry', requirePermission('forms.manage'), async (c) => {
    const repo = getRepository(c.env);
    const current = await repo.getFormSubmission(c.req.param('id'));
    if (!current) return c.json({ error: 'Form submission not found' }, 404);
    if (current.notificationStatus === 'sent') {
      return c.json({ error: 'Notification has already been sent' }, 409);
    }
    const attempt = await attemptNotification(c.env, repo, current.id);
    if (attempt.status === 'busy') {
      return c.json({ error: 'Notification delivery is already in progress' }, 409);
    }
    if (attempt.status === 'storage_error') {
      return c.json({ error: 'Notification retry could not be recorded' }, 503);
    }
    return c.json(attempt.submission);
  });
