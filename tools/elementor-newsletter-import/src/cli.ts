import { createHash, randomBytes } from 'node:crypto';
import type { Stats } from 'node:fs';
import { lstat, readFile, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EXPECTED_CANONICAL_EVER_SUCCESS,
  EXPECTED_CANONICAL_NEVER_SUCCESS,
  EXPECTED_SOURCE_SUBMISSIONS,
  assertExpectedLegacyCohort,
  buildLegacyNewsletterPlan,
  parseLegacySourceSnapshot,
} from './core.ts';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DEFAULT_PRIVATE_DIRECTORY = path.resolve(
  REPOSITORY_ROOT,
  '../../backups/newsletter/2026-09-02',
);
export const APPROVED_SOURCE_ARTIFACT_SHA256 =
  '843dd0b8dded9742fe65081f2dfa8de143375abf910f12f3e06abc18f688f29e';

interface CliOptions {
  help: boolean;
  apply: boolean;
  inputPath: string;
  planPath: string;
  reportPath: string;
}

const USAGE = `Usage:
  pnpm import:newsletter:elementor:dry-run [options]

Options:
  --input PATH                   Private Elementor SELECT snapshot
  --plan PATH                    Private detailed plan (contains email addresses)
  --report PATH                  Private PII-free summary report
  --apply                        Always rejected; this tool is dry-run only
  --help                         Show help

All input and output paths must be outside Git. The input, plan, and report must
be owner-only files (0600). The source artifact and SELECT query are pinned to
their independently reviewed SHA-256 values. The command reads local JSON only.
It does not open a database or provider connection, send email, resubscribe
contacts, or write rows.
`;

function argumentValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseArguments(args: string[]): CliOptions {
  const result: CliOptions = {
    help: false,
    apply: false,
    inputPath: path.join(DEFAULT_PRIVATE_DIRECTORY, 'elementor-newsletter-source.json'),
    planPath: path.join(DEFAULT_PRIVATE_DIRECTORY, 'elementor-newsletter-import-plan.json'),
    reportPath: path.join(DEFAULT_PRIVATE_DIRECTORY, 'elementor-newsletter-dry-run-report.json'),
  };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--') continue;
    if (flag === '--help' || flag === '-h') result.help = true;
    else if (flag === '--apply') result.apply = true;
    else if (flag === '--input') {
      result.inputPath = path.resolve(argumentValue(args, index++, flag));
    } else if (flag === '--plan') {
      result.planPath = path.resolve(argumentValue(args, index++, flag));
    } else if (flag === '--report') {
      result.reportPath = path.resolve(argumentValue(args, index++, flag));
    } else {
      throw new Error(`Unknown option: ${flag}`);
    }
  }
  return result;
}

function assertLexicallyOutsideRepository(value: string, flag: string): void {
  const resolved = path.resolve(value);
  if (resolved === REPOSITORY_ROOT || resolved.startsWith(`${REPOSITORY_ROOT}${path.sep}`)) {
    throw new Error(`${flag} must be outside the Git repository`);
  }
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..');
}

let canonicalRepositoryRootPromise: Promise<string> | undefined;

function canonicalRepositoryRoot(): Promise<string> {
  canonicalRepositoryRootPromise ??= realpath(REPOSITORY_ROOT);
  return canonicalRepositoryRootPromise;
}

async function assertCanonicalOutsideRepository(value: string, flag: string): Promise<void> {
  if (isWithin(await canonicalRepositoryRoot(), value)) {
    throw new Error(`${flag} resolves inside the Git repository`);
  }
}

async function optionalLstat(value: string): Promise<Stats | null> {
  try {
    return await lstat(value);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function assertPrivateDirectory(directory: string, flag: string): Promise<string> {
  const details = await optionalLstat(directory);
  if (!details) throw new Error(`${flag} parent must already exist as a private directory`);
  if (details.isSymbolicLink()) throw new Error(`${flag} parent cannot be a symbolic link`);
  if (!details.isDirectory()) throw new Error(`${flag} parent must be a directory`);
  const canonical = await realpath(directory);
  await assertCanonicalOutsideRepository(canonical, flag);
  if ((details.mode & 0o077) !== 0) {
    throw new Error(`${flag} parent must not grant group or world permissions`);
  }
  return canonical;
}

export async function resolvePrivateInputPath(filePath: string, flag = '--input'): Promise<string> {
  assertLexicallyOutsideRepository(filePath, flag);
  const absolute = path.resolve(filePath);
  const details = await lstat(absolute);
  if (details.isSymbolicLink()) throw new Error(`${flag} cannot be a symbolic link`);
  if (!details.isFile()) throw new Error(`${flag} must be a regular file`);
  if ((details.mode & 0o777) !== 0o600) {
    throw new Error(`${flag} must have mode 0600 before it is read`);
  }
  const canonicalParent = await assertPrivateDirectory(path.dirname(absolute), flag);
  const canonical = await realpath(absolute);
  await assertCanonicalOutsideRepository(canonical, flag);
  if (path.dirname(canonical) !== canonicalParent) {
    throw new Error(`${flag} canonical parent changed during validation`);
  }
  return canonical;
}

export async function resolvePrivateOutputPath(filePath: string, flag: string): Promise<string> {
  assertLexicallyOutsideRepository(filePath, flag);
  const absolute = path.resolve(filePath);
  const existing = await optionalLstat(absolute);
  if (existing?.isSymbolicLink()) throw new Error(`${flag} cannot be a symbolic link`);
  if (existing && !existing.isFile()) throw new Error(`${flag} must be a regular file path`);
  if (existing && (existing.mode & 0o777) !== 0o600) {
    throw new Error(`${flag} existing file must have mode 0600 before it is replaced`);
  }
  const canonicalParent = await assertPrivateDirectory(path.dirname(absolute), flag);
  const canonical = path.join(canonicalParent, path.basename(absolute));
  if (existing) {
    const canonicalExisting = await realpath(absolute);
    await assertCanonicalOutsideRepository(canonicalExisting, flag);
    if (canonicalExisting !== canonical) {
      throw new Error(`${flag} canonical target changed during validation`);
    }
  }
  await assertCanonicalOutsideRepository(canonical, flag);
  return canonical;
}

export async function atomicPrivateJson(
  filePath: string,
  flag: string,
  value: unknown,
): Promise<Buffer> {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
  const canonical = await resolvePrivateOutputPath(filePath, flag);
  const temporary = `${canonical}.${randomBytes(6).toString('hex')}.tmp`;
  let temporaryExists = false;
  try {
    await writeFile(temporary, bytes, { mode: 0o600, flag: 'wx' });
    temporaryExists = true;
    const temporaryDetails = await lstat(temporary);
    if (
      !temporaryDetails.isFile() ||
      temporaryDetails.isSymbolicLink() ||
      (temporaryDetails.mode & 0o777) !== 0o600
    ) {
      throw new Error(`${flag} temporary artifact is unsafe`);
    }
    await rename(temporary, canonical);
    temporaryExists = false;
    const written = await lstat(canonical);
    if (!written.isFile() || written.isSymbolicLink() || (written.mode & 0o777) !== 0o600) {
      throw new Error(`${flag} was not written as a private regular file`);
    }
    if ((await realpath(canonical)) !== canonical) {
      throw new Error(`${flag} canonical target changed after write`);
    }
    return bytes;
  } finally {
    if (temporaryExists) await unlink(temporary).catch(() => undefined);
  }
}

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function run(options: CliOptions): Promise<{
  sourceSha256: string;
  planSha256: string;
  reportSha256: string;
  counts: ReturnType<typeof buildLegacyNewsletterPlan>['counts'];
}> {
  if (options.apply) {
    throw new Error(
      '--apply is intentionally unavailable: review the private plan before a separate import is built',
    );
  }
  for (const [flag, value] of [
    ['--input', options.inputPath],
    ['--plan', options.planPath],
    ['--report', options.reportPath],
  ] as const) {
    assertLexicallyOutsideRepository(value, flag);
  }
  const canonicalInputPath = await resolvePrivateInputPath(options.inputPath);
  const canonicalPlanPath = await resolvePrivateOutputPath(options.planPath, '--plan');
  const canonicalReportPath = await resolvePrivateOutputPath(options.reportPath, '--report');
  if (new Set([canonicalInputPath, canonicalPlanPath, canonicalReportPath]).size !== 3) {
    throw new Error('input, plan, and report canonical paths must be different');
  }
  const sourceBytes = await readFile(canonicalInputPath);
  const sourceSha256 = digest(sourceBytes);
  if (sourceSha256 !== APPROVED_SOURCE_ARTIFACT_SHA256) {
    throw new Error('source artifact SHA-256 does not match the approved fixed snapshot');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(sourceBytes.toString('utf8')) as unknown;
  } catch {
    throw new Error('source artifact is not valid JSON');
  }
  const snapshot = parseLegacySourceSnapshot(parsed);
  const plan = buildLegacyNewsletterPlan(snapshot, sourceSha256);
  assertExpectedLegacyCohort(plan);
  const planBytes = await atomicPrivateJson(canonicalPlanPath, '--plan', plan);
  const planSha256 = digest(planBytes);
  const report = {
    schemaVersion: 1,
    mode: 'dry-run' as const,
    writesPerformed: false as const,
    containsPersonalData: false as const,
    source: {
      artifactSha256: sourceSha256,
      querySha256: snapshot.querySha256,
      submissions: EXPECTED_SOURCE_SUBMISSIONS,
    },
    plan: {
      artifactSha256: planSha256,
      path: canonicalPlanPath,
      containsPersonalData: true as const,
      mode: '0600' as const,
    },
    reviewedCohort: {
      canonicalEverSuccess: EXPECTED_CANONICAL_EVER_SUCCESS,
      canonicalNeverSuccess: EXPECTED_CANONICAL_NEVER_SUCCESS,
    },
    counts: plan.counts,
    safeguards: {
      sourceSelectOnly: true,
      localFilesOnly: true,
      noDatabaseWrite: true,
      noMailchimpConnection: true,
      noEmailSend: true,
      noResubscribe: true,
      noConsentClaim: true,
      noProviderStatusClaim: true,
    },
  };
  const reportBytes = await atomicPrivateJson(canonicalReportPath, '--report', report);
  return {
    sourceSha256,
    planSha256,
    reportSha256: digest(reportBytes),
    counts: plan.counts,
  };
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(USAGE);
    return;
  }
  const result = await run(options);
  process.stdout.write(
    `${JSON.stringify(
      {
        mode: 'dry-run',
        writesPerformed: false,
        sourceSha256: result.sourceSha256,
        planSha256: result.planSha256,
        reportSha256: result.reportSha256,
        counts: result.counts,
      },
      null,
      2,
    )}\n`,
  );
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
