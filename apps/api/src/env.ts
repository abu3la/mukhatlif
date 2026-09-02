import { FORM_SUBMISSION_TYPES, type FormSubmissionType } from '@mukhtalif/types';
import type { ObjectStorageBucket } from './storage/object-storage';

export const APP_ENVIRONMENTS = ['development', 'test', 'preview', 'production'] as const;
export type AppEnvironment = (typeof APP_ENVIRONMENTS)[number];

export const DEPLOYMENT_PLATFORMS = ['cloudflare-workers', 'hostinger'] as const;
export type DeploymentPlatform = (typeof DEPLOYMENT_PLATFORMS)[number];

export const RESEND_ENVIRONMENTS = ['development', 'production'] as const;
export type ResendEnvironment = (typeof RESEND_ENVIRONMENTS)[number];

/** Public signups receive this Mailchimp tag; campaigns may target only this tag. */
export const MAILCHIMP_NEWSLETTER_RECIPIENT_TAG = 'nlpage';

export interface Env {
  APP_ENV?: string;
  /** Runtime owner. Cloudflare Workers is development-only; Hostinger owns production. */
  DEPLOYMENT_PLATFORM?: string;
  ALLOW_DEV_AUTH?: string;
  /** Comma-separated browser origins. A wildcard is intentionally forbidden. */
  CORS_ALLOWED_ORIGINS?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  /** Approved admin URL that receives Supabase invitation links. */
  STUDIO_INVITE_REDIRECT_URL?: string;
  /** Mailchimp Marketing API credentials and fixed campaign identity. */
  MAILCHIMP_CAMPAIGNS_ENABLED?: string;
  MAILCHIMP_API_KEY?: string;
  MAILCHIMP_SERVER_PREFIX?: string;
  MAILCHIMP_AUDIENCE_ID?: string;
  /** Numeric Mailchimp static-segment/tag id used as the only campaign target. */
  MAILCHIMP_RECIPIENT_SEGMENT_ID?: string;
  MAILCHIMP_FROM_NAME?: string;
  MAILCHIMP_REPLY_TO?: string;
  /** Independent Mailchimp audience credentials for public double opt-in. */
  NEWSLETTER_MAILCHIMP_SYNC_ENABLED?: string;
  NEWSLETTER_MAILCHIMP_API_KEY?: string;
  NEWSLETTER_MAILCHIMP_SERVER_PREFIX?: string;
  NEWSLETTER_MAILCHIMP_AUDIENCE_ID?: string;
  /** Public site origin used for article links in newsletter HTML. */
  PUBLIC_WEB_URL?: string;
  /** Public HTTPS origin serving immutable article media through this Worker. */
  MEDIA_PUBLIC_ORIGIN?: string;
  /** Resend delivery and per-form notification routing. Configure all together. */
  RESEND_ENVIRONMENT?: string;
  RESEND_API_KEY?: string;
  FORMS_FROM_EMAIL?: string;
  FORM_NOTIFICATION_RECIPIENTS_JSON?: string;
  /** HMAC secret that pseudonymizes form rate-limit client addresses. */
  FORM_RATE_LIMIT_SECRET?: string;
  /** Trusted per-request address injected by the Node adapter, never a client header. */
  CLIENT_ADDRESS?: string;
  /** R2 bucket for episode audio; optional until provisioned. */
  AUDIO?: ObjectStorageBucket;
  /** R2 bucket for sanitized article images. */
  MEDIA?: ObjectStorageBucket;
}

export class ApiConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiConfigurationError';
  }
}

export interface MailchimpConfig {
  apiKey: string;
  serverPrefix: string;
  audienceId: string;
  recipientSegmentId: number;
  fromName: string;
  replyTo: string;
  publicWebUrl: string;
}

export interface NewsletterMailchimpConfig {
  apiKey: string;
  serverPrefix: string;
  audienceId: string;
}

export interface FormNotificationConfig {
  apiKey: string;
  fromEmail: string;
  recipients: Record<FormSubmissionType, string[]>;
}

function value(input: string | undefined): string | undefined {
  const normalized = input?.trim();
  return normalized || undefined;
}

const LOCAL_FORM_RATE_LIMIT_SECRET = 'mukhtalif-local-form-rate-limit-v1';

interface FormNotificationPolicy {
  appEnvironments: readonly AppEnvironment[];
  deploymentPlatform: DeploymentPlatform;
  senderDomain: string;
  recipients: Record<FormSubmissionType, readonly string[]>;
}

/**
 * These are deployment boundaries, not defaults that can silently be
 * overridden. Keeping the complete routing policy in code makes an accidental
 * environment-file swap fail before Resend is contacted.
 */
export const FORM_NOTIFICATION_POLICIES: Record<ResendEnvironment, FormNotificationPolicy> = {
  development: {
    // The public development Worker keeps APP_ENV=production so all auth and
    // media safeguards fail closed. Local workerd uses APP_ENV=development.
    appEnvironments: ['development', 'production'],
    deploymentPlatform: 'cloudflare-workers',
    senderDomain: 'devmail.mukhtalif.net',
    recipients: {
      sponsorship: ['aaahashmi95@gmail.com'],
      partnership: ['aaahashmi95@gmail.com'],
      guest_suggestion: ['aaahashmi95@gmail.com'],
      careers: ['aaahashmi95@gmail.com'],
      production_service: ['aaahashmi95@gmail.com'],
      guest_review: ['aaahashmi95@gmail.com'],
    },
  },
  production: {
    appEnvironments: ['production'],
    deploymentPlatform: 'hostinger',
    senderDomain: 'notify.mukhtalif.net',
    recipients: {
      sponsorship: ['bd@mukhtalif.net'],
      partnership: ['bd@mukhtalif.net'],
      guest_suggestion: ['pr@mukhtalif.net'],
      careers: ['hr@mukhtalif.net'],
      production_service: ['bd@mukhtalif.net'],
      guest_review: ['pr@mukhtalif.net'],
    },
  },
};

/**
 * The deployed API must key address fingerprints with an independent secret.
 * A fixed fallback exists only for the explicitly gated in-memory dev server.
 */
export function getFormRateLimitSecret(env: Env): string {
  const secret = value(env.FORM_RATE_LIMIT_SECRET);
  const environment = getAppEnvironment(env);
  const supabase = getSupabaseCredentials(env);
  if (!secret) {
    if (environment === 'development' && !supabase) return LOCAL_FORM_RATE_LIMIT_SECRET;
    throw new ApiConfigurationError(
      'FORM_RATE_LIMIT_SECRET is required when Supabase is configured or outside local development.',
    );
  }

  const byteLength = new TextEncoder().encode(secret).byteLength;
  if (byteLength < 32 || byteLength > 512) {
    throw new ApiConfigurationError('FORM_RATE_LIMIT_SECRET must contain 32 to 512 bytes.');
  }
  return secret;
}

export function getAppEnvironment(env: Env): AppEnvironment {
  const appEnv = value(env.APP_ENV);
  if (!appEnv || !APP_ENVIRONMENTS.includes(appEnv as AppEnvironment)) {
    throw new ApiConfigurationError(`APP_ENV must be one of: ${APP_ENVIRONMENTS.join(', ')}.`);
  }
  return appEnv as AppEnvironment;
}

export function getSupabaseCredentials(env: Env): { url: string; serviceRoleKey: string } | null {
  const url = value(env.SUPABASE_URL);
  const serviceRoleKey = value(env.SUPABASE_SERVICE_ROLE_KEY);

  if (Boolean(url) !== Boolean(serviceRoleKey)) {
    throw new ApiConfigurationError(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured together.',
    );
  }
  return url && serviceRoleKey ? { url, serviceRoleKey } : null;
}

export function getStudioInviteRedirectUrl(env: Env): string | null {
  const input = value(env.STUDIO_INVITE_REDIRECT_URL);
  if (!input) return null;

  let redirect: URL;
  try {
    redirect = new URL(input);
  } catch {
    throw new ApiConfigurationError('STUDIO_INVITE_REDIRECT_URL must be an absolute URL.');
  }

  if (
    (redirect.protocol !== 'https:' && redirect.protocol !== 'http:') ||
    redirect.username ||
    redirect.password ||
    redirect.hash
  ) {
    throw new ApiConfigurationError(
      'STUDIO_INVITE_REDIRECT_URL must be an HTTP(S) URL without credentials or a fragment.',
    );
  }

  const environment = getAppEnvironment(env);
  const isLocalHost =
    redirect.hostname === 'localhost' ||
    redirect.hostname === '127.0.0.1' ||
    redirect.hostname === '[::1]';
  if (redirect.protocol !== 'https:' && !(environment === 'development' && isLocalHost)) {
    throw new ApiConfigurationError(
      'STUDIO_INVITE_REDIRECT_URL must use HTTPS outside local development.',
    );
  }

  return redirect.toString();
}

function safePublicOrigin(input: string, environment: AppEnvironment): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new ApiConfigurationError('PUBLIC_WEB_URL must be an absolute URL.');
  }
  const isLocalHost = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    (url.protocol !== 'https:' && !(environment === 'development' && isLocalHost))
  ) {
    throw new ApiConfigurationError(
      'PUBLIC_WEB_URL must be an HTTPS origin without credentials, query, or fragment.',
    );
  }
  return url.toString().replace(/\/$/, '');
}

/**
 * Campaign publishing is inert unless the operator explicitly enables it.
 * Once enabled, partial or unsafe settings fail closed, while the capability
 * route can safely report an unconfigured state when the complete set is absent.
 */
export function getMailchimpConfig(env: Env): MailchimpConfig | null {
  const enabled = value(env.MAILCHIMP_CAMPAIGNS_ENABLED);
  if (enabled === undefined || enabled === 'false') return null;
  if (enabled !== 'true') {
    throw new ApiConfigurationError('MAILCHIMP_CAMPAIGNS_ENABLED must be true or false.');
  }

  const inputs = {
    apiKey: value(env.MAILCHIMP_API_KEY),
    serverPrefix: value(env.MAILCHIMP_SERVER_PREFIX),
    audienceId: value(env.MAILCHIMP_AUDIENCE_ID),
    recipientSegmentId: value(env.MAILCHIMP_RECIPIENT_SEGMENT_ID),
    fromName: value(env.MAILCHIMP_FROM_NAME),
    replyTo: value(env.MAILCHIMP_REPLY_TO),
    publicWebUrl: value(env.PUBLIC_WEB_URL),
  };
  const configuredCount = Object.values(inputs).filter(Boolean).length;
  if (configuredCount === 0) return null;
  if (configuredCount !== Object.keys(inputs).length) {
    throw new ApiConfigurationError(
      'All Mailchimp publishing settings must be configured together.',
    );
  }

  const config = inputs as Record<keyof typeof inputs, string>;
  if (!/^[a-z0-9-]{2,24}$/i.test(config.serverPrefix)) {
    throw new ApiConfigurationError('MAILCHIMP_SERVER_PREFIX is invalid.');
  }
  if (!/^[a-z0-9_-]{2,100}$/i.test(config.audienceId)) {
    throw new ApiConfigurationError('MAILCHIMP_AUDIENCE_ID is invalid.');
  }
  const recipientSegmentId = Number(config.recipientSegmentId);
  if (!Number.isSafeInteger(recipientSegmentId) || recipientSegmentId < 1) {
    throw new ApiConfigurationError('MAILCHIMP_RECIPIENT_SEGMENT_ID must be a positive integer.');
  }
  if (config.fromName.length > 100) {
    throw new ApiConfigurationError('MAILCHIMP_FROM_NAME is too long.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.replyTo)) {
    throw new ApiConfigurationError('MAILCHIMP_REPLY_TO must be an email address.');
  }
  if (
    config.apiKey.length < 12 ||
    config.apiKey.length > 256 ||
    !/^[\x21-\x7E]+$/.test(config.apiKey)
  ) {
    throw new ApiConfigurationError('MAILCHIMP_API_KEY is invalid.');
  }

  return {
    ...config,
    recipientSegmentId,
    publicWebUrl: safePublicOrigin(config.publicWebUrl, getAppEnvironment(env)),
  };
}

/**
 * Audience subscription credentials are intentionally independent from the
 * campaign publishing credentials above. Supplying only part of this set fails
 * closed; leaving all three absent keeps consent stored locally as unconfigured.
 */
export function getNewsletterMailchimpConfig(env: Env): NewsletterMailchimpConfig | null {
  const enabled = value(env.NEWSLETTER_MAILCHIMP_SYNC_ENABLED);
  if (enabled === undefined || enabled === 'false') return null;
  if (enabled !== 'true') {
    throw new ApiConfigurationError('NEWSLETTER_MAILCHIMP_SYNC_ENABLED must be true or false.');
  }

  const inputs = {
    apiKey: value(env.NEWSLETTER_MAILCHIMP_API_KEY),
    serverPrefix: value(env.NEWSLETTER_MAILCHIMP_SERVER_PREFIX),
    audienceId: value(env.NEWSLETTER_MAILCHIMP_AUDIENCE_ID),
  };
  const configuredCount = Object.values(inputs).filter(Boolean).length;
  if (configuredCount === 0) return null;
  if (configuredCount !== Object.keys(inputs).length) {
    throw new ApiConfigurationError(
      'All Mailchimp newsletter audience settings must be configured together.',
    );
  }

  const config = inputs as Record<keyof typeof inputs, string>;
  if (!/^[a-z0-9-]{2,24}$/i.test(config.serverPrefix)) {
    throw new ApiConfigurationError('NEWSLETTER_MAILCHIMP_SERVER_PREFIX is invalid.');
  }
  if (!/^[a-z0-9_-]{2,100}$/i.test(config.audienceId)) {
    throw new ApiConfigurationError('NEWSLETTER_MAILCHIMP_AUDIENCE_ID is invalid.');
  }
  if (
    config.apiKey.length < 12 ||
    config.apiKey.length > 256 ||
    !/^[\x21-\x7E]+$/.test(config.apiKey)
  ) {
    throw new ApiConfigurationError('NEWSLETTER_MAILCHIMP_API_KEY is invalid.');
  }
  return config;
}

/**
 * Loads the complete, environment-locked form routing table. The sender domain,
 * recipients, application environment, and deployment platform must all match
 * one policy. This prevents either Resend project's configuration from being
 * accepted by the other runtime.
 *
 * The non-secret policy values may be deployed before the API key. In that
 * state the notifier remains intentionally unconfigured and requests continue
 * to be saved in Studio. Supplying only the key is always rejected.
 */
export function getFormNotificationConfig(env: Env): FormNotificationConfig | null {
  const resendEnvironment = value(env.RESEND_ENVIRONMENT);
  const apiKey = value(env.RESEND_API_KEY);
  const fromEmail = value(env.FORMS_FROM_EMAIL);
  const recipientsJson = value(env.FORM_NOTIFICATION_RECIPIENTS_JSON);
  const policyConfiguredCount = [resendEnvironment, fromEmail, recipientsJson].filter(
    Boolean,
  ).length;
  if (!apiKey && policyConfiguredCount === 0) return null;
  if (policyConfiguredCount !== 3) {
    throw new ApiConfigurationError(
      'RESEND_ENVIRONMENT, FORMS_FROM_EMAIL, and FORM_NOTIFICATION_RECIPIENTS_JSON must be configured together before RESEND_API_KEY is enabled.',
    );
  }

  if (!resendEnvironment || !RESEND_ENVIRONMENTS.includes(resendEnvironment as ResendEnvironment)) {
    throw new ApiConfigurationError(
      `RESEND_ENVIRONMENT must be one of: ${RESEND_ENVIRONMENTS.join(', ')}.`,
    );
  }
  const policy = FORM_NOTIFICATION_POLICIES[resendEnvironment as ResendEnvironment];
  if (!policy.appEnvironments.includes(getAppEnvironment(env))) {
    throw new ApiConfigurationError('RESEND_ENVIRONMENT does not match APP_ENV.');
  }

  const deploymentPlatform = value(env.DEPLOYMENT_PLATFORM);
  if (
    !deploymentPlatform ||
    !DEPLOYMENT_PLATFORMS.includes(deploymentPlatform as DeploymentPlatform)
  ) {
    throw new ApiConfigurationError(
      `DEPLOYMENT_PLATFORM must be one of: ${DEPLOYMENT_PLATFORMS.join(', ')}.`,
    );
  }
  if (deploymentPlatform !== policy.deploymentPlatform) {
    throw new ApiConfigurationError(
      'RESEND_ENVIRONMENT is not allowed on this DEPLOYMENT_PLATFORM.',
    );
  }

  if (!fromEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail) || fromEmail.length > 254) {
    throw new ApiConfigurationError('FORMS_FROM_EMAIL must be an email address.');
  }
  const normalizedFromEmail = fromEmail.toLowerCase();
  if (normalizedFromEmail.slice(normalizedFromEmail.lastIndexOf('@') + 1) !== policy.senderDomain) {
    throw new ApiConfigurationError(
      'FORMS_FROM_EMAIL does not use the sender domain assigned to RESEND_ENVIRONMENT.',
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(recipientsJson!);
  } catch {
    throw new ApiConfigurationError('FORM_NOTIFICATION_RECIPIENTS_JSON must be valid JSON.');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ApiConfigurationError('FORM_NOTIFICATION_RECIPIENTS_JSON must be an object.');
  }

  const allowed = new Set<string>(FORM_SUBMISSION_TYPES);
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.some(([type]) => !allowed.has(type))) {
    throw new ApiConfigurationError('FORM_NOTIFICATION_RECIPIENTS_JSON has an unknown form type.');
  }
  if (entries.length !== FORM_SUBMISSION_TYPES.length) {
    throw new ApiConfigurationError(
      'FORM_NOTIFICATION_RECIPIENTS_JSON must configure every form type.',
    );
  }

  const recipients = {} as Record<FormSubmissionType, string[]>;
  for (const type of FORM_SUBMISSION_TYPES) {
    const addresses = (raw as Record<string, unknown>)[type];
    if (
      !Array.isArray(addresses) ||
      addresses.length < 1 ||
      addresses.length > 10 ||
      !addresses.every(
        (address) =>
          typeof address === 'string' &&
          address.length <= 254 &&
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address),
      )
    ) {
      throw new ApiConfigurationError(
        'Every form notification recipient list must contain 1 to 10 email addresses.',
      );
    }
    const normalized = [...new Set(addresses.map((address) => address.trim().toLowerCase()))];
    const expected = policy.recipients[type];
    if (
      normalized.length !== expected.length ||
      normalized.some((address, index) => address !== expected[index])
    ) {
      throw new ApiConfigurationError(
        'FORM_NOTIFICATION_RECIPIENTS_JSON does not match the locked routing policy.',
      );
    }
    recipients[type] = normalized;
  }

  if (!apiKey) return null;
  if (apiKey.length < 12 || apiKey.length > 512 || !/^[\x21-\x7E]+$/.test(apiKey)) {
    throw new ApiConfigurationError('RESEND_API_KEY is invalid.');
  }

  return { apiKey, fromEmail: normalizedFromEmail, recipients };
}

export function getMediaPublicOrigin(env: Env, requestOrigin?: string): string | null {
  const configured = value(env.MEDIA_PUBLIC_ORIGIN);
  const environment = getAppEnvironment(env);
  if (configured) {
    const origin = safePublicOrigin(configured, environment);
    if (
      value(env.DEPLOYMENT_PLATFORM) === 'hostinger' &&
      new URL(origin).hostname.endsWith('.workers.dev')
    ) {
      throw new ApiConfigurationError(
        'Hostinger production must not use a workers.dev MEDIA_PUBLIC_ORIGIN.',
      );
    }
    return origin;
  }
  if (env.MEDIA && environment !== 'development') {
    throw new ApiConfigurationError(
      'MEDIA_PUBLIC_ORIGIN is required when MEDIA is configured outside development.',
    );
  }
  if (env.MEDIA && requestOrigin) return safePublicOrigin(requestOrigin, environment);
  return null;
}

export function isDevAuthEnabled(env: Env): boolean {
  return getAppEnvironment(env) === 'development' && value(env.ALLOW_DEV_AUTH) === 'true';
}

export function getCorsAllowedOrigins(env: Env): string[] {
  getAppEnvironment(env);
  const origins = (value(env.CORS_ALLOWED_ORIGINS) ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);

  if (origins.includes('*')) {
    throw new ApiConfigurationError('CORS_ALLOWED_ORIGINS must not contain a wildcard.');
  }

  return [...new Set(origins)];
}
