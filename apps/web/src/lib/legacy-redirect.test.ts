import { describe, expect, it } from 'vitest';
import {
  canonicalLegacyRequestPath,
  legacyRedirectResponse,
  validateLegacyRedirect,
  type LegacyRedirectResolution,
} from './legacy-redirect';

const requestUrl = new URL('https://web.mukhtalif-development.workers.dev/قديم/?utm=drop-me');
const sourcePath = canonicalLegacyRequestPath(requestUrl.pathname)!;

describe('canonicalLegacyRequestPath', () => {
  it('encodes Unicode, uppercases escapes, and adds the lookup trailing slash', () => {
    expect(canonicalLegacyRequestPath('/نشرة-أميال')).toBe(
      '/%D9%86%D8%B4%D8%B1%D8%A9-%D8%A3%D9%85%D9%8A%D8%A7%D9%84/',
    );
    expect(canonicalLegacyRequestPath('/legacy%2dpath/')).toBe('/legacy%2Dpath/');
  });

  it.each([
    '',
    '/',
    'relative',
    '//attacker.example/path',
    '/with?query',
    '/with#fragment',
    '/encoded%2Fseparator/',
    '/encoded%5cseparator/',
    '/../admin/',
    '/.%2e/admin/',
    '/bad%escape/',
    '/line\nbreak/',
  ])('rejects an ambiguous or malformed pathname: %s', (pathname) => {
    expect(canonicalLegacyRequestPath(pathname)).toBeNull();
  });
});

describe('validateLegacyRedirect', () => {
  it('accepts a reviewed site-relative redirect and drops the incoming query', () => {
    const redirect = validateLegacyRedirect(
      { destination: '/articles/new-home/?from=wordpress', statusCode: 301 },
      sourcePath,
      requestUrl,
    );

    expect(redirect).toEqual({
      destination: '/articles/new-home/?from=wordpress',
      statusCode: 301,
      location: '/articles/new-home/?from=wordpress',
    });
    expect(redirect?.location).not.toContain('utm=drop-me');
  });

  it('accepts an external HTTPS redirect without credentials or a fragment', () => {
    expect(
      validateLegacyRedirect(
        { destination: 'https://partner.example/landing?from=mukhtalif', statusCode: 302 },
        sourcePath,
        requestUrl,
      ),
    ).toEqual({
      destination: 'https://partner.example/landing?from=mukhtalif',
      statusCode: 302,
      location: 'https://partner.example/landing?from=mukhtalif',
    });
  });

  it.each([
    { destination: '/قديم/', statusCode: 301 },
    {
      destination: 'https://web.mukhtalif-development.workers.dev/%D9%82%D8%AF%D9%8A%D9%85',
      statusCode: 308,
    },
    { destination: '//attacker.example/path', statusCode: 301 },
    { destination: 'http://attacker.example/path', statusCode: 302 },
    { destination: 'https://user:pass@attacker.example/path', statusCode: 307 },
    { destination: 'https://attacker.example/path#fragment', statusCode: 308 },
    { destination: '/encoded%2Fseparator/', statusCode: 301 },
    { destination: '/safe/', statusCode: 300 },
  ])('rejects an unsafe or looping API result: $destination', (resolution) => {
    expect(
      validateLegacyRedirect(
        resolution as LegacyRedirectResolution,
        sourcePath,
        requestUrl,
      ),
    ).toBeNull();
  });
});

describe('legacyRedirectResponse', () => {
  it('returns the exact reviewed status and a relative Location header', () => {
    const response = legacyRedirectResponse(
      { destination: '/articles/new-home/', statusCode: 308 },
      sourcePath,
      requestUrl,
    );

    expect(response?.status).toBe(308);
    expect(response?.headers.get('location')).toBe('/articles/new-home/');
    expect(response?.headers.get('cache-control')).toBe('public, max-age=60');
    expect(response?.body).toBeNull();
  });
});
