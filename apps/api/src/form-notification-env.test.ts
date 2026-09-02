import { describe, expect, it } from 'vitest';
import {
  ApiConfigurationError,
  FORM_NOTIFICATION_POLICIES,
  getFormNotificationConfig,
  getFormRateLimitSecret,
  getMediaPublicOrigin,
  type Env,
} from './env';

const developmentRouting = JSON.stringify(FORM_NOTIFICATION_POLICIES.development.recipients);
const productionRouting = JSON.stringify(FORM_NOTIFICATION_POLICIES.production.recipients);

const developmentEnv: Env = {
  APP_ENV: 'development',
  DEPLOYMENT_PLATFORM: 'cloudflare-workers',
  RESEND_ENVIRONMENT: 'development',
  RESEND_API_KEY: 're_test_development_1234',
  FORMS_FROM_EMAIL: 'forms@devmail.mukhtalif.net',
  FORM_NOTIFICATION_RECIPIENTS_JSON: developmentRouting,
};

const productionEnv: Env = {
  APP_ENV: 'production',
  DEPLOYMENT_PLATFORM: 'hostinger',
  RESEND_ENVIRONMENT: 'production',
  RESEND_API_KEY: 're_test_production_1234',
  FORMS_FROM_EMAIL: 'forms@notify.mukhtalif.net',
  FORM_NOTIFICATION_RECIPIENTS_JSON: productionRouting,
};

describe('form notification environment', () => {
  it('returns null only when the notification configuration is wholly absent', () => {
    expect(getFormNotificationConfig({})).toBeNull();
    expect(() => getFormNotificationConfig({ RESEND_API_KEY: 're_test_1234567890' })).toThrow(
      ApiConfigurationError,
    );
  });

  it('accepts the complete development policy and normalizes its sender', () => {
    expect(
      getFormNotificationConfig({
        ...developmentEnv,
        FORMS_FROM_EMAIL: ' FORMS@DEVMAIL.MUKHTALIF.NET ',
      }),
    ).toEqual({
      apiKey: 're_test_development_1234',
      fromEmail: 'forms@devmail.mukhtalif.net',
      recipients: FORM_NOTIFICATION_POLICIES.development.recipients,
    });
  });

  it('accepts development email on the public fail-closed Worker', () => {
    expect(getFormNotificationConfig({ ...developmentEnv, APP_ENV: 'production' })).not.toBeNull();
  });

  it('accepts production only on Hostinger with the production domain and routing', () => {
    expect(getFormNotificationConfig(productionEnv)).toEqual({
      apiKey: 're_test_production_1234',
      fromEmail: 'forms@notify.mukhtalif.net',
      recipients: FORM_NOTIFICATION_POLICIES.production.recipients,
    });
  });

  it('keeps a complete non-secret policy dormant until its API key is supplied', () => {
    expect(getFormNotificationConfig({ ...developmentEnv, RESEND_API_KEY: '' })).toBeNull();
  });

  it('rejects production routing, sender, or profile on Cloudflare development', () => {
    expect(() =>
      getFormNotificationConfig({
        ...productionEnv,
        DEPLOYMENT_PLATFORM: 'cloudflare-workers',
      }),
    ).toThrow(ApiConfigurationError);
    expect(() =>
      getFormNotificationConfig({
        ...developmentEnv,
        FORMS_FROM_EMAIL: 'forms@notify.mukhtalif.net',
      }),
    ).toThrow(ApiConfigurationError);
    expect(() =>
      getFormNotificationConfig({
        ...developmentEnv,
        FORM_NOTIFICATION_RECIPIENTS_JSON: productionRouting,
      }),
    ).toThrow(ApiConfigurationError);
  });

  it('rejects development routing, sender, or profile on Hostinger production', () => {
    expect(() =>
      getFormNotificationConfig({
        ...productionEnv,
        APP_ENV: 'development',
      }),
    ).toThrow(ApiConfigurationError);
    expect(() =>
      getFormNotificationConfig({
        ...developmentEnv,
        APP_ENV: 'production',
        DEPLOYMENT_PLATFORM: 'hostinger',
      }),
    ).toThrow(ApiConfigurationError);
    expect(() =>
      getFormNotificationConfig({
        ...productionEnv,
        FORMS_FROM_EMAIL: 'forms@devmail.mukhtalif.net',
      }),
    ).toThrow(ApiConfigurationError);
    expect(() =>
      getFormNotificationConfig({
        ...productionEnv,
        FORM_NOTIFICATION_RECIPIENTS_JSON: developmentRouting,
      }),
    ).toThrow(ApiConfigurationError);
  });

  it('rejects incomplete, unknown, and unsafe recipient routing', () => {
    const developmentRecipients = FORM_NOTIFICATION_POLICIES.development.recipients;
    const incomplete = Object.fromEntries(
      Object.entries(developmentRecipients).filter(([type]) => type !== 'careers'),
    );
    expect(() =>
      getFormNotificationConfig({
        ...developmentEnv,
        FORM_NOTIFICATION_RECIPIENTS_JSON: JSON.stringify(incomplete),
      }),
    ).toThrow(ApiConfigurationError);
    expect(() =>
      getFormNotificationConfig({
        ...developmentEnv,
        FORM_NOTIFICATION_RECIPIENTS_JSON: JSON.stringify({
          ...developmentRecipients,
          unknown: ['aaahashmi95@gmail.com'],
        }),
      }),
    ).toThrow(ApiConfigurationError);
    expect(() =>
      getFormNotificationConfig({
        ...developmentEnv,
        FORM_NOTIFICATION_RECIPIENTS_JSON: JSON.stringify({
          ...developmentRecipients,
          careers: ['not-an-email'],
        }),
      }),
    ).toThrow(ApiConfigurationError);
  });
});

describe('production media origin ownership', () => {
  it('rejects a development workers.dev media origin on Hostinger', () => {
    expect(() =>
      getMediaPublicOrigin({
        APP_ENV: 'production',
        DEPLOYMENT_PLATFORM: 'hostinger',
        MEDIA_PUBLIC_ORIGIN: 'https://mukhtalif-api.mukhtalif-development.workers.dev',
      }),
    ).toThrow(ApiConfigurationError);
    expect(
      getMediaPublicOrigin({
        APP_ENV: 'production',
        DEPLOYMENT_PLATFORM: 'hostinger',
        MEDIA_PUBLIC_ORIGIN: 'https://api.mukhtalif.net',
      }),
    ).toBe('https://api.mukhtalif.net');
  });
});

describe('form rate-limit environment', () => {
  it('allows only the explicit in-memory development fallback', () => {
    const localSecret = getFormRateLimitSecret({ APP_ENV: 'development', ALLOW_DEV_AUTH: 'true' });
    expect(new TextEncoder().encode(localSecret).byteLength).toBeGreaterThanOrEqual(32);
    expect(() => getFormRateLimitSecret({ APP_ENV: 'production' })).toThrow(ApiConfigurationError);
    expect(() =>
      getFormRateLimitSecret({
        APP_ENV: 'development',
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      }),
    ).toThrow(ApiConfigurationError);
  });

  it('accepts a strong configured secret without exposing it in errors', () => {
    const secret = 'configured-form-rate-secret-123456789';
    expect(getFormRateLimitSecret({ APP_ENV: 'production', FORM_RATE_LIMIT_SECRET: secret })).toBe(
      secret,
    );

    const unsafe = 'secret-value-that-must-not-leak';
    try {
      getFormRateLimitSecret({ APP_ENV: 'production', FORM_RATE_LIMIT_SECRET: unsafe });
      throw new Error('Expected an invalid rate-limit secret');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiConfigurationError);
      expect((error as Error).message).not.toContain(unsafe);
    }
  });
});
