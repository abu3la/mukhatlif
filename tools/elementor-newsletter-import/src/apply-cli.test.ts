import { describe, expect, it } from 'vitest';
import {
  APPLY_CONFIRMATION_PHRASE,
  APPROVED_PLAN_ARTIFACT_SHA256,
  DEVELOPMENT_SUPABASE_PROJECT_REF,
  parseApplyArguments,
  parseApplyResult,
  parseBackupVerification,
  parseDevelopmentDatabaseUrl,
  validateApplyOptions,
  verifyApprovedArtifacts,
} from './apply-cli.ts';
import { APPROVED_SOURCE_ARTIFACT_SHA256 } from './cli.ts';

function confirmedOptions() {
  return parseApplyArguments([
    '--apply',
    '--backup-verification',
    '/private/backup-verification.json',
    '--confirm-project',
    DEVELOPMENT_SUPABASE_PROJECT_REF,
    '--confirm-source-sha256',
    APPROVED_SOURCE_ARTIFACT_SHA256,
    '--confirm-plan-sha256',
    APPROVED_PLAN_ARTIFACT_SHA256,
    '--confirm-backup-verification-sha256',
    'c'.repeat(64),
    '--confirm-apply',
    APPLY_CONFIRMATION_PHRASE,
  ]);
}

function backupVerification(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    kind: 'supabase_development_backup_verification',
    projectRef: DEVELOPMENT_SUPABASE_PROJECT_REF,
    status: 'archive_verified',
    verifiedAt: '2026-09-02T20:00:00.000Z',
    validationMethod: 'sha256_and_pg_restore_list',
    archiveListValidated: true,
    restoreTested: false,
    backupArtifactPath: '/private/development-before-newsletter.dump',
    backupArtifactSha256: 'd'.repeat(64),
    rowCounts: {
      newsletterSubscriptions: 2,
      newsletterConsentEvents: 3,
    },
  };
}

function applyResult(overrides: Record<string, unknown> = {}): string {
  return `MUKHTALIF_NEWSLETTER_IMPORT_RESULT=${JSON.stringify({
    schemaVersion: 1,
    projectRef: DEVELOPMENT_SUPABASE_PROJECT_REF,
    sourceSha256: APPROVED_SOURCE_ARTIFACT_SHA256,
    planSha256: APPROVED_PLAN_ARTIFACT_SHA256,
    subscriptionsBefore: 2,
    consentEventsBefore: 3,
    subscriptionsInserted: 436,
    consentEventsInserted: 692,
    subscriptionsVerified: 436,
    consentEventsVerified: 692,
    subscriptionsAfter: 438,
    consentEventsAfter: 695,
    ...overrides,
  })}\n`;
}

describe('Elementor newsletter apply CLI safety policy', () => {
  it('requires every exact apply confirmation and rejects them in preflight mode', () => {
    expect(() => validateApplyOptions(parseApplyArguments(['--apply']))).toThrow(
      '--backup-verification',
    );
    expect(() => validateApplyOptions(confirmedOptions())).not.toThrow();
    expect(() =>
      validateApplyOptions(
        parseApplyArguments(['--confirm-project', DEVELOPMENT_SUPABASE_PROJECT_REF]),
      ),
    ).toThrow('only with --apply');
    const wrongProject = confirmedOptions();
    wrongProject.confirmProject = 'production-project';
    expect(() => validateApplyOptions(wrongProject)).toThrow('--confirm-project');
    const wrongPhrase = confirmedOptions();
    wrongPhrase.confirmApply = 'yes';
    expect(() => validateApplyOptions(wrongPhrase)).toThrow('--confirm-apply');
  });

  it('accepts only a truthfully archive-validated backup receipt for development', () => {
    expect(parseBackupVerification(backupVerification())).toMatchObject({
      projectRef: DEVELOPMENT_SUPABASE_PROJECT_REF,
      status: 'archive_verified',
      archiveListValidated: true,
      restoreTested: false,
      rowCounts: { newsletterSubscriptions: 2, newsletterConsentEvents: 3 },
    });
    const production = backupVerification();
    production.projectRef = 'production-project';
    expect(() => parseBackupVerification(production)).toThrow('development backup');
    const untested = backupVerification();
    untested.archiveListValidated = false;
    expect(() => parseBackupVerification(untested)).toThrow('archive-validated');
    const unknownField = backupVerification();
    unknownField.note = 'not approved';
    expect(() => parseBackupVerification(unknownField)).toThrow('approved schema');
  });

  it('locks database URLs to the exact development direct host or session pooler user', () => {
    expect(
      parseDevelopmentDatabaseUrl(
        `postgresql://postgres.${DEVELOPMENT_SUPABASE_PROJECT_REF}:secret@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`,
      ),
    ).toMatchObject({
      host: 'aws-0-eu-central-1.pooler.supabase.com',
      user: `postgres.${DEVELOPMENT_SUPABASE_PROJECT_REF}`,
    });
    expect(
      parseDevelopmentDatabaseUrl(
        `postgresql://postgres:secret@db.${DEVELOPMENT_SUPABASE_PROJECT_REF}.supabase.co:5432/postgres`,
      ),
    ).toMatchObject({
      host: `db.${DEVELOPMENT_SUPABASE_PROJECT_REF}.supabase.co`,
      user: 'postgres',
    });
    for (const unsafe of [
      `postgresql://postgres.other:secret@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`,
      `postgresql://postgres.${DEVELOPMENT_SUPABASE_PROJECT_REF}:secret@evil.example:5432/postgres`,
      `postgresql://postgres.${DEVELOPMENT_SUPABASE_PROJECT_REF}:secret@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`,
      `postgresql://postgres.${DEVELOPMENT_SUPABASE_PROJECT_REF}:secret@aws-0-eu-central-1.pooler.supabase.com:5432/other`,
    ]) {
      expect(() => parseDevelopmentDatabaseUrl(unsafe)).toThrow(/locked development/);
    }
  });

  it('accepts only exact PII-free transaction result counts', () => {
    expect(
      parseApplyResult(applyResult(), {
        newsletterSubscriptions: 2,
        newsletterConsentEvents: 3,
      }),
    ).toMatchObject({
      subscriptionsInserted: 436,
      consentEventsInserted: 692,
      subscriptionsVerified: 436,
      consentEventsVerified: 692,
    });
    expect(() =>
      parseApplyResult(applyResult({ subscriptionsAfter: 999 }), {
        newsletterSubscriptions: 2,
        newsletterConsentEvents: 3,
      }),
    ).toThrow('exact verification');
    expect(() =>
      parseApplyResult(applyResult({ subscriptionsVerified: 435 }), {
        newsletterSubscriptions: 2,
        newsletterConsentEvents: 3,
      }),
    ).toThrow('exact verification');
  });

  it('rejects source and plan bytes that are not the two fixed reviewed artifacts', () => {
    expect(() => verifyApprovedArtifacts(Buffer.from('{}\n'), Buffer.from('{}\n'))).toThrow(
      'Source artifact SHA-256',
    );
  });
});
