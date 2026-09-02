import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, chmod, lstat, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  APPROVED_SOURCE_ARTIFACT_SHA256,
  atomicPrivateJson,
  resolvePrivateInputPath,
  resolvePrivateOutputPath,
} from './cli.ts';
import {
  EXPECTED_CANONICAL_EVER_SUCCESS,
  EXPECTED_CANONICAL_NEVER_SUCCESS,
  EXPECTED_SOURCE_SUBMISSIONS,
  assertExpectedLegacyCohort,
  buildLegacyNewsletterPlan,
  parseLegacySourceSnapshot,
  type LegacyNewsletterImportPlan,
} from './core.ts';
import { transactionalNewsletterSql, type NewsletterBackupRowCounts } from './sql.ts';

export const DEVELOPMENT_SUPABASE_PROJECT_REF = 'pacpdxvujkjvnaeeuute';
export const APPROVED_PLAN_ARTIFACT_SHA256 =
  '4287a509b1aa263896ab2e18ce77a5210f90376cfe1c55c96cd3dfa762a101b6';
export const APPLY_CONFIRMATION_PHRASE = 'IMPORT_436_CONTACTS_692_EVENTS_TO_SUPABASE_DEVELOPMENT';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DEFAULT_PRIVATE_DIRECTORY = path.resolve(
  REPOSITORY_ROOT,
  '../../backups/newsletter/2026-09-02',
);
const DEVELOPMENT_POOLER_HOSTNAME = 'aws-0-eu-central-1.pooler.supabase.com';
const DEVELOPMENT_DIRECT_HOSTNAME = `db.${DEVELOPMENT_SUPABASE_PROJECT_REF}.supabase.co`;
const PSQL_PATH = '/opt/homebrew/opt/libpq/bin/psql';
const RESULT_PREFIX = 'MUKHTALIF_NEWSLETTER_IMPORT_RESULT=';

export interface ApplyOptions {
  apply: boolean;
  help: boolean;
  sourcePath: string;
  planPath: string;
  backupVerificationPath?: string;
  applyReportPath: string;
  confirmProject?: string;
  confirmSourceSha256?: string;
  confirmPlanSha256?: string;
  confirmBackupVerificationSha256?: string;
  confirmApply?: string;
}

export interface BackupVerification {
  schemaVersion: 1;
  kind: 'supabase_development_backup_verification';
  projectRef: typeof DEVELOPMENT_SUPABASE_PROJECT_REF;
  status: 'archive_verified';
  verifiedAt: string;
  validationMethod: 'sha256_and_pg_restore_list';
  archiveListValidated: true;
  restoreTested: false;
  backupArtifactPath: string;
  backupArtifactSha256: string;
  rowCounts: NewsletterBackupRowCounts;
}

export interface ApplyResult {
  schemaVersion: 1;
  projectRef: typeof DEVELOPMENT_SUPABASE_PROJECT_REF;
  sourceSha256: typeof APPROVED_SOURCE_ARTIFACT_SHA256;
  planSha256: typeof APPROVED_PLAN_ARTIFACT_SHA256;
  subscriptionsBefore: number;
  consentEventsBefore: number;
  subscriptionsInserted: number;
  consentEventsInserted: number;
  subscriptionsVerified: number;
  consentEventsVerified: number;
  subscriptionsAfter: number;
  consentEventsAfter: number;
}

interface DatabaseCredentials {
  host: string;
  port: '5432';
  user: string;
  password: string;
  database: 'postgres';
}

const USAGE = `Usage:
  pnpm import:newsletter:elementor:preflight

  pnpm import:newsletter:elementor:apply -- \\
    --backup-verification /absolute/private/backup-verification.json \\
    --confirm-project ${DEVELOPMENT_SUPABASE_PROJECT_REF} \\
    --confirm-source-sha256 ${APPROVED_SOURCE_ARTIFACT_SHA256} \\
    --confirm-plan-sha256 ${APPROVED_PLAN_ARTIFACT_SHA256} \\
    --confirm-backup-verification-sha256 SHA256 \\
    --confirm-apply ${APPLY_CONFIRMATION_PHRASE}

Options:
  --source PATH                              Fixed private source snapshot
  --plan PATH                                Fixed reviewed import plan
  --backup-verification PATH                 Verified backup receipt; apply only
  --apply-report PATH                        Private PII-free apply report
  --apply                                    Enable the guarded psql transaction
  --confirm-project REF                      Exact development project ref
  --confirm-source-sha256 SHA256              Exact approved source hash
  --confirm-plan-sha256 SHA256                Exact approved plan hash
  --confirm-backup-verification-sha256 SHA256 Exact reviewed receipt hash
  --confirm-apply PHRASE                      Exact irreversible-action phrase
  --help                                     Show this help

Preflight is local-only. Apply is insert-only, uses one transaction, preserves
all existing contact/consent/provider state, and never contacts Mailchimp.
`;

function argumentValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseApplyArguments(args: string[]): ApplyOptions {
  const options: ApplyOptions = {
    apply: false,
    help: false,
    sourcePath: path.join(DEFAULT_PRIVATE_DIRECTORY, 'elementor-newsletter-source.json'),
    planPath: path.join(DEFAULT_PRIVATE_DIRECTORY, 'elementor-newsletter-import-plan.json'),
    applyReportPath: path.join(DEFAULT_PRIVATE_DIRECTORY, 'elementor-newsletter-apply-report.json'),
  };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--') continue;
    if (flag === '--help' || flag === '-h') options.help = true;
    else if (flag === '--apply') options.apply = true;
    else if (flag === '--source') {
      options.sourcePath = path.resolve(argumentValue(args, index++, flag));
    } else if (flag === '--plan') {
      options.planPath = path.resolve(argumentValue(args, index++, flag));
    } else if (flag === '--backup-verification') {
      options.backupVerificationPath = path.resolve(argumentValue(args, index++, flag));
    } else if (flag === '--apply-report') {
      options.applyReportPath = path.resolve(argumentValue(args, index++, flag));
    } else if (flag === '--confirm-project') {
      options.confirmProject = argumentValue(args, index++, flag);
    } else if (flag === '--confirm-source-sha256') {
      options.confirmSourceSha256 = argumentValue(args, index++, flag).toLowerCase();
    } else if (flag === '--confirm-plan-sha256') {
      options.confirmPlanSha256 = argumentValue(args, index++, flag).toLowerCase();
    } else if (flag === '--confirm-backup-verification-sha256') {
      options.confirmBackupVerificationSha256 = argumentValue(args, index++, flag).toLowerCase();
    } else if (flag === '--confirm-apply') {
      options.confirmApply = argumentValue(args, index++, flag);
    } else {
      throw new Error(`Unknown option: ${flag}`);
    }
  }
  return options;
}

export function validateApplyOptions(options: ApplyOptions): void {
  const confirmations = [
    options.confirmProject,
    options.confirmSourceSha256,
    options.confirmPlanSha256,
    options.confirmBackupVerificationSha256,
    options.confirmApply,
  ];
  if (!options.apply) {
    if (options.backupVerificationPath || confirmations.some(Boolean)) {
      throw new Error('Backup and confirmation flags are accepted only with --apply');
    }
    return;
  }
  if (!options.backupVerificationPath) {
    throw new Error('--backup-verification is required with --apply');
  }
  if (options.confirmProject !== DEVELOPMENT_SUPABASE_PROJECT_REF) {
    throw new Error(`--confirm-project must equal ${DEVELOPMENT_SUPABASE_PROJECT_REF}`);
  }
  if (options.confirmSourceSha256 !== APPROVED_SOURCE_ARTIFACT_SHA256) {
    throw new Error('--confirm-source-sha256 must equal the fixed approved source hash');
  }
  if (options.confirmPlanSha256 !== APPROVED_PLAN_ARTIFACT_SHA256) {
    throw new Error('--confirm-plan-sha256 must equal the fixed approved plan hash');
  }
  if (!/^[a-f\d]{64}$/.test(options.confirmBackupVerificationSha256 ?? '')) {
    throw new Error('--confirm-backup-verification-sha256 must be an exact SHA-256');
  }
  if (options.confirmApply !== APPLY_CONFIRMATION_PHRASE) {
    throw new Error(`--confirm-apply must equal ${APPLY_CONFIRMATION_PHRASE}`);
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function sha256File(filePath: string): Promise<string> {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) digest.update(chunk as Buffer);
  return digest.digest('hex');
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: string[], label: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} does not match the approved schema`);
  }
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return value as number;
}

export function parseBackupVerification(value: unknown): BackupVerification {
  const source = record(value, 'Backup verification');
  exactKeys(
    source,
    [
      'schemaVersion',
      'kind',
      'projectRef',
      'status',
      'verifiedAt',
      'validationMethod',
      'archiveListValidated',
      'restoreTested',
      'backupArtifactPath',
      'backupArtifactSha256',
      'rowCounts',
    ],
    'Backup verification',
  );
  if (
    source.schemaVersion !== 1 ||
    source.kind !== 'supabase_development_backup_verification' ||
    source.projectRef !== DEVELOPMENT_SUPABASE_PROJECT_REF ||
    source.status !== 'archive_verified' ||
    source.validationMethod !== 'sha256_and_pg_restore_list' ||
    source.archiveListValidated !== true ||
    source.restoreTested !== false
  ) {
    throw new Error('Backup is not an archive-validated development backup');
  }
  if (
    typeof source.verifiedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(source.verifiedAt) ||
    Number.isNaN(Date.parse(source.verifiedAt))
  ) {
    throw new Error('Backup verifiedAt must be a UTC timestamp');
  }
  if (
    typeof source.backupArtifactPath !== 'string' ||
    !path.isAbsolute(source.backupArtifactPath)
  ) {
    throw new Error('Backup artifact path must be absolute');
  }
  if (
    typeof source.backupArtifactSha256 !== 'string' ||
    !/^[a-f\d]{64}$/.test(source.backupArtifactSha256)
  ) {
    throw new Error('Backup artifact SHA-256 is invalid');
  }
  const counts = record(source.rowCounts, 'Backup rowCounts');
  exactKeys(counts, ['newsletterSubscriptions', 'newsletterConsentEvents'], 'Backup rowCounts');
  return {
    schemaVersion: 1,
    kind: 'supabase_development_backup_verification',
    projectRef: DEVELOPMENT_SUPABASE_PROJECT_REF,
    status: 'archive_verified',
    verifiedAt: source.verifiedAt,
    validationMethod: 'sha256_and_pg_restore_list',
    archiveListValidated: true,
    restoreTested: false,
    backupArtifactPath: source.backupArtifactPath,
    backupArtifactSha256: source.backupArtifactSha256,
    rowCounts: {
      newsletterSubscriptions: nonNegativeInteger(
        counts.newsletterSubscriptions,
        'newsletterSubscriptions',
      ),
      newsletterConsentEvents: nonNegativeInteger(
        counts.newsletterConsentEvents,
        'newsletterConsentEvents',
      ),
    },
  };
}

export function verifyApprovedArtifacts(
  sourceBytes: Uint8Array,
  planBytes: Uint8Array,
): LegacyNewsletterImportPlan {
  if (sha256(sourceBytes) !== APPROVED_SOURCE_ARTIFACT_SHA256) {
    throw new Error('Source artifact SHA-256 does not match the fixed approved snapshot');
  }
  if (sha256(planBytes) !== APPROVED_PLAN_ARTIFACT_SHA256) {
    throw new Error('Plan artifact SHA-256 does not match the fixed reviewed plan');
  }
  const source = parseLegacySourceSnapshot(JSON.parse(Buffer.from(sourceBytes).toString('utf8')));
  const rebuilt = buildLegacyNewsletterPlan(source, APPROVED_SOURCE_ARTIFACT_SHA256);
  assertExpectedLegacyCohort(rebuilt);
  const reviewed = JSON.parse(Buffer.from(planBytes).toString('utf8')) as unknown;
  if (!isDeepStrictEqual(reviewed, rebuilt)) {
    throw new Error('Reviewed plan does not exactly match the fixed source rebuild');
  }
  return rebuilt;
}

export function parseDevelopmentDatabaseUrl(raw: string): DatabaseCredentials {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('SUPABASE_DB_URL is not a valid locked development database URL');
  }
  const hostname = url.hostname.toLowerCase();
  const poolerUser = `postgres.${DEVELOPMENT_SUPABASE_PROJECT_REF}`;
  let expectedUser: string;
  if (hostname === DEVELOPMENT_POOLER_HOSTNAME) expectedUser = poolerUser;
  else if (hostname === DEVELOPMENT_DIRECT_HOSTNAME) expectedUser = 'postgres';
  else throw new Error('SUPABASE_DB_URL does not target the locked development project');
  let username: string;
  let password: string;
  try {
    username = decodeURIComponent(url.username);
    password = decodeURIComponent(url.password);
  } catch {
    throw new Error('SUPABASE_DB_URL credentials are not valid URL encoding');
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    url.port !== '5432' ||
    username !== expectedUser ||
    !password ||
    /[\0\r\n]/.test(password) ||
    url.pathname !== '/postgres' ||
    url.search ||
    url.hash
  ) {
    throw new Error('SUPABASE_DB_URL does not match the locked development connection contract');
  }
  return {
    host: hostname,
    port: '5432',
    user: expectedUser,
    password,
    database: 'postgres',
  };
}

async function developmentDatabaseCredentials(): Promise<DatabaseCredentials> {
  if (!process.env.SUPABASE_DB_URL?.trim()) {
    const envPath = path.join(REPOSITORY_ROOT, '.env.local');
    const details = await lstat(envPath);
    if (details.isSymbolicLink() || !details.isFile() || (details.mode & 0o777) !== 0o600) {
      throw new Error('.env.local must be a real owner-only 0600 file before apply');
    }
    if (typeof process.loadEnvFile !== 'function') {
      throw new Error('This Node.js runtime cannot securely load .env.local');
    }
    process.loadEnvFile(envPath);
  }
  const raw = process.env.SUPABASE_DB_URL?.trim();
  if (!raw) throw new Error('SUPABASE_DB_URL is required for guarded apply');
  return parseDevelopmentDatabaseUrl(raw);
}

export function parseApplyResult(output: string, before: NewsletterBackupRowCounts): ApplyResult {
  const lines = output.split(/\r?\n/).filter((line) => line.startsWith(RESULT_PREFIX));
  if (lines.length !== 1) throw new Error('Transactional apply returned no unique result marker');
  const parsed = record(JSON.parse(lines[0]!.slice(RESULT_PREFIX.length)), 'Apply result');
  exactKeys(
    parsed,
    [
      'schemaVersion',
      'projectRef',
      'sourceSha256',
      'planSha256',
      'subscriptionsBefore',
      'consentEventsBefore',
      'subscriptionsInserted',
      'consentEventsInserted',
      'subscriptionsVerified',
      'consentEventsVerified',
      'subscriptionsAfter',
      'consentEventsAfter',
    ],
    'Apply result',
  );
  if (
    parsed.schemaVersion !== 1 ||
    parsed.projectRef !== DEVELOPMENT_SUPABASE_PROJECT_REF ||
    parsed.sourceSha256 !== APPROVED_SOURCE_ARTIFACT_SHA256 ||
    parsed.planSha256 !== APPROVED_PLAN_ARTIFACT_SHA256
  ) {
    throw new Error('Transactional apply result identity is invalid');
  }
  const result: ApplyResult = {
    schemaVersion: 1,
    projectRef: DEVELOPMENT_SUPABASE_PROJECT_REF,
    sourceSha256: APPROVED_SOURCE_ARTIFACT_SHA256,
    planSha256: APPROVED_PLAN_ARTIFACT_SHA256,
    subscriptionsBefore: nonNegativeInteger(parsed.subscriptionsBefore, 'subscriptionsBefore'),
    consentEventsBefore: nonNegativeInteger(parsed.consentEventsBefore, 'consentEventsBefore'),
    subscriptionsInserted: nonNegativeInteger(
      parsed.subscriptionsInserted,
      'subscriptionsInserted',
    ),
    consentEventsInserted: nonNegativeInteger(
      parsed.consentEventsInserted,
      'consentEventsInserted',
    ),
    subscriptionsVerified: nonNegativeInteger(
      parsed.subscriptionsVerified,
      'subscriptionsVerified',
    ),
    consentEventsVerified: nonNegativeInteger(
      parsed.consentEventsVerified,
      'consentEventsVerified',
    ),
    subscriptionsAfter: nonNegativeInteger(parsed.subscriptionsAfter, 'subscriptionsAfter'),
    consentEventsAfter: nonNegativeInteger(parsed.consentEventsAfter, 'consentEventsAfter'),
  };
  if (
    result.subscriptionsBefore !== before.newsletterSubscriptions ||
    result.consentEventsBefore !== before.newsletterConsentEvents ||
    result.subscriptionsInserted >
      EXPECTED_CANONICAL_EVER_SUCCESS + EXPECTED_CANONICAL_NEVER_SUCCESS ||
    result.consentEventsInserted > EXPECTED_SOURCE_SUBMISSIONS ||
    result.subscriptionsVerified !==
      EXPECTED_CANONICAL_EVER_SUCCESS + EXPECTED_CANONICAL_NEVER_SUCCESS ||
    result.consentEventsVerified !== EXPECTED_SOURCE_SUBMISSIONS ||
    result.subscriptionsAfter !== result.subscriptionsBefore + result.subscriptionsInserted ||
    result.consentEventsAfter !== result.consentEventsBefore + result.consentEventsInserted
  ) {
    throw new Error('Transactional apply result counts failed exact verification');
  }
  return result;
}

async function executeTransaction(
  sql: string,
  credentials: DatabaseCredentials,
  before: NewsletterBackupRowCounts,
): Promise<ApplyResult> {
  await access(PSQL_PATH, fsConstants.X_OK);
  const directory = await mkdtemp(
    path.join(await realpath(tmpdir()), 'mukhtalif-newsletter-import-'),
  );
  await chmod(directory, 0o700);
  const sqlPath = path.join(directory, 'apply.sql');
  try {
    await writeFile(sqlPath, sql, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    const output = await new Promise<string>((resolve, reject) => {
      const child = spawn(
        PSQL_PATH,
        [
          '--no-psqlrc',
          '--no-password',
          '--quiet',
          '--tuples-only',
          '--no-align',
          '--set',
          'ON_ERROR_STOP=1',
          '--file',
          sqlPath,
        ],
        {
          stdio: ['ignore', 'pipe', 'ignore'],
          env: {
            PATH: process.env.PATH ?? '',
            LANG: process.env.LANG ?? 'C',
            PGHOST: credentials.host,
            PGPORT: credentials.port,
            PGUSER: credentials.user,
            PGPASSWORD: credentials.password,
            PGDATABASE: credentials.database,
            PGSSLMODE: 'verify-full',
            PGCONNECT_TIMEOUT: '10',
            PGAPPNAME: 'mukhtalif_elementor_newsletter_import',
          },
        },
      );
      let stdout = '';
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk;
        if (stdout.length > 65_536) child.kill('SIGTERM');
      });
      child.once('error', () => reject(new Error('Could not start the locked psql client')));
      child.once('exit', (code) => {
        if (code === 0 && stdout.length <= 65_536) resolve(stdout);
        else reject(new Error(`Newsletter transaction failed (psql exit ${code ?? 'signal'})`));
      });
    });
    return parseApplyResult(output, before);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const options = parseApplyArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(USAGE);
    return;
  }
  validateApplyOptions(options);
  const sourcePath = await resolvePrivateInputPath(options.sourcePath, '--source');
  const planPath = await resolvePrivateInputPath(options.planPath, '--plan');
  if (sourcePath === planPath) throw new Error('Source and plan canonical paths must differ');
  const [sourceBytes, planBytes] = await Promise.all([readFile(sourcePath), readFile(planPath)]);
  const plan = verifyApprovedArtifacts(sourceBytes, planBytes);

  if (!options.apply) {
    process.stdout.write(
      `${JSON.stringify(
        {
          mode: 'preflight',
          connectionAttempted: false,
          writesPerformed: false,
          projectRef: DEVELOPMENT_SUPABASE_PROJECT_REF,
          sourceSha256: APPROVED_SOURCE_ARTIFACT_SHA256,
          planSha256: APPROVED_PLAN_ARTIFACT_SHA256,
          counts: plan.counts,
          applyRequiresVerifiedBackup: true,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  const backupVerificationPath = await resolvePrivateInputPath(
    options.backupVerificationPath!,
    '--backup-verification',
  );
  const backupVerificationBytes = await readFile(backupVerificationPath);
  const backupVerificationSha256 = sha256(backupVerificationBytes);
  if (backupVerificationSha256 !== options.confirmBackupVerificationSha256) {
    throw new Error('Backup verification SHA-256 does not match its explicit confirmation');
  }
  const backup = parseBackupVerification(
    JSON.parse(backupVerificationBytes.toString('utf8')) as unknown,
  );
  const backupArtifactPath = await resolvePrivateInputPath(
    backup.backupArtifactPath,
    '--backup-artifact',
  );
  if ((await sha256File(backupArtifactPath)) !== backup.backupArtifactSha256) {
    throw new Error('Backup artifact SHA-256 no longer matches its verified receipt');
  }
  const applyReportPath = await resolvePrivateOutputPath(options.applyReportPath, '--apply-report');
  const canonicalPaths = [
    sourcePath,
    planPath,
    backupVerificationPath,
    backupArtifactPath,
    applyReportPath,
  ];
  if (new Set(canonicalPaths).size !== canonicalPaths.length) {
    throw new Error('Source, plan, backup, and apply-report canonical paths must differ');
  }

  const credentials = await developmentDatabaseCredentials();
  const sql = transactionalNewsletterSql(plan, {
    projectRef: DEVELOPMENT_SUPABASE_PROJECT_REF,
    sourceSha256: APPROVED_SOURCE_ARTIFACT_SHA256,
    planSha256: APPROVED_PLAN_ARTIFACT_SHA256,
    before: backup.rowCounts,
  });
  const result = await executeTransaction(sql, credentials, backup.rowCounts);
  const report = {
    schemaVersion: 1,
    mode: 'apply',
    containsPersonalData: false,
    projectRef: DEVELOPMENT_SUPABASE_PROJECT_REF,
    sourceSha256: APPROVED_SOURCE_ARTIFACT_SHA256,
    planSha256: APPROVED_PLAN_ARTIFACT_SHA256,
    backupVerificationSha256,
    backupArtifactSha256: backup.backupArtifactSha256,
    backupVerifiedAt: backup.verifiedAt,
    backupArchiveListValidated: backup.archiveListValidated,
    backupRestoreTested: backup.restoreTested,
    policy: {
      transactionCount: 1,
      deletesPerformed: 0,
      existingRowsUpdated: 0,
      mailchimpConnections: 0,
      existingConsentAndProviderStatePreserved: true,
    },
    result,
  };
  await atomicPrivateJson(applyReportPath, '--apply-report', report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
