import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import app from './index';
import type { Env } from './env';
import * as repositoryModule from './repo';
import { createMemoryRepository } from './repo/memory';
import { createSupabaseCustomerRepository } from './repo/customer-supabase';

const localEnv: Env = { APP_ENV: 'development', ALLOW_DEV_AUTH: 'true' };
const migration = '0024_customer_accounts_library.sql';
afterEach(() => vi.restoreAllMocks());

describe('public customer schema readiness', () => {
  it('returns only readiness without resolving identity or creating a customer', async () => {
    const repository = createMemoryRepository();
    vi.spyOn(repositoryModule, 'getRepository').mockReturnValue(repository);
    const resolve = vi.spyOn(repository, 'getUser');
    const provision = vi.spyOn(repository, 'provisionCustomer');
    const response = await app.request(
      '/health/customer-schema',
      { headers: { 'x-dev-user': 'usr-listener-1', authorization: 'Bearer ignored-by-health' } },
      localEnv,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ready: true });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(resolve).not.toHaveBeenCalled();
    expect(provision).not.toHaveBeenCalled();
    expect((await app.request('/app/account', {}, localEnv)).status).toBe(401);
    expect((await app.request('/app/library', {}, localEnv)).status).toBe(401);
  });

  it.each(['not-ready', 'provider-error'] as const)(
    'returns a generic uncached 503 for %s',
    async (failure) => {
      const repository = createMemoryRepository();
      vi.spyOn(repositoryModule, 'getRepository').mockReturnValue(repository);
      const readiness = vi.spyOn(repository, 'isCustomerSchemaReady');
      if (failure === 'not-ready') readiness.mockResolvedValue(false);
      else readiness.mockRejectedValue(new Error('private provider diagnostic'));
      const log = vi.spyOn(console, 'error');
      const response = await app.request('/health/customer-schema', {}, localEnv);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ ready: false });
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(log).not.toHaveBeenCalled();
    },
  );

  it('fails generically when credentials or browser configuration are unavailable', async () => {
    const response = await app.request(
      '/health/customer-schema',
      { headers: { origin: 'https://example.invalid' } },
      { APP_ENV: 'production', ALLOW_DEV_AUTH: 'false', CORS_ALLOWED_ORIGINS: '*' },
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ready: false });
  });
});

type ReadinessFailure =
  'missing-ledger' | 'missing-profiles' | 'missing-libraries' | 'missing-column' | 'transport';

function supabaseReadiness(failure?: ReadinessFailure) {
  const requests: Request[] = [];
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    const url = new URL(request.url);
    const table = url.pathname.split('/').at(-1);
    if (failure === 'transport') throw new Error('private transport diagnostic');
    const missingTable =
      (failure === 'missing-profiles' && table === 'customer_profiles') ||
      (failure === 'missing-libraries' && table === 'customer_libraries');
    const missingColumn = failure === 'missing-column' && table === 'customer_libraries';
    const body =
      missingTable || missingColumn
        ? { code: missingTable ? 'PGRST205' : '42703', message: 'private schema diagnostic' }
        : table === 'schema_migrations' && failure !== 'missing-ledger'
          ? [{ filename: migration }]
          : [];
    return new Response(JSON.stringify(body), {
      status: missingTable ? 404 : missingColumn ? 400 : 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  const db = createClient('https://schema-readiness.invalid', 'fixture-only-service-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetcher },
  });
  return { repository: createSupabaseCustomerRepository(db), requests };
}

describe('Supabase customer readiness checks', () => {
  it('checks the exact ledger and all required columns using only bounded GETs with zero customer rows', async () => {
    const { repository, requests } = supabaseReadiness();
    expect(await repository.isCustomerSchemaReady()).toBe(true);
    expect(requests).toHaveLength(3);
    expect(requests.every((request) => request.method === 'GET' && request.body === null)).toBe(
      true,
    );
    const ledger = new URL(requests[0].url);
    expect(ledger.pathname).toBe('/rest/v1/schema_migrations');
    expect(ledger.searchParams.get('filename')).toBe(`eq.${migration}`);
    expect(ledger.searchParams.get('select')).toBe('filename');
    const columns = new Map(
      requests.slice(1).map((request) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('limit')).toBe('0');
        return [url.pathname, url.searchParams.get('select')];
      }),
    );
    expect(columns.get('/rest/v1/customer_profiles')).toBe(
      'user_id,gender,birth_date,interests,onboarded,updated_at',
    );
    expect(columns.get('/rest/v1/customer_libraries')).toBe('user_id,document,revision,updated_at');
  });

  it.each<ReadinessFailure>([
    'missing-ledger',
    'missing-profiles',
    'missing-libraries',
    'missing-column',
    'transport',
  ])('fails closed for %s without mutation or RPC execution', async (failure) => {
    const { repository, requests } = supabaseReadiness(failure);
    expect(await repository.isCustomerSchemaReady()).toBe(false);
    expect(requests.length).toBeLessThanOrEqual(3);
    expect(
      requests.every((request) => request.method === 'GET' && !request.url.includes('/rpc/')),
    ).toBe(true);
    if (failure === 'missing-ledger') expect(requests).toHaveLength(1);
  });
});
