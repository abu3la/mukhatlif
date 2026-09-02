import {
  ApiConfigurationError,
  getAppEnvironment,
  getCorsAllowedOrigins,
  getFormNotificationConfig,
  getFormRateLimitSecret,
  getMailchimpConfig,
  getNewsletterMailchimpConfig,
  getMediaPublicOrigin,
  getStudioInviteRedirectUrl,
  getSupabaseCredentials,
  type Env,
} from '../env';
import { createR2S3Client, R2S3Bucket, type R2S3ClientConfig } from '../storage/r2-s3';

export interface HostingerRuntime {
  bindings: Env;
  port: number;
  trustedProxyHops: number;
}

const ENV_KEYS = [
  'APP_ENV',
  'DEPLOYMENT_PLATFORM',
  'ALLOW_DEV_AUTH',
  'CORS_ALLOWED_ORIGINS',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'STUDIO_INVITE_REDIRECT_URL',
  'MAILCHIMP_CAMPAIGNS_ENABLED',
  'MAILCHIMP_API_KEY',
  'MAILCHIMP_SERVER_PREFIX',
  'MAILCHIMP_AUDIENCE_ID',
  'MAILCHIMP_RECIPIENT_SEGMENT_ID',
  'MAILCHIMP_FROM_NAME',
  'MAILCHIMP_REPLY_TO',
  'NEWSLETTER_MAILCHIMP_API_KEY',
  'NEWSLETTER_MAILCHIMP_SYNC_ENABLED',
  'NEWSLETTER_MAILCHIMP_SERVER_PREFIX',
  'NEWSLETTER_MAILCHIMP_AUDIENCE_ID',
  'PUBLIC_WEB_URL',
  'MEDIA_PUBLIC_ORIGIN',
  'RESEND_ENVIRONMENT',
  'RESEND_API_KEY',
  'FORMS_FROM_EMAIL',
  'FORM_NOTIFICATION_RECIPIENTS_JSON',
  'FORM_RATE_LIMIT_SECRET',
] as const satisfies readonly (keyof Env)[];

type ProcessEnvironment = Record<string, string | undefined>;

function configured(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

function requireValue(source: ProcessEnvironment, name: string): string {
  const value = configured(source[name]);
  if (!value) throw new ApiConfigurationError(`${name} is required on Hostinger.`);
  return value;
}

function parsePositiveInteger(value: string, name: string, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new ApiConfigurationError(`${name} must be an integer from 1 to ${maximum}.`);
  }
  return parsed;
}

function jwtRole(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const payload = JSON.parse(atob(padded)) as { role?: unknown };
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

function isSupabaseSecretKey(value: string): boolean {
  return value.startsWith('sb_secret_') || jwtRole(value) === 'service_role';
}

export function getHostingerR2Config(source: ProcessEnvironment): R2S3ClientConfig & {
  audioBucket: string;
  mediaBucket: string;
} {
  const names = [
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_AUDIO_BUCKET',
    'R2_MEDIA_BUCKET',
  ] as const;
  const present = names.filter((name) => configured(source[name])).length;
  if (present !== names.length) {
    throw new ApiConfigurationError(`${names.join(', ')} must be configured together.`);
  }

  const accountId = requireValue(source, 'R2_ACCOUNT_ID');
  const accessKeyId = requireValue(source, 'R2_ACCESS_KEY_ID');
  const secretAccessKey = requireValue(source, 'R2_SECRET_ACCESS_KEY');
  const audioBucket = requireValue(source, 'R2_AUDIO_BUCKET');
  const mediaBucket = requireValue(source, 'R2_MEDIA_BUCKET');
  if (!/^[a-f0-9]{32}$/i.test(accountId)) {
    throw new ApiConfigurationError('R2_ACCOUNT_ID must be a 32-character hexadecimal account ID.');
  }
  if (accessKeyId.length < 8 || accessKeyId.length > 256 || /\s/.test(accessKeyId)) {
    throw new ApiConfigurationError('R2_ACCESS_KEY_ID is invalid.');
  }
  if (secretAccessKey.length < 16 || secretAccessKey.length > 512 || /\s/.test(secretAccessKey)) {
    throw new ApiConfigurationError('R2_SECRET_ACCESS_KEY is invalid.');
  }
  if (audioBucket !== 'mukhtalif-audio' || mediaBucket !== 'mukhtalif-media') {
    throw new ApiConfigurationError(
      'Hostinger must use the approved mukhtalif-audio and mukhtalif-media buckets.',
    );
  }
  return { accountId, accessKeyId, secretAccessKey, audioBucket, mediaBucket };
}

function applicationBindings(source: ProcessEnvironment): Env {
  return Object.fromEntries(ENV_KEYS.map((key) => [key, configured(source[key])])) as Env;
}

/** Validates the complete production boundary before opening a listening socket. */
export function createHostingerRuntime(source: ProcessEnvironment): HostingerRuntime {
  const bindings = applicationBindings(source);
  if (getAppEnvironment(bindings) !== 'production') {
    throw new ApiConfigurationError('Hostinger requires APP_ENV=production.');
  }
  if (bindings.DEPLOYMENT_PLATFORM !== 'hostinger') {
    throw new ApiConfigurationError('Hostinger requires DEPLOYMENT_PLATFORM=hostinger.');
  }
  if (bindings.ALLOW_DEV_AUTH !== 'false') {
    throw new ApiConfigurationError('Hostinger requires ALLOW_DEV_AUTH=false.');
  }
  const supabase = getSupabaseCredentials(bindings);
  if (!supabase) {
    throw new ApiConfigurationError('Supabase credentials are required on Hostinger.');
  }
  let supabaseUrl: URL;
  try {
    supabaseUrl = new URL(supabase.url);
  } catch {
    throw new ApiConfigurationError('Hostinger SUPABASE_URL must be a valid URL.');
  }
  const expectedSupabaseRef = requireValue(source, 'PRODUCTION_SUPABASE_PROJECT_REF');
  if (!/^[a-z0-9]{20}$/.test(expectedSupabaseRef)) {
    throw new ApiConfigurationError(
      'PRODUCTION_SUPABASE_PROJECT_REF must be the exact 20-character production project ref.',
    );
  }
  if (
    supabaseUrl.protocol !== 'https:' ||
    supabaseUrl.hostname !== `${expectedSupabaseRef}.supabase.co` ||
    supabaseUrl.username ||
    supabaseUrl.password ||
    supabaseUrl.port ||
    (supabaseUrl.pathname !== '' && supabaseUrl.pathname !== '/') ||
    supabaseUrl.search ||
    supabaseUrl.hash
  ) {
    throw new ApiConfigurationError(
      'Hostinger SUPABASE_URL must match the pinned production Supabase project.',
    );
  }
  if (!isSupabaseSecretKey(supabase.serviceRoleKey)) {
    throw new ApiConfigurationError(
      'Hostinger SUPABASE_SERVICE_ROLE_KEY must be a secret/service_role key.',
    );
  }
  if (!getStudioInviteRedirectUrl(bindings)) {
    throw new ApiConfigurationError('STUDIO_INVITE_REDIRECT_URL is required on Hostinger.');
  }
  getFormRateLimitSecret(bindings);
  if (!getFormNotificationConfig(bindings)) {
    throw new ApiConfigurationError(
      'Production form notification delivery is required on Hostinger.',
    );
  }
  getMailchimpConfig(bindings);
  getNewsletterMailchimpConfig(bindings);
  if (getMediaPublicOrigin(bindings) !== 'https://api.mukhtalif.net') {
    throw new ApiConfigurationError(
      'Hostinger MEDIA_PUBLIC_ORIGIN must be https://api.mukhtalif.net.',
    );
  }
  const origins = getCorsAllowedOrigins(bindings);
  for (const required of ['https://studio.mukhtalif.net', 'https://staging.mukhtalif.net']) {
    if (!origins.includes(required)) {
      throw new ApiConfigurationError(`CORS_ALLOWED_ORIGINS must include ${required}.`);
    }
  }

  const r2 = getHostingerR2Config(source);
  const client = createR2S3Client(r2);
  bindings.AUDIO = new R2S3Bucket(client, r2.audioBucket);
  bindings.MEDIA = new R2S3Bucket(client, r2.mediaBucket);

  const portValue = configured(source.PORT) ?? '3000';
  const port = parsePositiveInteger(portValue, 'PORT', 65_535);
  const trustedProxyHops = parsePositiveInteger(
    requireValue(source, 'TRUST_PROXY_HOPS'),
    'TRUST_PROXY_HOPS',
    5,
  );
  return { bindings, port, trustedProxyHops };
}
