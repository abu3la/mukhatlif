import { describe, expect, it } from 'vitest';
import { formRateLimitKey } from './security/form-rate-limit';

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

describe('public form rate-limit fingerprint', () => {
  it('is deterministic, keyed, type-scoped, and never the direct address hash', async () => {
    const secret = 'test-secret-that-is-longer-than-32-bytes';
    const address = '203.0.113.25';
    const first = await formRateLimitKey(secret, 'sponsorship', address);
    const second = await formRateLimitKey(secret, 'sponsorship', address);
    const otherSecret = await formRateLimitKey(`${secret}-other`, 'sponsorship', address);
    const otherType = await formRateLimitKey(secret, 'careers', address);
    const newsletter = await formRateLimitKey(secret, 'newsletter_subscription', address);
    const directHash = hex(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`sponsorship\0${address}`)),
    );

    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toBe(first);
    expect(otherSecret).not.toBe(first);
    expect(otherType).not.toBe(first);
    expect(newsletter).not.toBe(first);
    expect(first).not.toBe(directHash);
  });
});
