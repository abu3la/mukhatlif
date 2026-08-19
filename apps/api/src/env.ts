export const APP_ENVIRONMENTS = ['development', 'test', 'preview', 'production'] as const;
export type AppEnvironment = (typeof APP_ENVIRONMENTS)[number];

export interface Env {
  APP_ENV?: string;
  ALLOW_DEV_AUTH?: string;
  /** Comma-separated browser origins. A wildcard is intentionally forbidden. */
  CORS_ALLOWED_ORIGINS?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  /** Approved admin URL that receives Supabase invitation links. */
  STUDIO_INVITE_REDIRECT_URL?: string;
  /** Mailchimp Marketing API credentials and fixed campaign identity. */
  MAILCHIMP_API_KEY?: string;
  MAILCHIMP_SERVER_PREFIX?: string;
  MAILCHIMP_AUDIENCE_ID?: string;
  MAILCHIMP_FROM_NAME?: string;
  MAILCHIMP_REPLY_TO?: string;
  /** Public site origin used for article links in newsletter HTML. */
  PUBLIC_WEB_URL?: string;
  /** Public HTTPS origin serving immutable article media through this Worker. */
  MEDIA_PUBLIC_ORIGIN?: string;
  /** R2 bucket for episode audio; optional until provisioned. */
  AUDIO?: R2Bucket;
  /** R2 bucket for sanitized article images. */
  MEDIA?: R2Bucket;
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
  fromName: string;
  replyTo: string;
  publicWebUrl: string;
}

function value(input: string | undefined): string | undefined {
  const normalized = input?.trim();
  return normalized || undefined;
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
 * Returns null only when Mailchimp is wholly absent. Partial or unsafe settings
 * fail closed, while the capability route can safely report an unconfigured state.
 */
export function getMailchimpConfig(env: Env): MailchimpConfig | null {
  const inputs = {
    apiKey: value(env.MAILCHIMP_API_KEY),
    serverPrefix: value(env.MAILCHIMP_SERVER_PREFIX),
    audienceId: value(env.MAILCHIMP_AUDIENCE_ID),
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
    publicWebUrl: safePublicOrigin(config.publicWebUrl, getAppEnvironment(env)),
  };
}

export function getMediaPublicOrigin(env: Env, requestOrigin?: string): string | null {
  const configured = value(env.MEDIA_PUBLIC_ORIGIN);
  const environment = getAppEnvironment(env);
  if (configured) return safePublicOrigin(configured, environment);
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
