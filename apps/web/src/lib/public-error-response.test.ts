import { describe, expect, it } from 'vitest';
import { publicErrorResponse } from './public-error-response';

describe('branded public error response', () => {
  it('renders accessible Arabic 404 with genuine recovery links and no script', async () => {
    const response = publicErrorResponse(404);
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('retry-after')).toBeNull();
    const body = await response.text();
    expect(body).toContain('<html lang="ar" dir="rtl">');
    expect(body).toContain('<h1 id="error-title">');
    expect(body).toContain('href="/search"');
    expect(body).toContain('href="/"');
    expect(body).toContain('mukhtalif-logo.svg');
    expect(body).not.toContain('<script');
  });
  it('preserves 503 status and retry header while safely encoding the local retry path', async () => {
    const response = publicErrorResponse(503, '/old?utm=one&x="/><script>alert(1)</script>');
    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('60');
    const body = await response.text();
    expect(body).toContain('/old?utm=one&amp;x=');
    expect(body).not.toContain('<script>');
    expect(body).toContain('حاول مرة أخرى');
  });
  it.each(['https://evil.test/path', '//evil.test/path', 'javascript:alert(1)'])(
    'never creates an external retry destination from %s',
    async (path) => {
      const body = await publicErrorResponse(503, path).text();
      expect(body).toContain('class="error-primary" href="/"');
      expect(body).not.toContain('href="https://evil.test');
      expect(body).not.toContain('href="javascript:');
    },
  );
});
