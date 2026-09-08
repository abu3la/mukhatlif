import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Api from './api';
const lookup = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof Api>()),
  resolveLegacyRedirect: lookup,
}));
import { NotFoundError, ApiUnavailableError } from '@/lib/api';
import { GET } from '@/app/[...legacyPath]/route';
beforeEach(() => {
  lookup.mockReset();
});
describe('legacy route recovery and redirects', () => {
  it.each([301, 302, 307, 308])(
    'preserves reviewed redirect status %s and Location',
    async (statusCode) => {
      lookup.mockResolvedValue({ destination: '/shows/petroly?source=legacy', statusCode });
      const response = await GET(new Request('https://web.test/old/?incoming=discard'));
      expect(response.status).toBe(statusCode);
      expect(response.headers.get('location')).toBe('/shows/petroly?source=legacy');
      expect(response.headers.get('cache-control')).toBe('public, max-age=60');
      expect(await response.text()).toBe('');
    },
  );
  it('shows the genuine branded 404 when a legacy record does not exist', async () => {
    const error = new NotFoundError();
    expect(error).toBeInstanceOf(NotFoundError);
    lookup.mockRejectedValue(error);
    const response = await GET(new Request('https://web.test/unknown/'));
    expect(response.status).toBe(404);
    expect(await response.text()).toContain('هذه الصفحة ليست هنا.');
  });
  it('shows retryable branded503 without redirecting on content API failure', async () => {
    const error = new ApiUnavailableError('not rendered');
    expect(error).toBeInstanceOf(ApiUnavailableError);
    lookup.mockRejectedValue(error);
    const response = await GET(new Request('https://web.test/old/?source=retry'));
    expect(response.status).toBe(503);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('retry-after')).toBe('60');
    const body = await response.text();
    expect(body).toContain('href="/old/?source=retry"');
    expect(body).not.toContain('not rendered');
  });
});
