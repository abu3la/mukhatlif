import { createHash } from 'node:crypto';

export const LEGACY_SOURCE_DATABASE = 'u916712841_S5L96';
export const LEGACY_FORM_IDS = ['1678cc0a', '79f340c2'] as const;
export const EXPECTED_CANONICAL_EVER_SUCCESS = 389;
export const EXPECTED_CANONICAL_NEVER_SUCCESS = 47;
export const EXPECTED_SOURCE_SUBMISSIONS = 692;
export const APPROVED_SOURCE_QUERY_SHA256 =
  '91f9070730633b4b994eae2b81ba7e48bd9557a5e01c43b7a779b0915fa7dbf8';
export const APPROVED_SOURCE_QUERY = `SELECT
  CAST(s.id AS CHAR) AS legacy_submission_id,
  s.element_id AS legacy_form_id,
  LOWER(TRIM(MAX(CASE WHEN v.key = 'email' THEN v.value END))) AS email,
  NULLIF(TRIM(MAX(CASE WHEN v.key = 'field_5f9a09d' THEN v.value END)), '') AS first_name,
  DATE_FORMAT(s.created_at_gmt, '%Y-%m-%dT%H:%i:%sZ') AS submitted_at,
  CASE
    WHEN MAX(CASE WHEN a.action_name = 'mailchimp' AND a.status = 'success' THEN 1 ELSE 0 END) = 1
      THEN 'ever_success'
    ELSE 'never_success'
  END AS mailchimp_evidence,
  COALESCE(
    GROUP_CONCAT(
      DISTINCT CASE
        WHEN a.action_name = 'mailchimp'
          THEN CONCAT(
            CAST(a.id AS CHAR), ':', a.status, ':',
            DATE_FORMAT(a.created_at_gmt, '%Y-%m-%dT%H:%i:%sZ')
          )
      END
      ORDER BY a.id SEPARATOR '|'
    ),
    ''
  ) AS mailchimp_action_evidence
FROM wp_e_submissions s
LEFT JOIN wp_e_submissions_values v ON v.submission_id = s.id
LEFT JOIN wp_e_submissions_actions_log a ON a.submission_id = s.id
WHERE s.element_id IN ('1678cc0a', '79f340c2')
GROUP BY s.id, s.element_id, s.created_at_gmt
ORDER BY CAST(s.id AS UNSIGNED);`;

const LEGACY_SOURCE_TABLES = [
  'wp_e_submissions',
  'wp_e_submissions_values',
  'wp_e_submissions_actions_log',
] as const;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SHA256_PATTERN = /^[a-f\d]{64}$/;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

export type LegacyMailchimpEvidence = 'ever_success' | 'never_success';
export type LegacyFormId = (typeof LEGACY_FORM_IDS)[number];

export interface LegacySourceRow {
  legacySubmissionId: string;
  legacyFormId: LegacyFormId;
  email: string;
  firstName: string | null;
  submittedAt: string;
  mailchimpEvidence: LegacyMailchimpEvidence;
  mailchimpActionEvidence: string;
}

export interface LegacySourceSnapshot {
  schemaVersion: 1;
  source: 'hostinger_phpmyadmin_select_only';
  sourceDatabase: typeof LEGACY_SOURCE_DATABASE;
  sourceTables: [...typeof LEGACY_SOURCE_TABLES];
  formDefinitionsEvidence: {
    source: 'wordpress_wxr___elementor_forms_snapshot';
    formIds: [...typeof LEGACY_FORM_IDS];
    emailFieldKey: 'email';
    firstNameFieldKey: 'field_5f9a09d';
  };
  capturedAt: string;
  querySha256: string;
  query: string;
  rows: LegacySourceRow[];
}

interface LegacyActionEvidence {
  id: string;
  status: 'success' | 'failed';
  createdAt: string;
}

export interface PlannedLegacySubscription {
  id: string;
  email: string;
  firstName: string | null;
  syncStatus: 'legacy_unverified' | 'failed';
  syncAttemptCount: 0;
  syncAttemptedAt: null;
  syncError: null | 'LEGACY_MAILCHIMP_NEVER_SYNCED';
  latestConsentEventId: string;
  createdAt: string;
  updatedAt: string;
  evidence: LegacyMailchimpEvidence;
  provenance: {
    contactKeySha256: string;
    legacySubmissionIds: string[];
    sourceRecordSha256s: string[];
  };
}

export interface PlannedLegacyConsentEvent {
  id: string;
  subscriptionId: string;
  requestId: string;
  eventKind: 'legacy_request';
  email: string;
  firstName: string | null;
  consentVersion: null;
  consentAcceptedAt: null;
  sourceMetadata: {
    requestId: string;
    formVersion: 1;
    legacySource: 'wordpress_elementor';
    legacySourceVersion: 1;
    legacyFormId: LegacyFormId;
    legacySubmissionId: string;
    legacyMailchimpEvidence: LegacyMailchimpEvidence;
  };
  createdAt: string;
  provenance: {
    sourceArtifactSha256: string;
    sourceQuerySha256: string;
    sourceRecordSha256: string;
    sourceDatabase: typeof LEGACY_SOURCE_DATABASE;
    sourceTables: [...typeof LEGACY_SOURCE_TABLES];
    mailchimpActions: LegacyActionEvidence[];
  };
}

export interface LegacyNewsletterImportPlan {
  schemaVersion: 1;
  mode: 'dry-run';
  writesPerformed: false;
  source: {
    kind: 'hostinger_phpmyadmin_select_only';
    database: typeof LEGACY_SOURCE_DATABASE;
    tables: [...typeof LEGACY_SOURCE_TABLES];
    capturedAt: string;
    artifactSha256: string;
    querySha256: string;
  };
  target: {
    migration: '0021_newsletter_subscriptions.sql';
    tables: ['newsletter_subscriptions', 'newsletter_consent_events'];
  };
  policy: {
    createsExplicitConsent: false;
    claimsCurrentProviderStatus: false;
    resubscribesContacts: false;
    sendsEmail: false;
    contactsMailchimp: false;
    deletesSourceData: false;
  };
  counts: {
    sourceSubmissions: number;
    plannedConsentEvents: number;
    canonicalContacts: number;
    canonicalEverSuccess: number;
    canonicalNeverSuccess: number;
    submissionEverSuccess: number;
    submissionNeverSuccess: number;
    repeatedSubmissionEvents: number;
    contactsWithMultipleSubmissions: number;
    contactsWithMixedEvidence: number;
    contactsWithFirstName: number;
    byForm: Record<LegacyFormId, number>;
  };
  subscriptions: PlannedLegacySubscription[];
  consentEvents: PlannedLegacyConsentEvent[];
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} does not match the approved schema`);
  }
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a string`);
  return value.trim();
}

function hasUnsupportedControl(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (
      code <= 8 ||
      code === 11 ||
      code === 12 ||
      (code >= 14 && code <= 31) ||
      (code >= 127 && code <= 159)
    ) {
      return true;
    }
  }
  return false;
}

function normalizeEmail(value: unknown, rowNumber: number): string {
  const email = requiredString(value, `row ${rowNumber} email`).toLowerCase();
  if (email.length > 254 || hasUnsupportedControl(email) || !EMAIL_PATTERN.test(email)) {
    throw new Error(`row ${rowNumber} has an invalid email`);
  }
  return email;
}

function nullableFirstName(value: unknown, rowNumber: number): string | null {
  if (value === null) return null;
  const firstName = requiredString(value, `row ${rowNumber} firstName`);
  if (firstName.length > 160 || hasUnsupportedControl(firstName)) {
    throw new Error(`row ${rowNumber} has an invalid first name`);
  }
  return firstName;
}

function canonicalTimestamp(value: unknown, label: string): string {
  const timestamp = requiredString(value, label);
  if (!TIMESTAMP_PATTERN.test(timestamp) || Number.isNaN(Date.parse(timestamp))) {
    throw new Error(`${label} must be a UTC timestamp without fractional seconds`);
  }
  return timestamp;
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareNumericStrings(left: string, right: string): number {
  const leftValue = BigInt(left);
  const rightValue = BigInt(right);
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function deterministicUuid(value: string): string {
  const bytes = createHash('sha256').update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function subscriptionId(email: string): string {
  return `nls-legacy_${sha256(`wordpress_elementor:${email}`).slice(0, 32)}`;
}

function eventIdentity(formId: LegacyFormId, submissionId: string): string {
  return `wordpress_elementor:v1:${formId}:${submissionId}`;
}

function eventId(formId: LegacyFormId, submissionId: string): string {
  return `nce-legacy_${sha256(eventIdentity(formId, submissionId)).slice(0, 32)}`;
}

function parseActionEvidence(
  value: unknown,
  rowNumber: number,
  expectedEvidence: LegacyMailchimpEvidence,
): LegacyActionEvidence[] {
  const encoded = requiredString(value, `row ${rowNumber} mailchimpActionEvidence`);
  const actions = encoded.split('|').map((part) => {
    const match = part.match(/^(\d+):(success|failed):(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)$/);
    if (!match) throw new Error(`row ${rowNumber} has malformed Mailchimp action evidence`);
    return {
      id: match[1]!,
      status: match[2]! as LegacyActionEvidence['status'],
      createdAt: canonicalTimestamp(match[3], `row ${rowNumber} action timestamp`),
    };
  });
  actions.sort((left, right) => compareNumericStrings(left.id, right.id));
  if (new Set(actions.map((action) => action.id)).size !== actions.length) {
    throw new Error(`row ${rowNumber} repeats a Mailchimp action id`);
  }
  const hasSuccess = actions.some((action) => action.status === 'success');
  if (hasSuccess !== (expectedEvidence === 'ever_success')) {
    throw new Error(`row ${rowNumber} Mailchimp status conflicts with its action provenance`);
  }
  return actions;
}

function parseSourceRow(value: unknown, rowNumber: number): LegacySourceRow {
  const source = record(value, `row ${rowNumber}`);
  exactKeys(
    source,
    [
      'legacySubmissionId',
      'legacyFormId',
      'email',
      'firstName',
      'submittedAt',
      'mailchimpEvidence',
      'mailchimpActionEvidence',
    ],
    `row ${rowNumber}`,
  );
  const legacySubmissionId = requiredString(
    source.legacySubmissionId,
    `row ${rowNumber} legacySubmissionId`,
  );
  if (!/^\d{1,160}$/.test(legacySubmissionId)) {
    throw new Error(`row ${rowNumber} has an invalid legacy submission id`);
  }
  const legacyFormId = requiredString(source.legacyFormId, `row ${rowNumber} legacyFormId`);
  if (!LEGACY_FORM_IDS.includes(legacyFormId as LegacyFormId)) {
    throw new Error(`row ${rowNumber} has an unapproved Elementor form id`);
  }
  const mailchimpEvidence = requiredString(
    source.mailchimpEvidence,
    `row ${rowNumber} mailchimpEvidence`,
  );
  if (mailchimpEvidence !== 'ever_success' && mailchimpEvidence !== 'never_success') {
    throw new Error(`row ${rowNumber} has unsupported Mailchimp evidence`);
  }
  const normalized: LegacySourceRow = {
    legacySubmissionId,
    legacyFormId: legacyFormId as LegacyFormId,
    email: normalizeEmail(source.email, rowNumber),
    firstName: nullableFirstName(source.firstName, rowNumber),
    submittedAt: canonicalTimestamp(source.submittedAt, `row ${rowNumber} submittedAt`),
    mailchimpEvidence,
    mailchimpActionEvidence: requiredString(
      source.mailchimpActionEvidence,
      `row ${rowNumber} mailchimpActionEvidence`,
    ),
  };
  parseActionEvidence(normalized.mailchimpActionEvidence, rowNumber, mailchimpEvidence);
  return normalized;
}

export function parseLegacySourceSnapshot(value: unknown): LegacySourceSnapshot {
  const source = record(value, 'source snapshot');
  exactKeys(
    source,
    [
      'schemaVersion',
      'source',
      'sourceDatabase',
      'sourceTables',
      'formDefinitionsEvidence',
      'capturedAt',
      'querySha256',
      'query',
      'rows',
    ],
    'source snapshot',
  );
  if (
    source.schemaVersion !== 1 ||
    source.source !== 'hostinger_phpmyadmin_select_only' ||
    source.sourceDatabase !== LEGACY_SOURCE_DATABASE
  ) {
    throw new Error('source snapshot identity is not approved');
  }
  if (
    !Array.isArray(source.sourceTables) ||
    source.sourceTables.length !== LEGACY_SOURCE_TABLES.length ||
    source.sourceTables.some((table, index) => table !== LEGACY_SOURCE_TABLES[index])
  ) {
    throw new Error('source snapshot table provenance is not approved');
  }
  const formEvidence = record(source.formDefinitionsEvidence, 'formDefinitionsEvidence');
  exactKeys(
    formEvidence,
    ['source', 'formIds', 'emailFieldKey', 'firstNameFieldKey'],
    'formDefinitionsEvidence',
  );
  if (
    formEvidence.source !== 'wordpress_wxr___elementor_forms_snapshot' ||
    formEvidence.emailFieldKey !== 'email' ||
    formEvidence.firstNameFieldKey !== 'field_5f9a09d' ||
    !Array.isArray(formEvidence.formIds) ||
    formEvidence.formIds.length !== LEGACY_FORM_IDS.length ||
    formEvidence.formIds.some((formId, index) => formId !== LEGACY_FORM_IDS[index])
  ) {
    throw new Error('Elementor form-definition provenance is incomplete');
  }
  if (typeof source.query !== 'string' || source.query.length === 0) {
    throw new Error('source query must be a string');
  }
  const query = source.query;
  const querySha256 = requiredString(source.querySha256, 'source querySha256').toLowerCase();
  if (
    !SHA256_PATTERN.test(querySha256) ||
    querySha256 !== APPROVED_SOURCE_QUERY_SHA256 ||
    query !== APPROVED_SOURCE_QUERY ||
    sha256(query) !== APPROVED_SOURCE_QUERY_SHA256
  ) {
    throw new Error('source query checksum does not match');
  }
  if (
    !/^select\b/i.test(query) ||
    /\b(?:insert|update|delete|replace|alter|drop|truncate)\b/i.test(query)
  ) {
    throw new Error('source query is not SELECT-only');
  }
  if (!Array.isArray(source.rows)) throw new Error('source snapshot rows must be an array');
  const rows = source.rows.map((row, index) => parseSourceRow(row, index + 1));
  const submissionIds = new Set<string>();
  for (const row of rows) {
    if (submissionIds.has(row.legacySubmissionId)) {
      throw new Error(`legacy submission ${row.legacySubmissionId} appears more than once`);
    }
    submissionIds.add(row.legacySubmissionId);
  }
  return {
    schemaVersion: 1,
    source: 'hostinger_phpmyadmin_select_only',
    sourceDatabase: LEGACY_SOURCE_DATABASE,
    sourceTables: [...LEGACY_SOURCE_TABLES],
    formDefinitionsEvidence: {
      source: 'wordpress_wxr___elementor_forms_snapshot',
      formIds: [...LEGACY_FORM_IDS],
      emailFieldKey: 'email',
      firstNameFieldKey: 'field_5f9a09d',
    },
    capturedAt: canonicalTimestampWithFraction(source.capturedAt),
    querySha256,
    query,
    rows,
  };
}

function canonicalTimestampWithFraction(value: unknown): string {
  const timestamp = requiredString(value, 'capturedAt');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(timestamp)) {
    throw new Error('capturedAt must be a UTC timestamp');
  }
  if (Number.isNaN(Date.parse(timestamp))) throw new Error('capturedAt must be a valid timestamp');
  return timestamp;
}

function sourceRecordSha256(row: LegacySourceRow, actions: LegacyActionEvidence[]): string {
  return sha256(
    JSON.stringify({
      legacySubmissionId: row.legacySubmissionId,
      legacyFormId: row.legacyFormId,
      email: row.email,
      firstName: row.firstName,
      submittedAt: row.submittedAt,
      mailchimpEvidence: row.mailchimpEvidence,
      mailchimpActions: actions,
    }),
  );
}

interface PreparedEvent {
  source: LegacySourceRow;
  event: PlannedLegacyConsentEvent;
}

export function buildLegacyNewsletterPlan(
  snapshot: LegacySourceSnapshot,
  sourceArtifactSha256: string,
): LegacyNewsletterImportPlan {
  const artifactSha = sourceArtifactSha256.toLowerCase();
  if (!SHA256_PATTERN.test(artifactSha)) throw new Error('source artifact SHA-256 is invalid');
  const prepared: PreparedEvent[] = snapshot.rows.map((row, index) => {
    const identity = eventIdentity(row.legacyFormId, row.legacySubmissionId);
    const requestId = deterministicUuid(identity);
    const actions = parseActionEvidence(
      row.mailchimpActionEvidence,
      index + 1,
      row.mailchimpEvidence,
    );
    return {
      source: row,
      event: {
        id: eventId(row.legacyFormId, row.legacySubmissionId),
        subscriptionId: subscriptionId(row.email),
        requestId,
        eventKind: 'legacy_request',
        email: row.email,
        firstName: row.firstName,
        consentVersion: null,
        consentAcceptedAt: null,
        sourceMetadata: {
          requestId,
          formVersion: 1,
          legacySource: 'wordpress_elementor',
          legacySourceVersion: 1,
          legacyFormId: row.legacyFormId,
          legacySubmissionId: row.legacySubmissionId,
          legacyMailchimpEvidence: row.mailchimpEvidence,
        },
        createdAt: row.submittedAt,
        provenance: {
          sourceArtifactSha256: artifactSha,
          sourceQuerySha256: snapshot.querySha256,
          sourceRecordSha256: sourceRecordSha256(row, actions),
          sourceDatabase: LEGACY_SOURCE_DATABASE,
          sourceTables: [...LEGACY_SOURCE_TABLES],
          mailchimpActions: actions,
        },
      },
    };
  });
  prepared.sort((left, right) => {
    const emailOrder = compareStrings(left.source.email, right.source.email);
    if (emailOrder) return emailOrder;
    const timeOrder = compareStrings(left.source.submittedAt, right.source.submittedAt);
    if (timeOrder) return timeOrder;
    return compareNumericStrings(left.source.legacySubmissionId, right.source.legacySubmissionId);
  });

  const byEmail = new Map<string, PreparedEvent[]>();
  for (const item of prepared) {
    const existing = byEmail.get(item.source.email) ?? [];
    existing.push(item);
    byEmail.set(item.source.email, existing);
  }
  const subscriptions: PlannedLegacySubscription[] = [];
  let contactsWithMultipleSubmissions = 0;
  let contactsWithMixedEvidence = 0;
  let contactsWithFirstName = 0;
  for (const [email, items] of byEmail) {
    if (items.length > 1) contactsWithMultipleSubmissions += 1;
    const evidenceKinds = new Set(items.map((item) => item.source.mailchimpEvidence));
    if (evidenceKinds.size > 1) contactsWithMixedEvidence += 1;
    const evidence: LegacyMailchimpEvidence = evidenceKinds.has('ever_success')
      ? 'ever_success'
      : 'never_success';
    const latest = items.at(-1)!;
    const latestWithName = [...items].reverse().find((item) => item.source.firstName !== null);
    if (latestWithName) contactsWithFirstName += 1;
    subscriptions.push({
      id: subscriptionId(email),
      email,
      firstName: latestWithName?.source.firstName ?? null,
      syncStatus: evidence === 'ever_success' ? 'legacy_unverified' : 'failed',
      syncAttemptCount: 0,
      syncAttemptedAt: null,
      syncError: evidence === 'ever_success' ? null : 'LEGACY_MAILCHIMP_NEVER_SYNCED',
      latestConsentEventId: latest.event.id,
      createdAt: items[0]!.source.submittedAt,
      updatedAt: latest.source.submittedAt,
      evidence,
      provenance: {
        contactKeySha256: sha256(email),
        legacySubmissionIds: items.map((item) => item.source.legacySubmissionId),
        sourceRecordSha256s: items.map((item) => item.event.provenance.sourceRecordSha256),
      },
    });
  }
  subscriptions.sort((left, right) => compareStrings(left.email, right.email));
  const consentEvents = prepared
    .map((item) => item.event)
    .sort((left, right) => compareStrings(left.id, right.id));
  const byForm: Record<LegacyFormId, number> = { '1678cc0a': 0, '79f340c2': 0 };
  let submissionEverSuccess = 0;
  for (const row of snapshot.rows) {
    byForm[row.legacyFormId] += 1;
    if (row.mailchimpEvidence === 'ever_success') submissionEverSuccess += 1;
  }
  const canonicalEverSuccess = subscriptions.filter(
    (subscription) => subscription.evidence === 'ever_success',
  ).length;
  return {
    schemaVersion: 1,
    mode: 'dry-run',
    writesPerformed: false,
    source: {
      kind: 'hostinger_phpmyadmin_select_only',
      database: LEGACY_SOURCE_DATABASE,
      tables: [...LEGACY_SOURCE_TABLES],
      capturedAt: snapshot.capturedAt,
      artifactSha256: artifactSha,
      querySha256: snapshot.querySha256,
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
      sourceSubmissions: snapshot.rows.length,
      plannedConsentEvents: consentEvents.length,
      canonicalContacts: subscriptions.length,
      canonicalEverSuccess,
      canonicalNeverSuccess: subscriptions.length - canonicalEverSuccess,
      submissionEverSuccess,
      submissionNeverSuccess: snapshot.rows.length - submissionEverSuccess,
      repeatedSubmissionEvents: snapshot.rows.length - subscriptions.length,
      contactsWithMultipleSubmissions,
      contactsWithMixedEvidence,
      contactsWithFirstName,
      byForm,
    },
    subscriptions,
    consentEvents,
  };
}

export function assertExpectedLegacyCohort(plan: LegacyNewsletterImportPlan): void {
  const { counts } = plan;
  if (
    counts.sourceSubmissions !== EXPECTED_SOURCE_SUBMISSIONS ||
    counts.canonicalEverSuccess !== EXPECTED_CANONICAL_EVER_SUCCESS ||
    counts.canonicalNeverSuccess !== EXPECTED_CANONICAL_NEVER_SUCCESS ||
    counts.canonicalContacts !== EXPECTED_CANONICAL_EVER_SUCCESS + EXPECTED_CANONICAL_NEVER_SUCCESS
  ) {
    throw new Error(
      'legacy cohort does not match the reviewed 692 submissions / 389 ever-success / 47 never-success contract',
    );
  }
}
