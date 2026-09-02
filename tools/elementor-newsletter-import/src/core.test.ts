import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  APPROVED_SOURCE_QUERY,
  APPROVED_SOURCE_QUERY_SHA256,
  assertExpectedLegacyCohort,
  buildLegacyNewsletterPlan,
  parseLegacySourceSnapshot,
} from './core.ts';

const query = APPROVED_SOURCE_QUERY;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function sourceValue(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    source: 'hostinger_phpmyadmin_select_only',
    sourceDatabase: 'u916712841_S5L96',
    sourceTables: ['wp_e_submissions', 'wp_e_submissions_values', 'wp_e_submissions_actions_log'],
    formDefinitionsEvidence: {
      source: 'wordpress_wxr___elementor_forms_snapshot',
      formIds: ['1678cc0a', '79f340c2'],
      emailFieldKey: 'email',
      firstNameFieldKey: 'field_5f9a09d',
    },
    capturedAt: '2026-09-02T18:00:00.000Z',
    querySha256: APPROVED_SOURCE_QUERY_SHA256,
    query,
    rows: [
      {
        legacySubmissionId: '10',
        legacyFormId: '1678cc0a',
        email: ' first@example.com ',
        firstName: 'Old Name',
        submittedAt: '2025-01-01T10:00:00Z',
        mailchimpEvidence: 'ever_success',
        mailchimpActionEvidence: '100:success:2025-01-01T10:00:01Z',
      },
      {
        legacySubmissionId: '11',
        legacyFormId: '79f340c2',
        email: 'FIRST@example.com',
        firstName: 'Latest Name',
        submittedAt: '2025-02-01T10:00:00Z',
        mailchimpEvidence: 'never_success',
        mailchimpActionEvidence: '101:failed:2025-02-01T10:00:01Z',
      },
      {
        legacySubmissionId: '12',
        legacyFormId: '1678cc0a',
        email: 'second@example.com',
        firstName: null,
        submittedAt: '2025-03-01T10:00:00Z',
        mailchimpEvidence: 'never_success',
        mailchimpActionEvidence: '102:failed:2025-03-01T10:00:01Z',
      },
      {
        legacySubmissionId: '13',
        legacyFormId: '79f340c2',
        email: 'third@example.com',
        firstName: 'Third',
        submittedAt: '2025-04-01T10:00:00Z',
        mailchimpEvidence: 'ever_success',
        mailchimpActionEvidence: '103:success:2025-04-01T10:00:01Z',
      },
    ],
  };
}

describe('Elementor newsletter legacy plan', () => {
  it('deduplicates contacts while retaining every legacy request event', () => {
    const snapshot = parseLegacySourceSnapshot(sourceValue());
    const plan = buildLegacyNewsletterPlan(snapshot, 'a'.repeat(64));

    expect(plan.counts).toMatchObject({
      sourceSubmissions: 4,
      plannedConsentEvents: 4,
      canonicalContacts: 3,
      canonicalEverSuccess: 2,
      canonicalNeverSuccess: 1,
      contactsWithMixedEvidence: 1,
    });
    const first = plan.subscriptions.find(
      (subscription) => subscription.email === 'first@example.com',
    );
    expect(first).toMatchObject({
      firstName: 'Latest Name',
      syncStatus: 'legacy_unverified',
      syncAttemptCount: 0,
      syncAttemptedAt: null,
      syncError: null,
      evidence: 'ever_success',
    });
    expect(first?.provenance.legacySubmissionIds).toEqual(['10', '11']);
  });

  it('never turns legacy evidence into explicit consent or current provider status', () => {
    const plan = buildLegacyNewsletterPlan(
      parseLegacySourceSnapshot(sourceValue()),
      'b'.repeat(64),
    );
    expect(plan.policy).toEqual({
      createsExplicitConsent: false,
      claimsCurrentProviderStatus: false,
      resubscribesContacts: false,
      sendsEmail: false,
      contactsMailchimp: false,
      deletesSourceData: false,
    });
    expect(
      plan.consentEvents.every(
        (event) =>
          event.eventKind === 'legacy_request' &&
          event.consentVersion === null &&
          event.consentAcceptedAt === null,
      ),
    ).toBe(true);
    const never = plan.subscriptions.find(
      (subscription) => subscription.email === 'second@example.com',
    );
    expect(never).toMatchObject({
      syncStatus: 'failed',
      syncError: 'LEGACY_MAILCHIMP_NEVER_SYNCED',
    });
  });

  it('is deterministic even when source row order changes', () => {
    const firstSource = sourceValue();
    const secondSource = sourceValue();
    (secondSource.rows as unknown[]).reverse();
    const first = buildLegacyNewsletterPlan(parseLegacySourceSnapshot(firstSource), 'c'.repeat(64));
    const second = buildLegacyNewsletterPlan(
      parseLegacySourceSnapshot(secondSource),
      'c'.repeat(64),
    );
    expect(second).toEqual(first);
    expect(first.consentEvents[0]?.requestId).toMatch(
      /^[a-f\d]{8}-[a-f\d]{4}-5[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/,
    );
  });

  it('rejects unapproved form ids and inconsistent action evidence', () => {
    const badForm = sourceValue();
    (badForm.rows as Array<Record<string, unknown>>)[0]!.legacyFormId = 'other-form';
    expect(() => parseLegacySourceSnapshot(badForm)).toThrow('unapproved Elementor form id');

    const inconsistent = sourceValue();
    (inconsistent.rows as Array<Record<string, unknown>>)[0]!.mailchimpActionEvidence =
      '100:failed:2025-01-01T10:00:01Z';
    expect(() => parseLegacySourceSnapshot(inconsistent)).toThrow(
      'Mailchimp status conflicts with its action provenance',
    );
  });

  it('rejects a self-declared replacement query and duplicate submissions', () => {
    const unsafe = sourceValue();
    unsafe.query = 'DELETE FROM wp_e_submissions;';
    unsafe.querySha256 = sha256(unsafe.query as string);
    expect(() => parseLegacySourceSnapshot(unsafe)).toThrow('source query checksum does not match');

    const padded = sourceValue();
    padded.query = `${APPROVED_SOURCE_QUERY}\n`;
    expect(() => parseLegacySourceSnapshot(padded)).toThrow('source query checksum does not match');

    const duplicate = sourceValue();
    (duplicate.rows as unknown[]).push(structuredClone((duplicate.rows as unknown[])[0]));
    expect(() => parseLegacySourceSnapshot(duplicate)).toThrow('appears more than once');
  });

  it('keeps the reviewed production cohort gate fail-closed', () => {
    const plan = buildLegacyNewsletterPlan(
      parseLegacySourceSnapshot(sourceValue()),
      'd'.repeat(64),
    );
    expect(() => assertExpectedLegacyCohort(plan)).toThrow(
      '692 submissions / 389 ever-success / 47 never-success',
    );
  });
});
