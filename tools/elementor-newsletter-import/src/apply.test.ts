import { describe, expect, it } from 'vitest';
import {
  assertNewsletterPlanApplied,
  computeNewsletterApplyDelta,
  type ExistingNewsletterData,
  type NewsletterConsentEventDatabaseRow,
  type NewsletterSubscriptionDatabaseRow,
} from './apply.ts';
import {
  APPROVED_SOURCE_QUERY,
  APPROVED_SOURCE_QUERY_SHA256,
  buildLegacyNewsletterPlan,
  parseLegacySourceSnapshot,
  type LegacyNewsletterImportPlan,
} from './core.ts';

function smallPlan(): LegacyNewsletterImportPlan {
  const snapshot = parseLegacySourceSnapshot({
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
    query: APPROVED_SOURCE_QUERY,
    rows: [
      {
        legacySubmissionId: '10',
        legacyFormId: '1678cc0a',
        email: 'first@example.test',
        firstName: 'First',
        submittedAt: '2025-01-01T10:00:00Z',
        mailchimpEvidence: 'ever_success',
        mailchimpActionEvidence: '100:success:2025-01-01T10:00:01Z',
      },
      {
        legacySubmissionId: '11',
        legacyFormId: '79f340c2',
        email: 'first@example.test',
        firstName: 'Latest',
        submittedAt: '2025-02-01T10:00:00Z',
        mailchimpEvidence: 'never_success',
        mailchimpActionEvidence: '101:failed:2025-02-01T10:00:01Z',
      },
      {
        legacySubmissionId: '12',
        legacyFormId: '1678cc0a',
        email: 'second@example.test',
        firstName: null,
        submittedAt: '2025-03-01T10:00:00Z',
        mailchimpEvidence: 'never_success',
        mailchimpActionEvidence: '102:failed:2025-03-01T10:00:01Z',
      },
    ],
  });
  return buildLegacyNewsletterPlan(snapshot, 'a'.repeat(64));
}

const empty: ExistingNewsletterData = { subscriptions: [], consentEvents: [] };

function applyDelta(
  existing: ExistingNewsletterData,
  delta: ReturnType<typeof computeNewsletterApplyDelta>,
): ExistingNewsletterData {
  return {
    subscriptions: [...existing.subscriptions, ...delta.subscriptions],
    consentEvents: [...existing.consentEvents, ...delta.consentEvents],
  };
}

describe('guarded Elementor newsletter apply reconciliation', () => {
  it('produces zero writes on an exact rerun', () => {
    const plan = smallPlan();
    const first = computeNewsletterApplyDelta(plan, empty);
    expect(first.counts).toMatchObject({
      subscriptionsToInsert: 2,
      consentEventsToInsert: 3,
      totalWrites: 5,
    });
    const after = applyDelta(empty, first);
    const rerun = computeNewsletterApplyDelta(plan, after);
    expect(rerun.subscriptions).toEqual([]);
    expect(rerun.consentEvents).toEqual([]);
    expect(rerun.counts).toMatchObject({
      preservedExistingSubscriptions: 2,
      matchedExistingConsentEvents: 3,
      totalWrites: 0,
    });
    expect(() => assertNewsletterPlanApplied(plan, after)).not.toThrow();
  });

  it('attaches legacy events while preserving real consent and provider state', () => {
    const plan = smallPlan();
    const planned = computeNewsletterApplyDelta(plan, empty);
    const firstPlannedSubscription = planned.subscriptions.find(
      (row) => row.email === 'first@example.test',
    )!;
    const existingSubscription: NewsletterSubscriptionDatabaseRow = {
      ...firstPlannedSubscription,
      id: 'nls-existing-real-contact',
      first_name: 'Real current name',
      sync_status: 'synced',
      sync_attempt_count: 4,
      sync_attempted_at: '2026-09-02T10:00:00Z',
      sync_error: null,
      latest_consent_event_id: 'nce-existing-explicit-event',
      updated_at: '2026-09-02T10:00:00Z',
    };
    const explicitEvent: NewsletterConsentEventDatabaseRow = {
      id: 'nce-existing-explicit-event',
      subscription_id: existingSubscription.id,
      request_id: '11111111-1111-4111-8111-111111111111',
      event_kind: 'explicit_consent',
      email: existingSubscription.email,
      first_name: existingSubscription.first_name,
      consent_version: 1,
      consent_accepted_at: '2026-09-02T09:59:59Z',
      source_metadata: {
        requestId: '11111111-1111-4111-8111-111111111111',
        formVersion: 1,
      },
      created_at: '2026-09-02T10:00:00Z',
    };
    const existing: ExistingNewsletterData = {
      subscriptions: [existingSubscription],
      consentEvents: [explicitEvent],
    };

    const delta = computeNewsletterApplyDelta(plan, existing);
    expect(delta.subscriptions).toHaveLength(1);
    expect(delta.subscriptions[0]?.email).toBe('second@example.test');
    expect(
      delta.consentEvents
        .filter((row) => row.email === existingSubscription.email)
        .every((row) => row.subscription_id === existingSubscription.id),
    ).toBe(true);
    expect(existing.subscriptions[0]).toEqual(existingSubscription);
    expect(existing.consentEvents[0]).toEqual(explicitEvent);

    const after = applyDelta(existing, delta);
    const rerun = computeNewsletterApplyDelta(plan, after);
    expect(rerun.counts.totalWrites).toBe(0);
    expect(after.subscriptions[0]).toEqual(existingSubscription);
    expect(after.consentEvents[0]).toEqual(explicitEvent);
  });

  it('fails on subscription ID and consent-event provenance conflicts', () => {
    const plan = smallPlan();
    const expected = computeNewsletterApplyDelta(plan, empty);
    const subscription = expected.subscriptions[0]!;
    expect(() =>
      computeNewsletterApplyDelta(plan, {
        subscriptions: [{ ...subscription, email: 'different@example.test' }],
        consentEvents: [],
      }),
    ).toThrow('subscription ID conflicts with a different email');

    const event = expected.consentEvents[0]!;
    expect(() =>
      computeNewsletterApplyDelta(plan, {
        subscriptions: expected.subscriptions,
        consentEvents: [{ ...event, first_name: 'Conflicting immutable evidence' }],
      }),
    ).toThrow('conflicts with reviewed legacy provenance');

    expect(() =>
      computeNewsletterApplyDelta(plan, {
        subscriptions: expected.subscriptions,
        consentEvents: [
          {
            ...event,
            id: 'nce-legacy_conflicting_identity',
            request_id: '22222222-2222-4222-8222-222222222222',
          },
        ],
      }),
    ).toThrow('conflicts with reviewed legacy provenance');
  });

  it('post-verification rejects any missing row', () => {
    const plan = smallPlan();
    const partial = computeNewsletterApplyDelta(plan, empty);
    const missingLastEvent = applyDelta(empty, {
      ...partial,
      consentEvents: partial.consentEvents.slice(0, -1),
    });
    expect(() => assertNewsletterPlanApplied(plan, missingLastEvent)).toThrow(
      'missing legacy newsletter rows',
    );
  });
});
