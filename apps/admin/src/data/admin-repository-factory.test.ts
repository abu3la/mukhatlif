import { describe, expect, it } from 'vitest';
import { createAdminRepository } from './admin-repository-factory';
import { AdminRepositoryError } from './repository-error';

describe('createAdminRepository', () => {
  it('selects fixture data only in non-production mode', () => {
    const repository = createAdminRepository({
      env: { MODE: 'development', DEV: true, PROD: false },
    });

    expect(repository.kind).toBe('fixture');
    expect(repository.capabilities['guest-management']).toBe(true);
  });

  it('forbids an explicit production fixture source', () => {
    expect(() =>
      createAdminRepository({
        env: {
          MODE: 'production',
          PROD: true,
          VITE_ADMIN_DATA_SOURCE: 'fixture',
        },
      }),
    ).toThrowError(AdminRepositoryError);
  });

  it('requires the Hono origin instead of falling back to fixtures', () => {
    expect(() =>
      createAdminRepository({
        env: {
          MODE: 'production',
          PROD: true,
          VITE_ADMIN_DATA_SOURCE: 'hono',
        },
      }),
    ).toThrowError(/VITE_API_URL/);
  });

  it('selects Hono explicitly and still reports analytics as unsupported', () => {
    const repository = createAdminRepository({
      env: {
        MODE: 'development',
        DEV: true,
        VITE_ADMIN_DATA_SOURCE: 'hono',
        VITE_API_URL: 'https://api.example.test',
        VITE_DEV_USER_ID: 'usr-admin-1',
      },
      fetch: async () => new Response('{}', { status: 200 }),
    });

    expect(repository.kind).toBe('hono');
    expect(repository.capabilities['core-dashboard']).toBe(true);
    // Guests are served by /studio/guests as of ADR 0007.
    expect(repository.capabilities['guest-management']).toBe(true);
    // There is still no analytics service behind the API, and an adapter must
    // not disguise that by deriving figures the server never produced.
    expect(repository.capabilities['admin-analytics']).toBe(false);
  });
});
