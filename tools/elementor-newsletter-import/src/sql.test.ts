import { describe, expect, it } from 'vitest';
import type { LegacyNewsletterImportPlan } from './core.ts';
import { transactionalNewsletterSql } from './sql.ts';

function plan(overrides: { firstName?: string | null } = {}): LegacyNewsletterImportPlan {
  const requestId = '11111111-1111-5111-8111-111111111111';
  const subscriptionId = 'nls-legacy_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const eventId = 'nce-legacy_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const firstName = overrides.firstName === undefined ? "O'Reilly" : overrides.firstName;
  return {
    schemaVersion: 1,
    mode: 'dry-run',
    writesPerformed: false,
    source: {
      kind: 'hostinger_phpmyadmin_select_only',
      database: 'u916712841_S5L96',
      tables: ['wp_e_submissions', 'wp_e_submissions_values', 'wp_e_submissions_actions_log'],
      capturedAt: '2026-09-02T18:00:00.000Z',
      artifactSha256: 'a'.repeat(64),
      querySha256: 'b'.repeat(64),
    },
    target: {
      migration: '0021_newsletter_subscriptions.sql',
      tables: ['newsletter_subscriptions', 'newsletter_consent_events'],
    },
    policy: {
      createsExplicitConsent: false,
      claimsCurrentProviderStatus: false,
      resubscribesContacts: false,
      sendsEmail: false,
      contactsMailchimp: false,
      deletesSourceData: false,
    },
    counts: {
      sourceSubmissions: 1,
      plannedConsentEvents: 1,
      canonicalContacts: 1,
      canonicalEverSuccess: 1,
      canonicalNeverSuccess: 0,
      submissionEverSuccess: 1,
      submissionNeverSuccess: 0,
      repeatedSubmissionEvents: 0,
      contactsWithMultipleSubmissions: 0,
      contactsWithMixedEvidence: 0,
      contactsWithFirstName: firstName === null ? 0 : 1,
      byForm: { '1678cc0a': 1, '79f340c2': 0 },
    },
    subscriptions: [
      {
        id: subscriptionId,
        email: 'person@example.test',
        firstName,
        syncStatus: 'legacy_unverified',
        syncAttemptCount: 0,
        syncAttemptedAt: null,
        syncError: null,
        latestConsentEventId: eventId,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        evidence: 'ever_success',
        provenance: {
          contactKeySha256: 'c'.repeat(64),
          legacySubmissionIds: ['10'],
          sourceRecordSha256s: ['d'.repeat(64)],
        },
      },
    ],
    consentEvents: [
      {
        id: eventId,
        subscriptionId,
        requestId,
        eventKind: 'legacy_request',
        email: 'person@example.test',
        firstName,
        consentVersion: null,
        consentAcceptedAt: null,
        sourceMetadata: {
          requestId,
          formVersion: 1,
          legacySource: 'wordpress_elementor',
          legacySourceVersion: 1,
          legacyFormId: '1678cc0a',
          legacySubmissionId: '10',
          legacyMailchimpEvidence: 'ever_success',
        },
        createdAt: '2025-01-01T00:00:00Z',
        provenance: {
          sourceArtifactSha256: 'a'.repeat(64),
          sourceQuerySha256: 'b'.repeat(64),
          sourceRecordSha256: 'd'.repeat(64),
          sourceDatabase: 'u916712841_S5L96',
          sourceTables: [
            'wp_e_submissions',
            'wp_e_submissions_values',
            'wp_e_submissions_actions_log',
          ],
          mailchimpActions: [{ id: '100', status: 'success', createdAt: '2025-01-01T00:00:01Z' }],
        },
      },
    ],
  };
}

function sqlFor(importPlan = plan()): string {
  return transactionalNewsletterSql(importPlan, {
    projectRef: 'pacpdxvujkjvnaeeuute',
    sourceSha256: 'a'.repeat(64),
    planSha256: 'b'.repeat(64),
    before: { newsletterSubscriptions: 2, newsletterConsentEvents: 3 },
  });
}

describe('Elementor newsletter transactional SQL', () => {
  it('places all permanent inserts inside one rollback-on-error transaction', () => {
    const sql = sqlFor();
    expect(sql).toContain('\\set ON_ERROR_STOP on');
    expect(sql).toContain('BEGIN ISOLATION LEVEL SERIALIZABLE;');
    expect(sql.trim().endsWith('COMMIT;')).toBe(true);
    expect(sql).toContain(
      'LOCK TABLE public.newsletter_subscriptions, public.newsletter_consent_events',
    );
    expect(sql).toContain('Newsletter tables changed after the verified backup');
    expect(sql).toContain('Existing consent event conflicts with reviewed legacy provenance');
    expect(sql.indexOf('$mukhtalif_newsletter_conflict_guard$;')).toBeLessThan(
      sql.indexOf('INSERT INTO public.newsletter_subscriptions'),
    );
    expect(sql).toContain("O''Reilly");
  });

  it('is insert-only and preserves any subscription already resolved by email', () => {
    const sql = sqlFor();
    expect(sql).toContain(
      'COALESCE(actual_subscription.id, planned_subscription.id) AS subscription_id',
    );
    expect(sql).toContain('WHERE actual.email = planned.email');
    expect(sql).not.toMatch(/\bDELETE\b/i);
    expect(sql).not.toMatch(/\bUPDATE\s+public\.newsletter_/i);
    expect(sql).not.toContain('ON CONFLICT');
    expect(sql).not.toMatch(/https?:\/\/|mailchimp\.com/i);
  });

  it('performs exact cohort and total-count verification before commit', () => {
    const sql = sqlFor();
    expect(sql).toContain("'subscriptionsBefore', 2");
    expect(sql).toContain("'consentEventsBefore', 3");
    expect(sql).toContain("'subscriptionsVerified', 1");
    expect(sql).toContain("'consentEventsVerified', 1");
    expect(sql).toContain('Newsletter table post-import totals are not exact');
    expect(sql.indexOf('$mukhtalif_newsletter_post_verify$;')).toBeLessThan(
      sql.lastIndexOf('COMMIT;'),
    );
  });

  it('rejects unsafe literal data and invalid backup counts before SQL execution', () => {
    expect(() => sqlFor(plan({ firstName: 'unsafe\0name' }))).toThrow('PostgreSQL null byte');
    expect(() =>
      transactionalNewsletterSql(plan(), {
        projectRef: 'pacpdxvujkjvnaeeuute',
        sourceSha256: 'a'.repeat(64),
        planSha256: 'b'.repeat(64),
        before: { newsletterSubscriptions: -1, newsletterConsentEvents: 0 },
      }),
    ).toThrow('non-negative integer');
  });
});
