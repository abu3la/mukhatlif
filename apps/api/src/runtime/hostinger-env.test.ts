import { describe, expect, it } from 'vitest';
import { R2S3Bucket } from '../storage/r2-s3';
import { createHostingerRuntime, getHostingerR2Config } from './hostinger-env';

const routing = JSON.stringify({
  sponsorship: ['bd@mukhtalif.net'],
  partnership: ['bd@mukhtalif.net'],
  guest_suggestion: ['pr@mukhtalif.net'],
  careers: ['hr@mukhtalif.net'],
  production_service: ['bd@mukhtalif.net'],
  guest_review: ['pr@mukhtalif.net'],
});

function productionEnvironment(): Record<string, string> {
  return {
    APP_ENV: 'production',
    DEPLOYMENT_PLATFORM: 'hostinger',
    ALLOW_DEV_AUTH: 'false',
    CORS_ALLOWED_ORIGINS: 'https://studio.mukhtalif.net,https://staging.mukhtalif.net',
    SUPABASE_URL: 'https://project-ref.supabase.co/',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-for-runtime-tests',
    STUDIO_INVITE_REDIRECT_URL: 'https://studio.mukhtalif.net/invite',
    MAILCHIMP_CAMPAIGNS_ENABLED: 'false',
    MEDIA_PUBLIC_ORIGIN: 'https://api.mukhtalif.net',
    RESEND_ENVIRONMENT: 'production',
    RESEND_API_KEY: 're_production_test_key',
    FORMS_FROM_EMAIL: 'forms@notify.mukhtalif.net',
    FORM_NOTIFICATION_RECIPIENTS_JSON: routing,
    FORM_RATE_LIMIT_SECRET: 'a'.repeat(32),
    R2_ACCOUNT_ID: 'a'.repeat(32),
    R2_ACCESS_KEY_ID: 'r2-access-key-for-tests',
    R2_SECRET_ACCESS_KEY: 'r2-secret-access-key-for-runtime-tests',
    R2_AUDIO_BUCKET: 'mukhtalif-audio',
    R2_MEDIA_BUCKET: 'mukhtalif-media',
    TRUST_PROXY_HOPS: '1',
    PORT: '8080',
  };
}

describe('Hostinger runtime environment', () => {
  it('builds production bindings with separate S3-backed buckets', () => {
    const runtime = createHostingerRuntime(productionEnvironment());

    expect(runtime.port).toBe(8080);
    expect(runtime.trustedProxyHops).toBe(1);
    expect(runtime.bindings.AUDIO).toBeInstanceOf(R2S3Bucket);
    expect(runtime.bindings.MEDIA).toBeInstanceOf(R2S3Bucket);
    expect(runtime.bindings.CLIENT_ADDRESS).toBeUndefined();
    expect(runtime.bindings.MAILCHIMP_CAMPAIGNS_ENABLED).toBe('false');
  });

  it('requires every R2 credential and bucket together', () => {
    const env = productionEnvironment();
    delete env.R2_SECRET_ACCESS_KEY;

    expect(() => getHostingerR2Config(env)).toThrow(/must be configured together/);
  });

  it('rejects unapproved bucket names', () => {
    const env = productionEnvironment();
    env.R2_MEDIA_BUCKET = 'mukhtalif-media-production';

    expect(() => createHostingerRuntime(env)).toThrow(/approved/);
  });

  it('rejects a partial Mailchimp configuration at startup', () => {
    const env = productionEnvironment();
    env.MAILCHIMP_CAMPAIGNS_ENABLED = 'true';
    env.PUBLIC_WEB_URL = 'https://staging.mukhtalif.net';

    expect(() => createHostingerRuntime(env)).toThrow(/Mailchimp publishing settings/);
  });

  it('keeps newsletter audience credentials separate and rejects a partial set', () => {
    const env = productionEnvironment();
    env.NEWSLETTER_MAILCHIMP_SYNC_ENABLED = 'true';
    env.NEWSLETTER_MAILCHIMP_API_KEY = 'newsletter-api-key-us21';

    expect(() => createHostingerRuntime(env)).toThrow(/newsletter audience settings/);
  });

  it('requires both production browser origins', () => {
    const env = productionEnvironment();
    env.CORS_ALLOWED_ORIGINS = 'https://studio.mukhtalif.net';

    expect(() => createHostingerRuntime(env)).toThrow(/https:\/\/staging\.mukhtalif\.net/);
  });

  it('does not accept a development media or runtime boundary', () => {
    const env = productionEnvironment();
    env.MEDIA_PUBLIC_ORIGIN = 'https://mukhtalif-api.mukhtalif-development.workers.dev';
    expect(() => createHostingerRuntime(env)).toThrow(/workers\.dev/);

    const cloudflare = productionEnvironment();
    cloudflare.DEPLOYMENT_PLATFORM = 'cloudflare-workers';
    expect(() => createHostingerRuntime(cloudflare)).toThrow(/DEPLOYMENT_PLATFORM=hostinger/);
  });

  it('rejects the canonical development Supabase project', () => {
    const env = productionEnvironment();
    env.SUPABASE_URL = 'https://pacpdxvujkjvnaeeuute.supabase.co';

    expect(() => createHostingerRuntime(env)).toThrow(/development Supabase project/);
  });

  it('requires an explicit bounded proxy trust count', () => {
    const missing = productionEnvironment();
    delete missing.TRUST_PROXY_HOPS;
    expect(() => createHostingerRuntime(missing)).toThrow(/TRUST_PROXY_HOPS/);

    const excessive = productionEnvironment();
    excessive.TRUST_PROXY_HOPS = '10';
    expect(() => createHostingerRuntime(excessive)).toThrow(/TRUST_PROXY_HOPS/);
  });
});
