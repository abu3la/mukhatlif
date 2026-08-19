import { describe, expect, it } from 'vitest';
import type { MailchimpConfig } from '../env';
import { createAudienceConfirmationToken } from './mailchimp-confirmation';

const config: MailchimpConfig = {
  apiKey: 'secret-api-key-us1',
  serverPrefix: 'us1',
  audienceId: 'audience_1',
  fromName: 'مختلف',
  replyTo: 'studio@mukhtalif.net',
  publicWebUrl: 'https://mukhtalif.net',
};

describe('Mailchimp confirmation fingerprint', () => {
  it('changes when any fixed audience, sender, or rendering configuration changes', async () => {
    const original = await createAudienceConfirmationToken(config);
    const changed = await Promise.all([
      createAudienceConfirmationToken({ ...config, serverPrefix: 'us2' }),
      createAudienceConfirmationToken({ ...config, audienceId: 'audience_2' }),
      createAudienceConfirmationToken({ ...config, fromName: 'مختلف الأسبوعية' }),
      createAudienceConfirmationToken({ ...config, replyTo: 'letters@mukhtalif.net' }),
      createAudienceConfirmationToken({ ...config, publicWebUrl: 'https://www.mukhtalif.net' }),
    ]);

    expect(original).toHaveLength(43);
    expect(new Set(changed).size).toBe(changed.length);
    expect(changed).not.toContain(original);
  });
});
