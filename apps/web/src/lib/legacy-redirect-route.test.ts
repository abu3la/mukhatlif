import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  resolveLegacyRedirect: vi.fn(),
}));

vi.mock('./api', () => {
  class NotFoundError extends Error {}
  class ApiUnavailableError extends Error {}
  return {
    ...api,
    ApiUnavailableError,
    NotFoundError,
  };
});

import { ApiUnavailableError, NotFoundError } from './api';
import { GET } from '../app/[...legacyPath]/route';

beforeEach(() => {
  api.resolveLegacyRedirect.mockReset();
});

describe('legacy catch-all route', () => {
  it('asks the API for a canonical path and emits the reviewed redirect', async () => {
    api.resolveLegacyRedirect.mockResolvedValue({
      destination: '/articles/first-90-days/',
      statusCode: 301,
    });

    const response = await GET(
      new Request('https://web.mukhtalif-development.workers.dev/نشرة-أميال?utm=discard'),
    );

    expect(api.resolveLegacyRedirect).toHaveBeenCalledWith(
      '/%D9%86%D8%B4%D8%B1%D8%A9-%D8%A3%D9%85%D9%8A%D8%A7%D9%84/',
    );
    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe('/articles/first-90-days/');
    expect(response.headers.get('location')).not.toContain('utm=discard');
  });

  it('returns 404 without calling the API for an ambiguous pathname', async () => {
    const response = await GET(
      new Request('https://web.mukhtalif-development.workers.dev/encoded%2Fseparator/'),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(api.resolveLegacyRedirect).not.toHaveBeenCalled();
  });

  it('maps an absent reviewed redirect to 404', async () => {
    api.resolveLegacyRedirect.mockRejectedValue(new NotFoundError());

    const response = await GET(
      new Request('https://web.mukhtalif-development.workers.dev/unknown-legacy-path/'),
    );

    expect(response.status).toBe(404);
  });

  it('returns a retryable 503 when the content API is unavailable', async () => {
    api.resolveLegacyRedirect.mockRejectedValue(new ApiUnavailableError('network'));

    const response = await GET(
      new Request('https://web.mukhtalif-development.workers.dev/old-article/'),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('60');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('turns a looping API result into 404 rather than following it', async () => {
    api.resolveLegacyRedirect.mockResolvedValue({
      destination: '/old-article/?from=wordpress',
      statusCode: 308,
    });

    const response = await GET(
      new Request('https://web.mukhtalif-development.workers.dev/old-article/'),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get('location')).toBeNull();
  });
});
