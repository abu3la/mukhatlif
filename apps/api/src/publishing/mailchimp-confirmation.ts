import type { MailchimpConfig } from '../env';

export interface MailchimpConfirmationContext {
  audienceName: string;
  audienceCount: number;
  recipientTag: string;
  recipientCount: number;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

/** Opaque binding for every configuration and verified value shown at confirmation time. */
export async function createAudienceConfirmationToken(
  config: MailchimpConfig,
  context: MailchimpConfirmationContext,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(config.apiKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const message = JSON.stringify([
    'mukhtalif:mailchimp-confirmation:v2',
    config.serverPrefix,
    config.audienceId,
    config.recipientSegmentId,
    config.fromName,
    config.replyTo,
    config.publicWebUrl,
    context.audienceName,
    context.audienceCount,
    context.recipientTag,
    context.recipientCount,
  ]);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return base64Url(new Uint8Array(signature));
}
