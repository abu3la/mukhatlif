import type { FormSubmissionType } from '@mukhtalif/types';

export type PublicIntakeRateLimitScope = FormSubmissionType | 'newsletter_subscription';

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Produces an irreversible, environment-keyed address/form fingerprint. */
export async function formRateLimitKey(
  secret: string,
  type: PublicIntakeRateLimitScope,
  clientAddress: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(`${type}\0${clientAddress}`)));
}
