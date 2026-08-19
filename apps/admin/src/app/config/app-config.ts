export type AdminDataSource = 'fixture' | 'hono';
export type AdminAuthMode = 'fixture' | 'dev-header' | 'supabase';

export interface ViteAdminEnvironment {
  readonly MODE?: string;
  readonly DEV?: boolean;
  readonly PROD?: boolean;
  readonly VITE_ADMIN_DATA_SOURCE?: string;
  readonly VITE_API_URL?: string;
  readonly VITE_DEV_USER_ID?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

export interface SupabaseBrowserConfig {
  readonly url: string;
  readonly anonKey: string;
}

export interface AdminAppConfig {
  readonly mode: string;
  readonly isDevelopment: boolean;
  readonly isProduction: boolean;
  readonly dataSource: AdminDataSource;
  readonly authMode: AdminAuthMode;
  readonly api: {
    readonly baseUrl: string;
    readonly devUserId: string | null;
  };
  readonly supabase: SupabaseBrowserConfig | null;
}

export class AppConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppConfigurationError';
  }
}

const DEVELOPMENT_API_URL = 'http://localhost:8787';

function optionalValue(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function parseHttpUrl(name: string, value: string): string {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new AppConfigurationError(`${name} must be a valid absolute URL.`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new AppConfigurationError(`${name} must use http or https.`);
  }

  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new AppConfigurationError(
      `${name} must not contain credentials, a query string, or a fragment.`,
    );
  }

  return parsed.toString().replace(/\/+$/, '');
}

function parseDataSource(
  value: string | undefined,
  isProduction: boolean,
): AdminDataSource {
  const normalized = optionalValue(value)?.toLowerCase();

  if (normalized !== undefined && normalized !== 'fixture' && normalized !== 'hono') {
    throw new AppConfigurationError(
      'VITE_ADMIN_DATA_SOURCE must be either "fixture" or "hono".',
    );
  }

  const dataSource = normalized ?? (isProduction ? 'hono' : 'fixture');
  if (isProduction && dataSource === 'fixture') {
    throw new AppConfigurationError(
      'VITE_ADMIN_DATA_SOURCE cannot be "fixture" in a production build.',
    );
  }

  return dataSource;
}

function parseSupabaseConfig(env: ViteAdminEnvironment): SupabaseBrowserConfig | null {
  const url = optionalValue(env.VITE_SUPABASE_URL);
  const anonKey = optionalValue(env.VITE_SUPABASE_ANON_KEY);

  if (!url && !anonKey) return null;
  if (!url || !anonKey) {
    throw new AppConfigurationError(
      'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be provided together.',
    );
  }

  return {
    url: parseHttpUrl('VITE_SUPABASE_URL', url),
    anonKey,
  };
}

/**
 * Converts Vite's string-based environment into the immutable runtime
 * contract consumed by application startup.
 */
export function parseAppConfig(env: ViteAdminEnvironment): AdminAppConfig {
  const mode = optionalValue(env.MODE) ?? 'development';
  const isProduction = env.PROD === true || mode === 'production';
  const isDevelopment =
    !isProduction && (env.DEV === true || mode === 'development');
  const dataSource = parseDataSource(env.VITE_ADMIN_DATA_SOURCE, isProduction);
  const configuredApiUrl = optionalValue(env.VITE_API_URL);

  if (dataSource === 'hono' && !configuredApiUrl) {
    throw new AppConfigurationError(
      'VITE_API_URL is required when VITE_ADMIN_DATA_SOURCE is "hono".',
    );
  }

  const devUserId = optionalValue(env.VITE_DEV_USER_ID);
  if (isProduction && devUserId) {
    throw new AppConfigurationError(
      'VITE_DEV_USER_ID must not be configured in a production build.',
    );
  }

  const baseUrl = parseHttpUrl(
    'VITE_API_URL',
    configuredApiUrl ?? DEVELOPMENT_API_URL,
  );

  const supabase = parseSupabaseConfig(env);
  if (isProduction && !supabase) {
    throw new AppConfigurationError(
      'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required in production.',
    );
  }
  if (dataSource === 'hono' && !supabase && !devUserId) {
    throw new AppConfigurationError(
      'Hono development requires Supabase Auth or VITE_DEV_USER_ID.',
    );
  }

  return Object.freeze({
    mode,
    isDevelopment,
    isProduction,
    dataSource,
    authMode:
      dataSource === 'fixture' ? 'fixture' : supabase ? 'supabase' : 'dev-header',
    api: Object.freeze({
      baseUrl,
      devUserId: isProduction ? null : (devUserId ?? null),
    }),
    supabase,
  });
}

let cachedConfig: AdminAppConfig | undefined;

export function getAppConfig(): AdminAppConfig {
  cachedConfig ??= parseAppConfig(import.meta.env);
  return cachedConfig;
}
