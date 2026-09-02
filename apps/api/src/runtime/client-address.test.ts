import { describe, expect, it } from 'vitest';
import { resolveTrustedClientAddress } from './client-address';

describe('resolveTrustedClientAddress', () => {
  it('takes the address before the configured trusted proxy hop', () => {
    expect(
      resolveTrustedClientAddress(
        {
          socket: { remoteAddress: '10.0.0.5' },
          headers: { 'x-forwarded-for': '198.51.100.99, 203.0.113.8' },
        },
        1,
      ),
    ).toBe('203.0.113.8');
  });

  it('ignores an arbitrary client-address header', () => {
    expect(
      resolveTrustedClientAddress(
        {
          socket: { remoteAddress: '::ffff:10.0.0.5' },
          headers: { 'client-address': '1.1.1.1' },
        },
        1,
      ),
    ).toBe('10.0.0.5');
  });

  it('does not trust forwarded addresses without a socket peer', () => {
    expect(
      resolveTrustedClientAddress(
        { socket: {}, headers: { 'x-forwarded-for': '203.0.113.8' } },
        1,
      ),
    ).toBe('unknown');
  });

  it('supports an explicitly configured two-hop proxy chain', () => {
    expect(
      resolveTrustedClientAddress(
        {
          socket: { remoteAddress: '10.0.0.6' },
          headers: { 'x-forwarded-for': ['203.0.113.8', '10.0.0.5'] },
        },
        2,
      ),
    ).toBe('203.0.113.8');
  });
});
