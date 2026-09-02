import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access } from 'node:fs/promises';
import { mkdir, mkdtemp, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadAndVerifyMedia,
  mapConcurrent,
  normalizePrefix,
  sha256File,
  validateBucket,
  type LocalMediaObject,
} from './core.ts';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DEFAULT_ACCOUNT_ID = 'bb4abee6bf877ef411dc803b3be96373';
const DEFAULT_BUCKET = 'mukhtalif-media';
const DEFAULT_PREFIX = 'legacy/wordpress';
const DEFAULT_CONCURRENCY = 4;
const ANSI_COLOR_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

interface CliOptions {
  apply: boolean;
  help: boolean;
  sourceReportPath: string;
  outputReportPath: string;
  bucket: string;
  prefix: string;
  concurrency: number;
  accountId: string;
}

type RemoteState =
  | { status: 'missing' }
  | { status: 'verified'; byteSize: number; checksumSha256: string }
  | {
      status: 'mismatch';
      byteSize: number;
      checksumSha256: string;
      expectedByteSize: number;
      expectedChecksumSha256: string;
    }
  | { status: 'error'; message: string };

interface ItemReport {
  legacyId: number;
  key: string;
  mimeType: string;
  byteSize: number;
  checksumSha256: string;
  initialRemote: RemoteState;
  action: 'pending' | 'uploaded' | 'skipped' | 'failed';
  finalRemote: RemoteState;
  error: string | null;
}

interface UploadReport {
  schemaVersion: 1;
  generatedAt: string;
  mode: 'dry-run' | 'apply';
  sourceReportPath: string;
  sourceReportChecksumSha256: string;
  accountId: string;
  bucket: string;
  prefix: string;
  concurrency: number;
  verification: 'direct-r2-download-size-and-sha256';
  counts: {
    total: number;
    pending: number;
    uploaded: number;
    skipped: number;
    verified: number;
    mismatched: number;
    missing: number;
    errors: number;
  };
  totalBytes: number;
  items: ItemReport[];
}

const USAGE = `Usage:
  pnpm tsx tools/wordpress-media-r2/src/cli.ts --source-report PATH --report PATH [options]

Options:
  --source-report PATH  WordPress media-download-report.json snapshot (required)
  --report PATH         Operational JSON report outside Git (required)
  --bucket NAME         R2 bucket (default: mukhtalif-media)
  --prefix PREFIX       Deterministic object prefix (default: legacy/wordpress)
  --account-id ID       Cloudflare account ID (defaults to environment/Mukhtalif)
  --concurrency N       Concurrent Wrangler operations, 1-8 (default: 4)
  --apply               Upload missing or mismatched objects, then verify them
  --help                Show help

Dry-run is the default and never writes to R2. The tool never deletes objects,
writes to a database, or prints credentials.
`;

function argumentValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseArguments(args: string[]): CliOptions {
  let sourceReportPath = '';
  let outputReportPath = '';
  let bucket = DEFAULT_BUCKET;
  let prefix = DEFAULT_PREFIX;
  let concurrency = DEFAULT_CONCURRENCY;
  let accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || DEFAULT_ACCOUNT_ID;
  let apply = false;
  let help = false;

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--') continue;
    if (flag === '--apply') apply = true;
    else if (flag === '--help' || flag === '-h') help = true;
    else if (flag === '--source-report')
      sourceReportPath = path.resolve(argumentValue(args, index++, flag));
    else if (flag === '--report')
      outputReportPath = path.resolve(argumentValue(args, index++, flag));
    else if (flag === '--bucket') bucket = argumentValue(args, index++, flag);
    else if (flag === '--prefix') prefix = argumentValue(args, index++, flag);
    else if (flag === '--account-id') accountId = argumentValue(args, index++, flag);
    else if (flag === '--concurrency') {
      concurrency = Number(argumentValue(args, index++, flag));
    } else throw new Error(`Unknown option: ${flag}`);
  }

  if (!help && !sourceReportPath) throw new Error('--source-report is required');
  if (!help && !outputReportPath) throw new Error('--report is required');
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
    throw new Error('--concurrency must be an integer between 1 and 8');
  }
  if (!/^[a-f0-9]{32}$/i.test(accountId)) throw new Error('Invalid Cloudflare account ID');
  return {
    apply,
    help,
    sourceReportPath,
    outputReportPath,
    bucket: validateBucket(bucket),
    prefix: normalizePrefix(prefix),
    concurrency,
    accountId,
  };
}

interface ProcessResult {
  exitCode: number;
  output: string;
}

async function findWrangler(): Promise<string> {
  const candidate = path.join(REPOSITORY_ROOT, 'node_modules/.bin/wrangler');
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
  timeoutMs = 120_000,
): Promise<ProcessResult> {
  return await new Promise<ProcessResult>((resolve, reject) => {
    const child = spawn(wrangler, args, {
      cwd: REPOSITORY_ROOT,
      env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: accountId, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const chunks: Buffer[] = [];
    let outputBytes = 0;
    const capture = (chunk: Buffer) => {
      if (outputBytes >= 128_000) return;
      chunks.push(chunk.subarray(0, 128_000 - outputBytes));
      outputBytes += chunk.byteLength;
    };
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);
    child.on('error', reject);
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        exitCode: code ?? 1,
        output: Buffer.concat(chunks).toString('utf8').replace(ANSI_COLOR_PATTERN, ''),
      });
    });
  });
}

async function retryDelay(attempt: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, attempt * 350));
}

function safeWranglerError(output: string): string {
  if (/specified key does not exist/i.test(output)) return 'The R2 object does not exist';
  if (/authentication|authorization|not authenticated|unauthorized/i.test(output)) {
    return 'Cloudflare authentication failed';
  }
  if (/timeout|timed out/i.test(output)) return 'The R2 operation timed out';
  const errorLine = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(
      (line) =>
        line &&
        !/^[─━-]+$/.test(line) &&
        !line.startsWith('⛅') &&
        !line.includes('wrangler') &&
        !line.includes('Logs were written'),
    );
  return errorLine ? errorLine.slice(0, 240) : 'Wrangler R2 operation failed';
}

async function inspectRemote(
  wrangler: string,
  options: CliOptions,
  object: LocalMediaObject,
  tempRoot: string,
  suffix: string,
): Promise<RemoteState> {
  const digest = createHash('sha256').update(object.key).digest('hex');
  const destination = path.join(tempRoot, `${digest}-${suffix}`);
  let lastError = 'Wrangler R2 operation failed';
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await rm(destination, { force: true });
    const result = await runWrangler(wrangler, options.accountId, [
      'r2',
      'object',
      'get',
      `${options.bucket}/${object.key}`,
      '--remote',
      '--file',
      destination,
    ]);
    if (result.exitCode === 0) break;
    if (/specified key does not exist/i.test(result.output)) return { status: 'missing' };
    lastError = safeWranglerError(result.output);
    if (attempt === 3) return { status: 'error', message: lastError };
    await retryDelay(attempt);
  }
  const remoteStats = await stat(destination);
  const remoteChecksum = await sha256File(destination);
  await rm(destination, { force: true });
  if (remoteStats.size === object.byteSize && remoteChecksum === object.checksumSha256) {
    return { status: 'verified', byteSize: remoteStats.size, checksumSha256: remoteChecksum };
  }
  return {
    status: 'mismatch',
    byteSize: remoteStats.size,
    checksumSha256: remoteChecksum,
    expectedByteSize: object.byteSize,
    expectedChecksumSha256: object.checksumSha256,
  };
}

async function uploadObject(
  wrangler: string,
  options: CliOptions,
  object: LocalMediaObject,
): Promise<{ ok: true } | { ok: false; message: string }> {
  let message = 'Wrangler R2 operation failed';
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = await runWrangler(wrangler, options.accountId, [
      'r2',
      'object',
      'put',
      `${options.bucket}/${object.key}`,
      '--remote',
      '--force',
      '--file',
      object.absolutePath,
      '--content-type',
      object.mimeType,
    ]);
    if (result.exitCode === 0) return { ok: true };
    message = safeWranglerError(result.output);
    if (attempt < 3) await retryDelay(attempt);
  }
  return { ok: false, message };
}

async function assertBucketExists(wrangler: string, options: CliOptions): Promise<void> {
  const result = await runWrangler(wrangler, options.accountId, ['r2', 'bucket', 'list']);
  if (result.exitCode !== 0) throw new Error(safeWranglerError(result.output));
  const names = [...result.output.matchAll(/^name:\s+(.+)$/gm)].map((match) => match[1].trim());
  if (!names.includes(options.bucket)) {
    throw new Error(`R2 bucket ${options.bucket} was not found in the selected account`);
  }
}

async function atomicJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await rename(temporary, filePath);
}

function summarize(options: CliOptions, items: ItemReport[], sourceChecksum: string): UploadReport {
  const remoteStates = items.map((item) => item.finalRemote);
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode: options.apply ? 'apply' : 'dry-run',
    sourceReportPath: options.sourceReportPath,
    sourceReportChecksumSha256: sourceChecksum,
    accountId: options.accountId,
    bucket: options.bucket,
    prefix: options.prefix,
    concurrency: options.concurrency,
    verification: 'direct-r2-download-size-and-sha256',
    counts: {
      total: items.length,
      pending: items.filter((item) => item.action === 'pending').length,
      uploaded: items.filter((item) => item.action === 'uploaded').length,
      skipped: items.filter((item) => item.action === 'skipped').length,
      verified: remoteStates.filter((state) => state.status === 'verified').length,
      mismatched: remoteStates.filter((state) => state.status === 'mismatch').length,
      missing: remoteStates.filter((state) => state.status === 'missing').length,
      errors: items.filter(
        (item) => item.action === 'failed' || item.finalRemote.status === 'error',
      ).length,
    },
    totalBytes: items.reduce((total, item) => total + item.byteSize, 0),
    items,
  };
}

function progress(label: string, completed: number, total: number): void {
  if (completed === total || completed % 25 === 0) {
    console.log(`${label}: ${completed}/${total}`);
  }
}

async function execute(options: CliOptions): Promise<UploadReport> {
  const wrangler = await findWrangler();
  await assertBucketExists(wrangler, options);
  console.log('Verifying the local WordPress snapshot...');
  const { objects } = await loadAndVerifyMedia(options.sourceReportPath, options.prefix);
  const sourceChecksum = await sha256File(options.sourceReportPath);
  console.log(`Local snapshot verified: ${objects.length} objects`);

  const tempRoot = await mkdtemp(path.join(tmpdir(), 'mukhtalif-r2-verify-'));
  try {
    let inspected = 0;
    const initial = await mapConcurrent(objects, options.concurrency, async (object) => {
      const state = await inspectRemote(wrangler, options, object, tempRoot, 'initial');
      inspected += 1;
      progress('Remote inspection', inspected, objects.length);
      return state;
    });

    if (!options.apply) {
      const items = objects.map<ItemReport>((object, index) => {
        const state = initial[index];
        const failed = state.status === 'error';
        return {
          legacyId: object.legacyId,
          key: object.key,
          mimeType: object.mimeType,
          byteSize: object.byteSize,
          checksumSha256: object.checksumSha256,
          initialRemote: state,
          action: failed ? 'failed' : state.status === 'verified' ? 'skipped' : 'pending',
          finalRemote: state,
          error: failed ? state.message : null,
        };
      });
      return summarize(options, items, sourceChecksum);
    }

    const plannedUploads = initial.filter(
      (state) => state.status === 'missing' || state.status === 'mismatch',
    ).length;
    let uploaded = 0;
    const uploadResults = await mapConcurrent(
      objects,
      options.concurrency,
      async (object, index) => {
        const state = initial[index];
        if (state.status === 'verified') return { status: 'skipped' as const };
        if (state.status === 'error') return { status: 'failed' as const, message: state.message };
        const result = await uploadObject(wrangler, options, object);
        uploaded += 1;
        progress('R2 uploads attempted', uploaded, plannedUploads);
        return result.ok
          ? { status: 'uploaded' as const }
          : { status: 'failed' as const, message: result.message };
      },
    );

    const plannedVerifications = uploadResults.filter(
      (result) => result.status === 'uploaded',
    ).length;
    let verified = 0;
    const final = await mapConcurrent(objects, options.concurrency, async (object, index) => {
      const upload = uploadResults[index];
      if (upload.status === 'failed') {
        return { status: 'error' as const, message: upload.message };
      }
      if (upload.status === 'skipped') return initial[index];
      const state = await inspectRemote(wrangler, options, object, tempRoot, 'final');
      verified += 1;
      progress('Post-upload verification', verified, plannedVerifications);
      return state;
    });

    const items = objects.map<ItemReport>((object, index) => {
      const upload = uploadResults[index];
      const finalState = final[index];
      const valid = finalState.status === 'verified';
      const message =
        upload.status === 'failed'
          ? upload.message
          : valid
            ? null
            : finalState.status === 'error'
              ? finalState.message
              : `Post-upload verification ended with ${finalState.status}`;
      return {
        legacyId: object.legacyId,
        key: object.key,
        mimeType: object.mimeType,
        byteSize: object.byteSize,
        checksumSha256: object.checksumSha256,
        initialRemote: initial[index],
        action: valid ? upload.status : 'failed',
        finalRemote: finalState,
        error: message,
      };
    });
    return summarize(options, items, sourceChecksum);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
    return;
  }
  if (path.resolve(options.outputReportPath).startsWith(`${REPOSITORY_ROOT}${path.sep}`)) {
    throw new Error('--report must be outside the Git repository');
  }
  const report = await execute(options);
  await atomicJson(options.outputReportPath, report);
  console.log(`Report: ${options.outputReportPath}`);
  console.log(JSON.stringify(report.counts));
  if (
    report.counts.errors > 0 ||
    (options.apply && report.counts.verified !== report.counts.total)
  ) {
    process.exitCode = 1;
  }
}

main().catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`WordPress media R2 migration failed: ${message}`);
  process.exitCode = 1;
});
