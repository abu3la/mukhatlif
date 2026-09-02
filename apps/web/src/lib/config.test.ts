import { afterEach, describe, expect, it } from 'vitest';
import { absoluteUrl, apiOrigin, isSearchIndexingEnabled, publicWebUrl } from './config';

const original = { ...process.env };

afterEach(() => {
  process.env = { ...original };
});

describe('apiOrigin', () => {
  it('normalizes a configured origin and drops a trailing slash', () => {
    process.env.MUKHTALIF_API_URL = 'https://api.mukhtalif.net/';
    expect(apiOrigin()).toBe('https://api.mukhtalif.net');
  });

  it('returns null when unset so the caller can render at request time', () => {
    delete process.env.MUKHTALIF_API_URL;
    expect(apiOrigin()).toBeNull();
  });

  it('allows a local HTTP origin but rejects a remote one', () => {
    process.env.MUKHTALIF_API_URL = 'http://127.0.0.1:8787';
    expect(apiOrigin()).toBe('http://127.0.0.1:8787');
    process.env.MUKHTALIF_API_URL = 'http://api.mukhtalif.net';
    expect(() => apiOrigin()).toThrow(/HTTPS/);
  });

  it('rejects a malformed URL and one carrying credentials', () => {
    process.env.MUKHTALIF_API_URL = 'not-a-url';
    expect(() => apiOrigin()).toThrow(/absolute URL/);
    process.env.MUKHTALIF_API_URL = 'https://user:pass@api.mukhtalif.net';
    expect(() => apiOrigin()).toThrow(/credentials/);
  });
});

describe('publicWebUrl', () => {
  it('builds absolute article links from the configured public origin', () => {
    // This must match the Worker's PUBLIC_WEB_URL: a sent newsletter already
    // contains links built from that value and they cannot be rewritten.
    process.env.PUBLIC_WEB_URL = 'https://mukhtalif.net';
    expect(publicWebUrl()).toBe('https://mukhtalif.net');
    expect(absoluteUrl('/articles/first-90-days')).toBe(
      'https://mukhtalif.net/articles/first-90-days',
    );
  });

  it('falls back to the local origin when unset', () => {
    delete process.env.PUBLIC_WEB_URL;
    expect(publicWebUrl()).toBe('http://localhost:3000');
  });

  it('allows indexing only on the final public hostname', () => {
    process.env.PUBLIC_WEB_URL = 'https://staging.mukhtalif.net';
    expect(isSearchIndexingEnabled()).toBe(false);

    process.env.PUBLIC_WEB_URL = 'https://mukhtalif.net';
    expect(isSearchIndexingEnabled()).toBe(true);
  });
});
