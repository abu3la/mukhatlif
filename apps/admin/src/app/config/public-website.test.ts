import { describe, expect, it } from 'vitest';
import { publicWebsite } from './public-website';

describe('Studio website shortcut', () => {
  it.each(['studio.mukhtalif-development.workers.dev', 'localhost', '127.0.0.1', '[::1]'])(
    'keeps %s on development even with a live build setting',
    (host) => {
      expect(publicWebsite(host, 'live')).toEqual({
        href: 'https://web.mukhtalif-development.workers.dev',
        label: 'التطوير',
      });
    },
  );
  it('defaults production Studio to the acceptance website', () => {
    expect(publicWebsite('studio.mukhtalif.net')?.href).toBe('https://staging.mukhtalif.net');
  });
  it('switches production to the main website only with the explicit live setting', () => {
    expect(publicWebsite('studio.mukhtalif.net', 'live')?.href).toBe('https://mukhtalif.net');
    expect(publicWebsite('studio.mukhtalif.net', 'unexpected')?.href).toBe(
      'https://staging.mukhtalif.net',
    );
  });
  it.each(['studio.mukhtalif.net.evil.test', 'unrelated.test', ''])(
    'does not guess an environment for %s',
    (host) => {
      expect(publicWebsite(host)).toBeNull();
    },
  );
});
