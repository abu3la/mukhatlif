import { describe, expect, it } from 'vitest';
import { getMailchimpConfig, getNewsletterMailchimpConfig, type Env } from './env';

describe('newsletter Mailchimp environment boundary', () => {
  it('requires an explicit positive campaign recipient segment id', () => {
    const campaign: Env = {
      APP_ENV: 'development',
      MAILCHIMP_CAMPAIGNS_ENABLED: 'true',
      MAILCHIMP_API_KEY: 'campaign-api-key-us1',
      MAILCHIMP_SERVER_PREFIX: 'us1',
      MAILCHIMP_AUDIENCE_ID: 'campaign_audience',
      MAILCHIMP_FROM_NAME: 'مختلف',
      MAILCHIMP_REPLY_TO: 'studio@mukhtalif.net',
      PUBLIC_WEB_URL: 'http://localhost:3000',
    };
    expect(() => getMailchimpConfig(campaign)).toThrow(/configured together/);
    expect(() => getMailchimpConfig({ ...campaign, MAILCHIMP_RECIPIENT_SEGMENT_ID: '0' })).toThrow(
      /positive integer/,
    );
  });

  it('is independent from campaign publishing configuration', () => {
    const campaignOnly: Env = {
      APP_ENV: 'development',
      MAILCHIMP_CAMPAIGNS_ENABLED: 'true',
      MAILCHIMP_API_KEY: 'campaign-api-key-us1',
      MAILCHIMP_SERVER_PREFIX: 'us1',
      MAILCHIMP_AUDIENCE_ID: 'campaign_audience',
      MAILCHIMP_RECIPIENT_SEGMENT_ID: '31415',
      MAILCHIMP_FROM_NAME: 'مختلف',
      MAILCHIMP_REPLY_TO: 'studio@mukhtalif.net',
      PUBLIC_WEB_URL: 'http://localhost:3000',
    };
    expect(getNewsletterMailchimpConfig(campaignOnly)).toBeNull();
  });

  it('keeps stored campaign credentials inert until publishing is explicitly enabled', () => {
    const storedCampaign: Env = {
      APP_ENV: 'development',
      MAILCHIMP_API_KEY: 'campaign-api-key-us1',
      MAILCHIMP_SERVER_PREFIX: 'us1',
      MAILCHIMP_AUDIENCE_ID: 'campaign_audience',
      MAILCHIMP_RECIPIENT_SEGMENT_ID: '31415',
      MAILCHIMP_FROM_NAME: 'مختلف',
      MAILCHIMP_REPLY_TO: 'studio@mukhtalif.net',
      PUBLIC_WEB_URL: 'http://localhost:3000',
    };

    expect(getMailchimpConfig(storedCampaign)).toBeNull();
    expect(
      getMailchimpConfig({ ...storedCampaign, MAILCHIMP_CAMPAIGNS_ENABLED: 'false' }),
    ).toBeNull();
    expect(
      getMailchimpConfig({ ...storedCampaign, MAILCHIMP_CAMPAIGNS_ENABLED: 'true' }),
    ).toMatchObject({
      audienceId: 'campaign_audience',
      recipientSegmentId: 31415,
    });
    expect(() =>
      getMailchimpConfig({ ...storedCampaign, MAILCHIMP_CAMPAIGNS_ENABLED: 'yes' }),
    ).toThrow(/must be true or false/);
  });

  it('accepts the complete audience-only configuration', () => {
    expect(
      getNewsletterMailchimpConfig({
        NEWSLETTER_MAILCHIMP_SYNC_ENABLED: 'true',
        NEWSLETTER_MAILCHIMP_API_KEY: 'newsletter-api-key-us21',
        NEWSLETTER_MAILCHIMP_SERVER_PREFIX: 'us21',
        NEWSLETTER_MAILCHIMP_AUDIENCE_ID: 'legacy_audience',
      }),
    ).toEqual({
      apiKey: 'newsletter-api-key-us21',
      serverPrefix: 'us21',
      audienceId: 'legacy_audience',
    });
  });

  it('fails closed on partial or malformed audience settings', () => {
    expect(() =>
      getNewsletterMailchimpConfig({
        NEWSLETTER_MAILCHIMP_SYNC_ENABLED: 'true',
        NEWSLETTER_MAILCHIMP_API_KEY: 'newsletter-api-key-us21',
      }),
    ).toThrow(/configured together/);
    expect(() =>
      getNewsletterMailchimpConfig({
        NEWSLETTER_MAILCHIMP_SYNC_ENABLED: 'true',
        NEWSLETTER_MAILCHIMP_API_KEY: 'newsletter-api-key-us21',
        NEWSLETTER_MAILCHIMP_SERVER_PREFIX: 'https://us21.example',
        NEWSLETTER_MAILCHIMP_AUDIENCE_ID: 'legacy_audience',
      }),
    ).toThrow(/SERVER_PREFIX/);
  });

  it('keeps stored credentials inert until sync is explicitly enabled', () => {
    expect(
      getNewsletterMailchimpConfig({
        NEWSLETTER_MAILCHIMP_SYNC_ENABLED: 'false',
        NEWSLETTER_MAILCHIMP_API_KEY: 'newsletter-api-key-us21',
        NEWSLETTER_MAILCHIMP_SERVER_PREFIX: 'us21',
        NEWSLETTER_MAILCHIMP_AUDIENCE_ID: 'legacy_audience',
      }),
    ).toBeNull();
    expect(() =>
      getNewsletterMailchimpConfig({ NEWSLETTER_MAILCHIMP_SYNC_ENABLED: 'yes' }),
    ).toThrow(/must be true or false/);
  });
});
