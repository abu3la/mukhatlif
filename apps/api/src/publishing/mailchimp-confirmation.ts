import type { MailchimpConfig } from '../env';

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

/** Opaque binding for every fixed configuration value shown or rendered at confirmation time. */
export async function createAudienceConfirmationToken(config: MailchimpConfig): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(config.apiKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const message = JSON.stringify([
    'mukhtalif:mailchimp-confirmation:v1',
    config.serverPrefix,
    config.audienceId,
    config.fromName,
    config.replyTo,
    config.publicWebUrl,
  ]);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return base64Url(new Uint8Array(signature));
}
