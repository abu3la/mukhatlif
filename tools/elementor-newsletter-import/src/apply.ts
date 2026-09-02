import type {
  LegacyNewsletterImportPlan,
  PlannedLegacyConsentEvent,
  PlannedLegacySubscription,
} from './core.ts';

export type NewsletterSyncStatus =
  'pending' | 'synced' | 'failed' | 'unconfigured' | 'legacy_unverified';

export interface NewsletterSubscriptionDatabaseRow {
  id: string;
  email: string;
  first_name: string | null;
  sync_status: NewsletterSyncStatus;
  sync_attempt_count: number;
  sync_attempted_at: string | null;
  sync_error: string | null;
  latest_consent_event_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewsletterConsentEventDatabaseRow {
  id: string;
  subscription_id: string;
  request_id: string;
  event_kind: 'explicit_consent' | 'legacy_request';
  email: string;
  first_name: string | null;
  consent_version: number | null;
  consent_accepted_at: string | null;
  source_metadata: Record<string, unknown>;
  created_at: string;
}

export interface ExistingNewsletterData {
  subscriptions: NewsletterSubscriptionDatabaseRow[];
  consentEvents: NewsletterConsentEventDatabaseRow[];
}

export interface NewsletterApplyDelta {
  subscriptions: NewsletterSubscriptionDatabaseRow[];
  consentEvents: NewsletterConsentEventDatabaseRow[];
  counts: {
    plannedSubscriptions: number;
    plannedConsentEvents: number;
    preservedExistingSubscriptions: number;
    matchedExistingConsentEvents: number;
    subscriptionsToInsert: number;
    consentEventsToInsert: number;
    totalWrites: number;
  };
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const source = value as Record<string, unknown>;
  return `{${Object.keys(source)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(source[key])}`)
    .join(',')}}`;
}

function uniqueMap<T>(rows: T[], key: (row: T) => string, label: string): Map<string, T> {
  const result = new Map<string, T>();
  for (const row of rows) {
    const value = key(row);
    if (result.has(value)) throw new Error(`Existing database repeats ${label}`);
    result.set(value, row);
  }
  return result;
}

function plannedSubscriptionRow(
  subscription: PlannedLegacySubscription,
): NewsletterSubscriptionDatabaseRow {
  return {
    id: subscription.id,
    email: subscription.email,
    first_name: subscription.firstName,
    sync_status: subscription.syncStatus,
    sync_attempt_count: subscription.syncAttemptCount,
    sync_attempted_at: subscription.syncAttemptedAt,
    sync_error: subscription.syncError,
    latest_consent_event_id: subscription.latestConsentEventId,
    created_at: subscription.createdAt,
    updated_at: subscription.updatedAt,
  };
}

function plannedConsentEventRow(
  event: PlannedLegacyConsentEvent,
  subscriptionId: string,
): NewsletterConsentEventDatabaseRow {
  return {
    id: event.id,
    subscription_id: subscriptionId,
    request_id: event.requestId,
    event_kind: event.eventKind,
    email: event.email,
    first_name: event.firstName,
    consent_version: event.consentVersion,
    consent_accepted_at: event.consentAcceptedAt,
    source_metadata: event.sourceMetadata,
    created_at: event.createdAt,
  };
}

function legacyIdentity(row: NewsletterConsentEventDatabaseRow): string | null {
  if (row.event_kind !== 'legacy_request') return null;
  const source = row.source_metadata;
  if (
    source.legacySource !== 'wordpress_elementor' ||
    typeof source.legacyFormId !== 'string' ||
    typeof source.legacySubmissionId !== 'string'
  ) {
    return null;
  }
  return `${source.legacySource}\0${source.legacyFormId}\0${source.legacySubmissionId}`;
}

function sameConsentEvent(
  actual: NewsletterConsentEventDatabaseRow,
  expected: NewsletterConsentEventDatabaseRow,
): boolean {
  return (
    actual.id === expected.id &&
    actual.subscription_id === expected.subscription_id &&
    actual.request_id === expected.request_id &&
    actual.event_kind === expected.event_kind &&
    actual.email === expected.email &&
    actual.first_name === expected.first_name &&
    actual.consent_version === expected.consent_version &&
    actual.consent_accepted_at === expected.consent_accepted_at &&
    canonicalJson(actual.source_metadata) === canonicalJson(expected.source_metadata) &&
    actual.created_at === expected.created_at
  );
}

function assertPlanRelations(plan: LegacyNewsletterImportPlan): void {
  const subscriptionsById = uniqueMap(
    plan.subscriptions,
    (row) => row.id,
    'planned subscription ID',
  );
  uniqueMap(plan.subscriptions, (row) => row.email, 'planned subscription email');
  uniqueMap(plan.consentEvents, (row) => row.id, 'planned consent-event ID');
  uniqueMap(plan.consentEvents, (row) => row.requestId, 'planned request ID');
  for (const event of plan.consentEvents) {
    const subscription = subscriptionsById.get(event.subscriptionId);
    if (!subscription || subscription.email !== event.email) {
      throw new Error('Plan contains a consent event with an invalid subscription relation');
    }
  }
  for (const subscription of plan.subscriptions) {
    const latest = plan.consentEvents.find(
      (event) => event.id === subscription.latestConsentEventId,
    );
    if (!latest || latest.subscriptionId !== subscription.id) {
      throw new Error('Plan contains an invalid latest legacy event relation');
    }
  }
}

export function computeNewsletterApplyDelta(
  plan: LegacyNewsletterImportPlan,
  existing: ExistingNewsletterData,
): NewsletterApplyDelta {
  assertPlanRelations(plan);
  const existingSubscriptionsById = uniqueMap(
    existing.subscriptions,
    (row) => row.id,
    'subscription ID',
  );
  const existingSubscriptionsByEmail = uniqueMap(
    existing.subscriptions,
    (row) => row.email,
    'subscription email',
  );
  const existingEventsById = uniqueMap(existing.consentEvents, (row) => row.id, 'consent-event ID');
  const existingEventsByRequestId = uniqueMap(
    existing.consentEvents,
    (row) => row.request_id,
    'consent-event request ID',
  );
  const plannedLegacyIdentities = new Set(
    plan.consentEvents.map((event) =>
      legacyIdentity(plannedConsentEventRow(event, event.subscriptionId)),
    ),
  );
  const existingEventsByLegacyIdentity = new Map<string, NewsletterConsentEventDatabaseRow>();
  for (const event of existing.consentEvents) {
    const identity = legacyIdentity(event);
    if (!identity || !plannedLegacyIdentities.has(identity)) continue;
    if (existingEventsByLegacyIdentity.has(identity)) {
      throw new Error('Existing database repeats a planned legacy event identity');
    }
    existingEventsByLegacyIdentity.set(identity, event);
  }

  const subscriptions: NewsletterSubscriptionDatabaseRow[] = [];
  const resolvedSubscriptionIds = new Map<string, string>();
  let preservedExistingSubscriptions = 0;
  for (const planned of plan.subscriptions) {
    const idCollision = existingSubscriptionsById.get(planned.id);
    if (idCollision && idCollision.email !== planned.email) {
      throw new Error('Planned legacy subscription ID conflicts with a different email');
    }
    const existingByEmail = existingSubscriptionsByEmail.get(planned.email);
    if (existingByEmail) {
      resolvedSubscriptionIds.set(planned.email, existingByEmail.id);
      preservedExistingSubscriptions += 1;
      continue;
    }
    const row = plannedSubscriptionRow(planned);
    resolvedSubscriptionIds.set(planned.email, row.id);
    subscriptions.push(row);
  }

  const consentEvents: NewsletterConsentEventDatabaseRow[] = [];
  let matchedExistingConsentEvents = 0;
  for (const planned of plan.consentEvents) {
    const resolvedSubscriptionId = resolvedSubscriptionIds.get(planned.email);
    if (!resolvedSubscriptionId) {
      throw new Error('Plan contains an event without a resolved subscription');
    }
    const expected = plannedConsentEventRow(planned, resolvedSubscriptionId);
    const byId = existingEventsById.get(expected.id);
    const byRequestId = existingEventsByRequestId.get(expected.request_id);
    const identity = legacyIdentity(expected);
    const byLegacyIdentity = identity ? existingEventsByLegacyIdentity.get(identity) : undefined;
    if (!byId && !byRequestId && !byLegacyIdentity) {
      consentEvents.push(expected);
      continue;
    }
    if (
      !byId ||
      !byRequestId ||
      !byLegacyIdentity ||
      byId !== byRequestId ||
      byId !== byLegacyIdentity ||
      !sameConsentEvent(byId, expected)
    ) {
      throw new Error('Existing consent event conflicts with reviewed legacy provenance');
    }
    matchedExistingConsentEvents += 1;
  }

  return {
    subscriptions,
    consentEvents,
    counts: {
      plannedSubscriptions: plan.subscriptions.length,
      plannedConsentEvents: plan.consentEvents.length,
      preservedExistingSubscriptions,
      matchedExistingConsentEvents,
      subscriptionsToInsert: subscriptions.length,
      consentEventsToInsert: consentEvents.length,
      totalWrites: subscriptions.length + consentEvents.length,
    },
  };
}

export function assertNewsletterPlanApplied(
  plan: LegacyNewsletterImportPlan,
  after: ExistingNewsletterData,
): NewsletterApplyDelta['counts'] {
  const delta = computeNewsletterApplyDelta(plan, after);
  if (delta.counts.totalWrites !== 0) {
    throw new Error('Post-apply verification found missing legacy newsletter rows');
  }
  if (
    delta.counts.preservedExistingSubscriptions !== plan.subscriptions.length ||
    delta.counts.matchedExistingConsentEvents !== plan.consentEvents.length
  ) {
    throw new Error('Post-apply verification counts do not match the reviewed plan');
  }
  return delta.counts;
}
