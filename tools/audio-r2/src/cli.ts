import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { access, chmod, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APPROVED_CLOUDFLARE_ACCOUNT_ID,
  APPROVED_R2_BUCKET,
  APPROVED_SUPABASE_PROJECT_REF,
  buildAudioMigrationPlan,
  summarizeAudioPlan,
  type AudioMigrationPlanItem,
  type DatabaseEpisode,
} from './core.ts';
import { inspectAudioHead, mapConcurrent, type AudioHeadResult } from './network.ts';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DEFAULT_BACKUP_DIRECTORY = path.resolve(
  REPOSITORY_ROOT,
  '../../backups/wordpress/2026-09-02',
);
const ANSI_COLOR_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

interface CliOptions {
  help: boolean;
  apply: boolean;
  headSources: boolean;
  headConcurrency: number;
  manifestPath: string;
  reportPath: string;
  accountId: string;
  bucket: string;
  expectedProjectRef: string;
  envPath?: string;
}

interface BucketInfo {
  name: string;
  created: string | null;
  location: string | null;
  storageClass: string | null;
  objectCount: number;
  bucketSize: string;
}

interface DatabaseInventory {
  totalEpisodes: number;
  rssEpisodes: number;
  withAudioUrl: number;
  withAudioKey: number;
  rssSourceMatchesAudioUrl: number;
  rssSourceDiffersFromAudioUrl: number;
}

interface ReportItem extends AudioMigrationPlanItem {
  sourceHead: AudioHeadResult | { status: 'not-checked' };
  r2State: 'missing-bucket-empty' | 'not-inspected';
  plannedAction: 'upload-then-link' | 'verify-existing-link' | 'blocked';
}

interface DryRunReport {
  schemaVersion: 1;
  generatedAt: string;
  mode: 'dry-run';
  writesPerformed: false;
  guards: {
    cloudflareAccountId: string;
    r2Bucket: string;
    supabaseProjectRef: string;
  };
  source: {
    manifestPath: string;
    manifestFileChecksumSha256: string;
    manifestInternalChecksumSha256: string;
    snapshot: string;
  };
  bucket: BucketInfo;
  database: DatabaseInventory;
  plan: ReturnType<typeof summarizeAudioPlan>;
  sourceHead: {
    enabled: boolean;
    verified: number;
    mismatched: number;
    errors: number;
    genericContentType: number;
    byteRangesAdvertised: number;
    finalHosts: Array<{ host: string; count: number }>;
    possibleDuplicateContent: Array<{
      strongEtag: string;
      contentLength: number;
      count: number;
      episodeIds: string[];
    }>;
  };
  transfer: {
    sourceBytes: number;
    sourceGiB: number;
    verificationStrategy: 'source-download-r2-upload-direct-r2-download-sha256';
    fullPasses: 3;
    totalNetworkBytesAtFullVerification: number;
    estimatedHoursAtMbps: Record<string, number>;
    largestTemporaryFileBytes: number;
    stagedExecutionRequired: true;
  };
  counts: {
    total: number;
    uploadThenLink: number;
    verifyExistingLink: number;
    blocked: number;
    remoteMissingBecauseBucketEmpty: number;
  };
  items: ReportItem[];
}

const USAGE = `Usage:
  pnpm migrate:audio:r2 [options]

Options:
  --manifest PATH       RSS manifest (default: private 2026-09-02 backup)
  --report PATH         JSON report outside Git (default: private backup)
  --env PATH            Required private development Supabase environment file
  --head-sources        HEAD-check all source files and redirects without downloading bodies
  --head-concurrency N  Concurrent source HEAD checks, 1-16 (default: 8)
  --account-id ID       Must equal the approved Mukhtalif Cloudflare account
  --bucket NAME         Must equal mukhtalif-audio
  --project-ref REF     Must equal the canonical development Supabase project
  --apply               Locked until the 137 GiB storage/transfer plan is explicitly approved
  --help                Show help

The default mode is read-only. It reads the RSS snapshot and development
Supabase, verifies the Cloudflare account/bucket, and writes a private local
report. It never uploads, deletes, overwrites, or changes a database row.
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
    headSources: false,
    headConcurrency: 8,
    manifestPath: path.join(DEFAULT_BACKUP_DIRECTORY, 'rss-manifest.json'),
    reportPath: path.join(DEFAULT_BACKUP_DIRECTORY, 'audio-r2-dry-run.json'),
    accountId: APPROVED_CLOUDFLARE_ACCOUNT_ID,
    bucket: APPROVED_R2_BUCKET,
    expectedProjectRef: APPROVED_SUPABASE_PROJECT_REF,
  };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--') continue;
    if (flag === '--help' || flag === '-h') result.help = true;
    else if (flag === '--apply') result.apply = true;
    else if (flag === '--head-sources') result.headSources = true;
    else if (flag === '--manifest')
      result.manifestPath = path.resolve(argumentValue(args, index++, flag));
    else if (flag === '--report')
      result.reportPath = path.resolve(argumentValue(args, index++, flag));
    else if (flag === '--env') result.envPath = path.resolve(argumentValue(args, index++, flag));
    else if (flag === '--account-id') result.accountId = argumentValue(args, index++, flag);
    else if (flag === '--bucket') result.bucket = argumentValue(args, index++, flag);
    else if (flag === '--project-ref')
      result.expectedProjectRef = argumentValue(args, index++, flag);
    else if (flag === '--head-concurrency') {
      result.headConcurrency = Number(argumentValue(args, index++, flag));
    } else throw new Error(`Unknown option: ${flag}`);
  }
  if (
    !Number.isInteger(result.headConcurrency) ||
    result.headConcurrency < 1 ||
    result.headConcurrency > 16
  ) {
    throw new Error('--head-concurrency must be an integer between 1 and 16');
  }
  if (result.accountId !== APPROVED_CLOUDFLARE_ACCOUNT_ID) {
    throw new Error('Cloudflare account does not match the approved Mukhtalif development account');
  }
  if (result.bucket !== APPROVED_R2_BUCKET) {
    throw new Error(`R2 bucket must be ${APPROVED_R2_BUCKET}`);
  }
  if (result.expectedProjectRef !== APPROVED_SUPABASE_PROJECT_REF) {
    throw new Error('Supabase project does not match the canonical development project');
  }
  return result;
}

function assertOutsideRepository(value: string, flag: string): void {
  const resolved = path.resolve(value);
  if (resolved === REPOSITORY_ROOT || resolved.startsWith(`${REPOSITORY_ROOT}${path.sep}`)) {
    throw new Error(`${flag} must be outside the Git repository`);
  }
}

async function atomicJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.${process.pid}.${randomBytes(5).toString('hex')}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await rename(temporary, filePath);
  await chmod(filePath, 0o600);
}

async function readDatabaseEpisodes(
  expectedProjectRef: string,
  envPath?: string,
): Promise<{
  projectRef: string;
  episodes: DatabaseEpisode[];
}> {
  if (!envPath || (await stat(envPath)).mode & 0o077)
    throw new Error('--env must name a private development credential file');
  const env = parseEnv(await readFile(envPath, 'utf8'));
  const originValue = env.SUPABASE_URL?.trim();
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!originValue || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in --env');
  }
  const origin = new URL(originValue);
  if (originValue !== `https://${expectedProjectRef}.supabase.co`) {
    throw new Error('SUPABASE_URL must be the exact pinned development HTTPS origin');
  }
  const projectRef = origin.hostname.split('.')[0] ?? '';
  if (projectRef !== expectedProjectRef) {
    throw new Error(
      `Refusing Supabase project ${projectRef || 'unknown'}; expected ${expectedProjectRef}`,
    );
  }
  const url = new URL('/rest/v1/episodes', origin);
  url.searchParams.set('select', 'id,show_id,rss_guid,audio_key,audio_url,source_url');
  url.searchParams.set('limit', '1000');
  const response = await fetch(url, {
    headers: { apikey: key, authorization: `Bearer ${key}` },
  });
  if (!response.ok)
    throw new Error(`Supabase episode inventory failed with HTTP ${response.status}`);
  const episodes = (await response.json()) as DatabaseEpisode[];
  if (episodes.length === 1000) {
    throw new Error(
      'Episode inventory reached the safety page limit; pagination review is required',
    );
  }
  return { projectRef, episodes };
}

interface ProcessResult {
  exitCode: number;
  output: string;
}

async function findWrangler(): Promise<string> {
  const candidate = path.join(REPOSITORY_ROOT, 'apps/api/node_modules/.bin/wrangler');
  try {
    await access(candidate);
    return candidate;
  } catch {
    return 'wrangler';
  }
}

async function runWrangler(
  wrangler: string,
  accountId: string,
  args: string[],
): Promise<ProcessResult> {
  return await new Promise<ProcessResult>((resolve, reject) => {
    const child = spawn(wrangler, args, {
      cwd: REPOSITORY_ROOT,
      env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: accountId, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const chunks: Buffer[] = [];
    let captured = 0;
    const capture = (chunk: Buffer): void => {
      if (captured >= 128_000) return;
      chunks.push(chunk.subarray(0, 128_000 - captured));
      captured += chunk.byteLength;
    };
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);
    child.on('error', reject);
    const timer = setTimeout(() => child.kill('SIGTERM'), 60_000);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        exitCode: code ?? 1,
        output: Buffer.concat(chunks).toString('utf8').replace(ANSI_COLOR_PATTERN, ''),
      });
    });
  });
}

function field(output: string, name: string): string | null {
  return output.match(new RegExp(`^${name}:\\s+(.+)$`, 'm'))?.[1]?.trim() ?? null;
}

async function readBucketInfo(options: CliOptions): Promise<BucketInfo> {
  const wrangler = await findWrangler();
  const result = await runWrangler(wrangler, options.accountId, [
    'r2',
    'bucket',
    'info',
    options.bucket,
  ]);
  if (result.exitCode !== 0) {
    throw new Error('Cloudflare authentication or R2 bucket verification failed');
  }
  const name = field(result.output, 'name');
  const objectCountValue = field(result.output, 'object_count');
  const bucketSize = field(result.output, 'bucket_size');
  if (
    name !== options.bucket ||
    !objectCountValue ||
    !/^\d+$/.test(objectCountValue) ||
    !bucketSize
  ) {
    throw new Error('Cloudflare returned an unexpected R2 bucket-info response');
  }
  return {
    name,
    created: field(result.output, 'created'),
    location: field(result.output, 'location'),
    storageClass: field(result.output, 'default_storage_class'),
    objectCount: Number(objectCountValue),
    bucketSize,
  };
}

function databaseInventory(rows: DatabaseEpisode[]): DatabaseInventory {
  const rssRows = rows.filter((row) => row.rss_guid !== null);
  return {
    totalEpisodes: rows.length,
    rssEpisodes: rssRows.length,
    withAudioUrl: rows.filter((row) => row.audio_url !== null).length,
    withAudioKey: rows.filter((row) => row.audio_key !== null).length,
    rssSourceMatchesAudioUrl: rssRows.filter(
      (row) => row.source_url !== null && row.source_url === row.audio_url,
    ).length,
    rssSourceDiffersFromAudioUrl: rssRows.filter(
      (row) =>
        row.source_url !== null && row.audio_url !== null && row.source_url !== row.audio_url,
    ).length,
  };
}

function possibleDuplicateContent(
  items: ReportItem[],
): DryRunReport['sourceHead']['possibleDuplicateContent'] {
  const groups = new Map<string, ReportItem[]>();
  for (const item of items) {
    if (item.sourceHead.status === 'not-checked') continue;
    const etag = item.sourceHead.etag;
    const length = item.sourceHead.contentLength;
    if (!etag || etag.startsWith('W/') || length === null) continue;
    const key = `${etag}\0${length}`;
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => {
      const separator = key.lastIndexOf('\0');
      return {
        strongEtag: key.slice(0, separator),
        contentLength: Number(key.slice(separator + 1)),
        count: group.length,
        episodeIds: group.map((item) => item.manifestEpisodeId).sort(),
      };
    })
    .sort((left, right) => right.count - left.count);
}

function finalHostCounts(items: ReportItem[]): Array<{ host: string; count: number }> {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.sourceHead.status === 'not-checked' || !item.sourceHead.finalHost) continue;
    counts.set(item.sourceHead.finalHost, (counts.get(item.sourceHead.finalHost) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([host, count]) => ({ host, count }))
    .sort((left, right) => right.count - left.count);
}

function transferHours(bytes: number, megabitsPerSecond: number, passes: number): number {
  return Number(((bytes * 8 * passes) / (megabitsPerSecond * 1_000_000) / 3600).toFixed(2));
}

async function executeDryRun(options: CliOptions): Promise<DryRunReport> {
  const [manifestText, database, bucket] = await Promise.all([
    readFile(options.manifestPath, 'utf8'),
    readDatabaseEpisodes(options.expectedProjectRef, options.envPath),
    readBucketInfo(options),
  ]);
  const manifestValue = JSON.parse(manifestText) as {
    manifestChecksumSha256: string;
    snapshot: string;
  };
  const planItems = buildAudioMigrationPlan(manifestValue, database.episodes);
  const plan = summarizeAudioPlan(planItems);
  let completed = 0;
  const heads = options.headSources
    ? await mapConcurrent(planItems, options.headConcurrency, async (item) => {
        const result = await inspectAudioHead({
          sourceUrl: item.sourceUrl,
          expectedByteSize: item.expectedByteSize,
          expectedMimeType: item.mimeType,
        });
        completed += 1;
        if (completed === planItems.length || completed % 50 === 0) {
          process.stdout.write(`Source HEAD checks: ${completed}/${planItems.length}\n`);
        }
        return result;
      })
    : planItems.map(() => ({ status: 'not-checked' as const }));

  const items: ReportItem[] = planItems.map((item, index) => ({
    ...item,
    sourceHead: heads[index]!,
    r2State: bucket.objectCount === 0 ? 'missing-bucket-empty' : 'not-inspected',
    plannedAction:
      item.databaseState === 'ready'
        ? 'upload-then-link'
        : item.databaseState === 'already-linked'
          ? 'verify-existing-link'
          : 'blocked',
  }));
  const verifiedHeads = items.filter((item) => item.sourceHead.status === 'verified').length;
  const mismatchedHeads = items.filter((item) => item.sourceHead.status === 'mismatch').length;
  const errorHeads = items.filter((item) => item.sourceHead.status === 'error').length;
  const networkBytes = plan.totalBytes * 3;
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode: 'dry-run',
    writesPerformed: false,
    guards: {
      cloudflareAccountId: options.accountId,
      r2Bucket: options.bucket,
      supabaseProjectRef: database.projectRef,
    },
    source: {
      manifestPath: options.manifestPath,
      manifestFileChecksumSha256: createHash('sha256').update(manifestText).digest('hex'),
      manifestInternalChecksumSha256: manifestValue.manifestChecksumSha256,
      snapshot: manifestValue.snapshot,
    },
    bucket,
    database: databaseInventory(database.episodes),
    plan,
    sourceHead: {
      enabled: options.headSources,
      verified: verifiedHeads,
      mismatched: mismatchedHeads,
      errors: errorHeads,
      genericContentType: items.filter(
        (item) =>
          item.sourceHead.status !== 'not-checked' &&
          item.sourceHead.contentType === 'application/octet-stream',
      ).length,
      byteRangesAdvertised: items.filter(
        (item) =>
          item.sourceHead.status !== 'not-checked' &&
          item.sourceHead.acceptRanges?.toLowerCase() === 'bytes',
      ).length,
      finalHosts: finalHostCounts(items),
      possibleDuplicateContent: possibleDuplicateContent(items),
    },
    transfer: {
      sourceBytes: plan.totalBytes,
      sourceGiB: Number((plan.totalBytes / 1024 ** 3).toFixed(2)),
      verificationStrategy: 'source-download-r2-upload-direct-r2-download-sha256',
      fullPasses: 3,
      totalNetworkBytesAtFullVerification: networkBytes,
      estimatedHoursAtMbps: Object.fromEntries(
        [25, 50, 100, 200, 500, 1000].map((speed) => [
          String(speed),
          transferHours(plan.totalBytes, speed, 3),
        ]),
      ),
      largestTemporaryFileBytes: plan.sizeBytes.maximum,
      stagedExecutionRequired: true,
    },
    counts: {
      total: items.length,
      uploadThenLink: items.filter((item) => item.plannedAction === 'upload-then-link').length,
      verifyExistingLink: items.filter((item) => item.plannedAction === 'verify-existing-link')
        .length,
      blocked: items.filter((item) => item.plannedAction === 'blocked').length,
      remoteMissingBecauseBucketEmpty: items.filter(
        (item) => item.r2State === 'missing-bucket-empty',
      ).length,
    },
    items,
  };
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(USAGE);
    return;
  }
  assertOutsideRepository(options.reportPath, '--report');
  try {
    await access(options.reportPath);
    throw new Error('Report already exists; use a new --report path to preserve reviewed evidence');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (options.apply) {
    throw new Error(
      'Audio apply is locked until the user explicitly approves the reviewed 137 GiB storage and transfer plan',
    );
  }
  const report = await executeDryRun(options);
  await atomicJson(options.reportPath, report);
  process.stdout.write(`Report: ${options.reportPath}\n`);
  process.stdout.write(
    `Episodes=${report.counts.total} bytes=${report.transfer.sourceBytes} GiB=${report.transfer.sourceGiB} ` +
      `ready=${report.counts.uploadThenLink} blocked=${report.counts.blocked}\n`,
  );
  if (report.sourceHead.enabled) {
    process.stdout.write(
      `HEAD verified=${report.sourceHead.verified} mismatched=${report.sourceHead.mismatched} errors=${report.sourceHead.errors}\n`,
    );
  }
  if (
    report.counts.blocked > 0 ||
    report.sourceHead.mismatched > 0 ||
    report.sourceHead.errors > 0
  ) {
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `Audio R2 preflight failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
