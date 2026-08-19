import type { AdminRepository } from './admin-repository';
import {
  createFixtureAdminRepository,
  type FixtureAdminRepositoryOptions,
} from './fixture-admin-repository';
import {
  createHonoAdminRepository,
  type HonoAdminRepositoryOptions,
} from './hono-admin-repository';
import { AdminRepositoryError } from './repository-error';

export type AdminDataSource = 'fixture' | 'hono';

export interface AdminRepositoryEnvironment {
  readonly MODE?: string;
  readonly DEV?: boolean;
  readonly PROD?: boolean;
  readonly VITE_ADMIN_DATA_SOURCE?: string;
  readonly VITE_API_URL?: string;
  readonly VITE_DEV_USER_ID?: string;
}

export interface CreateAdminRepositoryOptions {
  readonly env?: AdminRepositoryEnvironment;
  readonly getAccessToken?: HonoAdminRepositoryOptions['getAccessToken'];
  readonly fetch?: typeof fetch;
  readonly now?: () => Date;
  readonly fixture?: Omit<FixtureAdminRepositoryOptions, 'now'>;
}

function configurationError(message: string, context?: Readonly<Record<string, unknown>>) {
  return new AdminRepositoryError({
    code: 'CONFIGURATION',
    operation: 'createAdminRepository',
    message,
    retryable: false,
    context,
  });
}

function selectDataSource(
  env: AdminRepositoryEnvironment,
  production: boolean,
): AdminDataSource {
  const configured = env.VITE_ADMIN_DATA_SOURCE?.trim().toLowerCase();
  if (configured && configured !== 'fixture' && configured !== 'hono') {
    throw configurationError(
      'VITE_ADMIN_DATA_SOURCE must be either "fixture" or "hono".',
      { configured },
    );
  }
  if (configured === 'fixture' || configured === 'hono') return configured;

  // Fixtures are an opt-out-free production boundary: non-development builds
  // use the Hono adapter and require an explicit API URL.
  return production ? 'hono' : 'fixture';
}

/**
 * Selects exactly one repository from Vite environment configuration.
 * There is intentionally no catch-and-fallback path from Hono to fixtures.
 */
export function createAdminRepository(
  options: CreateAdminRepositoryOptions = {},
): AdminRepository {
  const env = options.env ?? import.meta.env;
  const production = env.PROD === true || env.MODE === 'production';
  const source = selectDataSource(env, production);

  if (production && source === 'fixture') {
    throw configurationError('Fixture admin data is forbidden in production builds.');
  }

  if (source === 'fixture') {
    return createFixtureAdminRepository({ ...options.fixture, now: options.now });
  }

  const baseUrl = env.VITE_API_URL?.trim();
  if (!baseUrl) {
    throw configurationError('VITE_API_URL is required when the Hono data source is selected.');
  }

  return createHonoAdminRepository({
    baseUrl,
    // Never emit the development identity header from a production build.
    devUserId: production ? undefined : env.VITE_DEV_USER_ID?.trim() || undefined,
    getAccessToken: options.getAccessToken,
    fetch: options.fetch,
    now: options.now,
  });
}
