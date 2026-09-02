import { describe, expect, it } from 'vitest';
import type { Env } from './env';
import app from './index';
import { canonicalLegacySourcePath } from './routes/redirects';

const localEnv: Env = {
  APP_ENV: 'development',
  ALLOW_DEV_AUTH: 'true',
  CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
};

function resolve(path: string) {
  return app.request(`/redirects/resolve?${new URLSearchParams({ path })}`, {}, localEnv);
}

describe('legacy redirect resolution', () => {
  it('normalizes Unicode and a missing trailing slash before exact active lookup', async () => {
    const response = await resolve('/نشرة-أميال');

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('public, max-age=60');
    expect(await response.json()).toEqual({
      destination: '/articles/first-90-days/',
      statusCode: 301,
    });
  });

  it('returns only the reviewed public fields for an external HTTPS destination', async () => {
    const response = await resolve('/legacy-campaign/');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ destination: 'https://example.com/landing', statusCode: 302 });
    expect(JSON.stringify(body)).not.toMatch(/source_label|legacy|created_at|is_active/iu);
  });

  it.each(['/inactive-legacy/', '/does-not-exist/'])(
    'does not resolve an inactive or missing path: %s',
    async (path) => {
      expect((await resolve(path)).status).toBe(404);
    },
  );

  it.each(['/self-loop-no-slash/', '/self-loop-query/'])(
    'rejects a relative destination that resolves back to the source path: %s',
    async (path) => {
      expect((await resolve(path)).status).toBe(404);
    },
  );

  it.each([
    '',
    '/',
    'relative',
    'https://evil.example/path',
    '//evil.example/path',
    '/with?query',
    '/with#fragment',
    '/encoded%2Fseparator/',
    '/../admin/',
    '/bad%escape/',
  ])('rejects a malformed or ambiguous source path: %s', async (path) => {
    expect(canonicalLegacySourcePath(path)).toBeNull();
    expect((await resolve(path)).status).toBe(404);
  });
});
