import type { LegacyNewsletterImportPlan } from './core.ts';

export interface NewsletterBackupRowCounts {
  newsletterSubscriptions: number;
  newsletterConsentEvents: number;
}

export interface NewsletterSqlContext {
  projectRef: string;
  sourceSha256: string;
  planSha256: string;
  before: NewsletterBackupRowCounts;
}

function sqlText(value: string): string {
  if (value.includes('\0')) throw new Error('Reviewed plan contains a PostgreSQL null byte');
  return `'${value.replaceAll("'", "''")}'`;
}

function nullableText(value: string | null): string {
  return value === null ? 'NULL' : sqlText(value);
}

function nullableTimestamp(value: string | null): string {
  return value === null ? 'NULL' : `${sqlText(value)}::timestamptz`;
}

function subscriptionValues(plan: LegacyNewsletterImportPlan): string {
  return plan.subscriptions
    .map((row) =>
      [
        sqlText(row.id),
        sqlText(row.email),
        nullableText(row.firstName),
        sqlText(row.syncStatus),
        String(row.syncAttemptCount),
        nullableTimestamp(row.syncAttemptedAt),
        nullableText(row.syncError),
        sqlText(row.latestConsentEventId),
        `${sqlText(row.createdAt)}::timestamptz`,
        `${sqlText(row.updatedAt)}::timestamptz`,
      ].join(', '),
    )
    .map((row) => `(${row})`)
    .join(',\n');
}

function consentEventValues(plan: LegacyNewsletterImportPlan): string {
  return plan.consentEvents
    .map((row) =>
      [
        sqlText(row.id),
        sqlText(row.subscriptionId),
        `${sqlText(row.requestId)}::uuid`,
        sqlText(row.eventKind),
        sqlText(row.email),
        nullableText(row.firstName),
        row.consentVersion === null ? 'NULL' : String(row.consentVersion),
        nullableTimestamp(row.consentAcceptedAt),
        `${sqlText(JSON.stringify(row.sourceMetadata))}::jsonb`,
        `${sqlText(row.createdAt)}::timestamptz`,
        sqlText(row.sourceMetadata.legacyFormId),
        sqlText(row.sourceMetadata.legacySubmissionId),
      ].join(', '),
    )
    .map((row) => `(${row})`)
    .join(',\n');
}

function exactEventPredicate(actual: string, expected: string): string {
  return `${actual}.id = ${expected}.id
      AND ${actual}.subscription_id = ${expected}.subscription_id
      AND ${actual}.request_id = ${expected}.request_id
      AND ${actual}.event_kind = ${expected}.event_kind
      AND ${actual}.email = ${expected}.email
      AND ${actual}.first_name IS NOT DISTINCT FROM ${expected}.first_name
      AND ${actual}.consent_version IS NOT DISTINCT FROM ${expected}.consent_version
      AND ${actual}.consent_accepted_at IS NOT DISTINCT FROM ${expected}.consent_accepted_at
      AND ${actual}.source_metadata = ${expected}.source_metadata
      AND ${actual}.created_at = ${expected}.created_at`;
}

export function transactionalNewsletterSql(
  plan: LegacyNewsletterImportPlan,
  context: NewsletterSqlContext,
): string {
  if (
    !Number.isSafeInteger(context.before.newsletterSubscriptions) ||
    context.before.newsletterSubscriptions < 0
  ) {
    throw new Error('Backup subscription count must be a non-negative integer');
  }
  if (
    !Number.isSafeInteger(context.before.newsletterConsentEvents) ||
    context.before.newsletterConsentEvents < 0
  ) {
    throw new Error('Backup consent-event count must be a non-negative integer');
  }
  const plannedSubscriptions = plan.subscriptions.length;
  const plannedConsentEvents = plan.consentEvents.length;
  const exactExistingEvent = exactEventPredicate('actual', 'expected');
  const exactVerifiedEvent = exactEventPredicate('actual', 'expected');
  return `\\set ON_ERROR_STOP on
BEGIN ISOLATION LEVEL SERIALIZABLE;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';
SET LOCAL standard_conforming_strings = on;
SET LOCAL row_security = off;
SET LOCAL search_path = pg_catalog, public, pg_temp;
SELECT pg_advisory_xact_lock(hashtextextended('mukhtalif:elementor-newsletter-import:v1', 0));
LOCK TABLE public.newsletter_subscriptions, public.newsletter_consent_events
  IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE mukhtalif_planned_newsletter_subscriptions (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  first_name text,
  sync_status text NOT NULL,
  sync_attempt_count integer NOT NULL,
  sync_attempted_at timestamptz,
  sync_error text,
  latest_consent_event_id text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE mukhtalif_planned_newsletter_events (
  id text PRIMARY KEY,
  planned_subscription_id text NOT NULL,
  request_id uuid NOT NULL UNIQUE,
  event_kind text NOT NULL,
  email text NOT NULL,
  first_name text,
  consent_version smallint,
  consent_accepted_at timestamptz,
  source_metadata jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  legacy_form_id text NOT NULL,
  legacy_submission_id text NOT NULL,
  UNIQUE (legacy_form_id, legacy_submission_id)
) ON COMMIT DROP;

INSERT INTO pg_temp.mukhtalif_planned_newsletter_subscriptions (
  id, email, first_name, sync_status, sync_attempt_count, sync_attempted_at,
  sync_error, latest_consent_event_id, created_at, updated_at
) VALUES
${subscriptionValues(plan)};

INSERT INTO pg_temp.mukhtalif_planned_newsletter_events (
  id, planned_subscription_id, request_id, event_kind, email, first_name,
  consent_version, consent_accepted_at, source_metadata, created_at,
  legacy_form_id, legacy_submission_id
) VALUES
${consentEventValues(plan)};

DO $mukhtalif_newsletter_preflight$
DECLARE
  actual_subscription_count bigint;
  actual_event_count bigint;
BEGIN
  SELECT count(*) INTO actual_subscription_count FROM public.newsletter_subscriptions;
  SELECT count(*) INTO actual_event_count FROM public.newsletter_consent_events;
  IF actual_subscription_count <> ${context.before.newsletterSubscriptions}
     OR actual_event_count <> ${context.before.newsletterConsentEvents} THEN
    RAISE EXCEPTION 'Newsletter tables changed after the verified backup';
  END IF;
  IF (SELECT count(*) FROM pg_temp.mukhtalif_planned_newsletter_subscriptions) <> ${plannedSubscriptions}
     OR (SELECT count(*) FROM pg_temp.mukhtalif_planned_newsletter_events) <> ${plannedConsentEvents} THEN
    RAISE EXCEPTION 'Reviewed newsletter plan staging count mismatch';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_temp.mukhtalif_planned_newsletter_events AS event
    JOIN pg_temp.mukhtalif_planned_newsletter_subscriptions AS subscription
      ON subscription.id = event.planned_subscription_id
    WHERE subscription.email <> event.email
  ) OR (
    SELECT count(*)
    FROM pg_temp.mukhtalif_planned_newsletter_events AS event
    JOIN pg_temp.mukhtalif_planned_newsletter_subscriptions AS subscription
      ON subscription.id = event.planned_subscription_id
  ) <> ${plannedConsentEvents} THEN
    RAISE EXCEPTION 'Reviewed newsletter plan relation mismatch';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_temp.mukhtalif_planned_newsletter_subscriptions AS planned
    JOIN public.newsletter_subscriptions AS actual ON actual.id = planned.id
    WHERE actual.email <> planned.email
  ) THEN
    RAISE EXCEPTION 'Legacy subscription ID conflicts with a different contact';
  END IF;
END
$mukhtalif_newsletter_preflight$;

CREATE TEMP TABLE mukhtalif_target_newsletter_events ON COMMIT DROP AS
SELECT
  event.id,
  COALESCE(actual_subscription.id, planned_subscription.id) AS subscription_id,
  event.request_id,
  event.event_kind,
  event.email,
  event.first_name,
  event.consent_version,
  event.consent_accepted_at,
  event.source_metadata,
  event.created_at,
  event.legacy_form_id,
  event.legacy_submission_id
FROM pg_temp.mukhtalif_planned_newsletter_events AS event
JOIN pg_temp.mukhtalif_planned_newsletter_subscriptions AS planned_subscription
  ON planned_subscription.id = event.planned_subscription_id
LEFT JOIN public.newsletter_subscriptions AS actual_subscription
  ON actual_subscription.email = planned_subscription.email;

DO $mukhtalif_newsletter_conflict_guard$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_temp.mukhtalif_target_newsletter_events AS expected
    JOIN public.newsletter_consent_events AS actual
      ON actual.id = expected.id
      OR actual.request_id = expected.request_id
      OR (
        actual.event_kind = 'legacy_request'
        AND actual.source_metadata ->> 'legacySource' = 'wordpress_elementor'
        AND actual.source_metadata ->> 'legacyFormId' = expected.legacy_form_id
        AND actual.source_metadata ->> 'legacySubmissionId' = expected.legacy_submission_id
      )
    WHERE NOT (${exactExistingEvent})
  ) THEN
    RAISE EXCEPTION 'Existing consent event conflicts with reviewed legacy provenance';
  END IF;
END
$mukhtalif_newsletter_conflict_guard$;

CREATE TEMP TABLE mukhtalif_newsletter_subscription_insert_result ON COMMIT DROP AS
WITH inserted AS (
  INSERT INTO public.newsletter_subscriptions (
    id, email, first_name, sync_status, sync_attempt_count, sync_attempted_at,
    sync_error, latest_consent_event_id, created_at, updated_at
  )
  SELECT
    planned.id, planned.email, planned.first_name, planned.sync_status,
    planned.sync_attempt_count, planned.sync_attempted_at, planned.sync_error,
    planned.latest_consent_event_id, planned.created_at, planned.updated_at
  FROM pg_temp.mukhtalif_planned_newsletter_subscriptions AS planned
  WHERE NOT EXISTS (
    SELECT 1 FROM public.newsletter_subscriptions AS actual
    WHERE actual.email = planned.email
  )
  ORDER BY planned.id
  RETURNING id
)
SELECT count(*)::integer AS inserted FROM inserted;

CREATE TEMP TABLE mukhtalif_newsletter_event_insert_result ON COMMIT DROP AS
WITH inserted AS (
  INSERT INTO public.newsletter_consent_events (
    id, subscription_id, request_id, event_kind, email, first_name,
    consent_version, consent_accepted_at, source_metadata, created_at
  )
  SELECT
    expected.id, expected.subscription_id, expected.request_id,
    expected.event_kind, expected.email, expected.first_name,
    expected.consent_version, expected.consent_accepted_at,
    expected.source_metadata, expected.created_at
  FROM pg_temp.mukhtalif_target_newsletter_events AS expected
  WHERE NOT EXISTS (
    SELECT 1 FROM public.newsletter_consent_events AS actual
    WHERE actual.id = expected.id
  )
  ORDER BY expected.id
  RETURNING id
)
SELECT count(*)::integer AS inserted FROM inserted;

DO $mukhtalif_newsletter_post_verify$
DECLARE
  inserted_subscription_count integer;
  inserted_event_count integer;
  verified_subscription_count bigint;
  verified_event_count bigint;
BEGIN
  SELECT inserted INTO STRICT inserted_subscription_count
  FROM pg_temp.mukhtalif_newsletter_subscription_insert_result;
  SELECT inserted INTO STRICT inserted_event_count
  FROM pg_temp.mukhtalif_newsletter_event_insert_result;
  IF (SELECT count(*) FROM public.newsletter_subscriptions)
       <> ${context.before.newsletterSubscriptions} + inserted_subscription_count
     OR (SELECT count(*) FROM public.newsletter_consent_events)
       <> ${context.before.newsletterConsentEvents} + inserted_event_count THEN
    RAISE EXCEPTION 'Newsletter table post-import totals are not exact';
  END IF;
  SELECT count(*) INTO verified_subscription_count
  FROM pg_temp.mukhtalif_planned_newsletter_subscriptions AS planned
  JOIN public.newsletter_subscriptions AS actual ON actual.email = planned.email;
  IF verified_subscription_count <> ${plannedSubscriptions} THEN
    RAISE EXCEPTION 'Newsletter subscription post-import cohort is incomplete';
  END IF;
  SELECT count(*) INTO verified_event_count
  FROM pg_temp.mukhtalif_target_newsletter_events AS expected
  JOIN public.newsletter_consent_events AS actual ON ${exactVerifiedEvent};
  IF verified_event_count <> ${plannedConsentEvents} THEN
    RAISE EXCEPTION 'Newsletter consent-event post-import cohort is incomplete';
  END IF;
END
$mukhtalif_newsletter_post_verify$;

SELECT 'MUKHTALIF_NEWSLETTER_IMPORT_RESULT=' || jsonb_build_object(
  'schemaVersion', 1,
  'projectRef', ${sqlText(context.projectRef)},
  'sourceSha256', ${sqlText(context.sourceSha256)},
  'planSha256', ${sqlText(context.planSha256)},
  'subscriptionsBefore', ${context.before.newsletterSubscriptions},
  'consentEventsBefore', ${context.before.newsletterConsentEvents},
  'subscriptionsInserted', subscription_result.inserted,
  'consentEventsInserted', event_result.inserted,
  'subscriptionsVerified', ${plannedSubscriptions},
  'consentEventsVerified', ${plannedConsentEvents},
  'subscriptionsAfter', ${context.before.newsletterSubscriptions} + subscription_result.inserted,
  'consentEventsAfter', ${context.before.newsletterConsentEvents} + event_result.inserted
)::text
FROM pg_temp.mukhtalif_newsletter_subscription_insert_result AS subscription_result
CROSS JOIN pg_temp.mukhtalif_newsletter_event_insert_result AS event_result;
COMMIT;
`;
}
