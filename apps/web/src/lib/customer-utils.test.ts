import { describe, expect, it } from 'vitest';
import {
  customerError,
  emptyCustomerLibrary,
  episodeCount,
  safeCustomerReturn,
} from './customer-utils';

describe('customer return intent', () => {
  it('preserves same-site destination and playback time through authentication', () => {
    expect(safeCustomerReturn('/episodes/ep-real?t=120#notes')).toBe(
      '/episodes/ep-real?t=120#notes',
    );
    expect(safeCustomerReturn('/library?tab=playlists')).toBe('/library?tab=playlists');
  });
  it.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '/%5Cevil.example',
    '/%2Fevil.example',
    '/login?next=/login',
    '/%6Cogin',
    '/auth/callback',
    '/onboarding',
    '/\u0000broken',
    '/\nevil',
  ])('rejects unsafe or circular destination %s', (value) => {
    expect(safeCustomerReturn(value)).toBe('/account');
  });
  it('uses the caller fallback for an absent signup destination', () => {
    expect(safeCustomerReturn(undefined, '/')).toBe('/');
  });
});

describe('customer presentation', () => {
  it('distinguishes auth recovery errors without echoing provider internals', () => {
    expect(customerError({ code: 'email_not_confirmed' })).toContain('أكّد بريدك');
    expect(customerError({ code: 'invalid_credentials' })).toContain('غير صحيحة');
    expect(customerError(new Error('secret upstream details'))).not.toContain('secret');
  });
  it('creates separate empty collections per account reset', () => {
    const first = emptyCustomerLibrary();
    first.savedEpisodeIds.push('ep');
    expect(emptyCustomerLibrary().savedEpisodeIds).toEqual([]);
  });
  it('uses correct count forms', () => {
    expect([0, 1, 2, 3, 11].map(episodeCount)).toEqual([
      'لا حلقات بعد',
      'حلقة واحدة',
      'حلقتان',
      '3 حلقات',
      '11 حلقة',
    ]);
  });
});
