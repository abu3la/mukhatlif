import { describe, expect, it } from 'vitest';
import type { MailchimpConfig } from '../env';
import { createAudienceConfirmationToken } from './mailchimp-confirmation';

const config: MailchimpConfig = {
  apiKey: 'secret-api-key-us1',
  serverPrefix: 'us1',
  audienceId: 'audience_1',
  recipientSegmentId: 31415,
  fromName: 'مختلف',
  replyTo: 'studio@mukhtalif.net',
  publicWebUrl: 'https://mukhtalif.net',
};

const context = {
  audienceName: 'مشتركو مختلف',
  audienceCount: 1_280,
  recipientTag: 'nlpage',
  recipientCount: 730,
};

describe('Mailchimp confirmation fingerprint', () => {
  it('changes when any fixed audience, recipient, sender, or rendering value changes', async () => {
    const original = await createAudienceConfirmationToken(config, context);
    const changed = await Promise.all([
      createAudienceConfirmationToken({ ...config, serverPrefix: 'us2' }, context),
      createAudienceConfirmationToken({ ...config, audienceId: 'audience_2' }, context),
      createAudienceConfirmationToken({ ...config, recipientSegmentId: 27 }, context),
      createAudienceConfirmationToken({ ...config, fromName: 'مختلف الأسبوعية' }, context),
      createAudienceConfirmationToken({ ...config, replyTo: 'letters@mukhtalif.net' }, context),
      createAudienceConfirmationToken(
        { ...config, publicWebUrl: 'https://www.mukhtalif.net' },
        context,
      ),
      createAudienceConfirmationToken(config, { ...context, audienceName: 'قائمة أخرى' }),
      createAudienceConfirmationToken(config, { ...context, audienceCount: 1_281 }),
      createAudienceConfirmationToken(config, { ...context, recipientTag: 'other' }),
      createAudienceConfirmationToken(config, { ...context, recipientCount: 731 }),
    ]);

    expect(original).toHaveLength(43);
    expect(new Set(changed).size).toBe(changed.length);
    expect(changed).not.toContain(original);
  });
});
