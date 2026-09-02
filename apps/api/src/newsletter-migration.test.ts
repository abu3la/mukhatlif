import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { newsletterSubscriptionSourceMetadataSchema } from '@mukhtalif/validation';

const migration = readFileSync(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../supabase/migrations/0021_newsletter_subscriptions.sql',
  ),
  'utf8',
);

describe('newsletter subscription migration contract', () => {
  it('accepts only complete, allowlisted legacy source provenance', () => {
    const base = { requestId: crypto.randomUUID(), formVersion: 1 as const };
    expect(
      newsletterSubscriptionSourceMetadataSchema.safeParse({
        ...base,
        legacySource: 'wordpress_elementor',
      }).success,
    ).toBe(false);
    expect(
      newsletterSubscriptionSourceMetadataSchema.safeParse({
        ...base,
        legacySource: 'wordpress_elementor',
        legacySourceVersion: 1,
        legacyFormId: '1678cc0a',
        legacySubmissionId: '12345',
        legacyMailchimpEvidence: 'ever_success',
      }).success,
    ).toBe(true);
    expect(
      newsletterSubscriptionSourceMetadataSchema.safeParse({
        ...base,
        legacySource: 'wordpress_elementor',
        legacySourceVersion: 1,
        legacyFormId: 'untrusted-form',
        legacySubmissionId: '12345',
        legacyMailchimpEvidence: 'ever_success',
      }).success,
    ).toBe(false);
  });

  it('keeps canonical contacts separate from append-only consent evidence', () => {
    expect(migration).toContain('create table public.newsletter_subscriptions');
    expect(migration).toContain('create table public.newsletter_consent_events');
    expect(migration).toContain('newsletter_consent_events_append_only');
    expect(migration).toContain('raise exception \'newsletter consent events are append-only\'');
    expect(migration).toContain('unique (id, subscription_id)');
    expect(migration).toContain('unique');
  });

  it('represents legacy evidence without claiming a current provider status', () => {
    expect(migration).toContain("'legacy_unverified'");
    expect(migration).toContain('LEGACY_MAILCHIMP_NEVER_SYNCED');
    expect(migration).toContain("'wordpress_elementor'");
    expect(migration).toContain("'1678cc0a', '79f340c2'");
    expect(migration).toContain("'legacySourceVersion'");
    expect(migration).not.toMatch(/provider_status/i);
  });

  it('exposes only guarded service-role functions and read access', () => {
    expect(migration).toContain('enable row level security');
    expect(migration).toContain('record_newsletter_subscription_request');
    expect(migration).toContain('complete_newsletter_subscription_sync');
    expect(migration).toContain(
      'grant select on table public.newsletter_subscriptions to service_role',
    );
    expect(migration).not.toMatch(
      /grant\s+(?:insert|update|delete)[^;]*newsletter_(?:subscriptions|consent_events)/i,
    );
    expect(migration.trim().startsWith('-- Public newsletter consent')).toBe(true);
    expect(migration.trim().endsWith('commit;')).toBe(true);
  });
});
