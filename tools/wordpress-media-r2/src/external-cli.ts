import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { access } from 'node:fs/promises';
import {
  chmod,
  link,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { request } from 'node:https';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  externalKey,
  extractExternalImages,
  inspectImage,
  isPublicIp,
  safeWebUrl,
  type ExternalImageCandidate,
  type ImageMetadata,
} from './external-core.ts';
import { mapConcurrent, sha256File, validateBucket } from './core.ts';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DEFAULT_ACCOUNT_ID = 'bb4abee6bf877ef411dc803b3be96373';
const DEFAULT_BUCKET = 'mukhtalif-media';
const DEFAULT_CONCURRENCY = 3;
const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;
const ANSI_COLOR_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

interface CliOptions {
  apply: boolean;
  help: boolean;
  manifestPath: string;
  backupDirectory: string;
  reportPath: string;
  bucket: string;
  concurrency: number;
  accountId: string;
}

interface LocalImage {
  path: string;
  finalUrl: string | null;
  mimeType: ImageMetadata['mimeType'];
  byteSize: number;
  checksumSha256: string;
  width: number;
  height: number;
}

type LocalState =
  | { status: 'missing' }
  | ({ status: 'verified' } & LocalImage)
  | { status: 'error'; message: string };

type RemoteState =
  | { status: 'missing' }
  | { status: 'verified'; byteSize: number; checksumSha256: string }
  | { status: 'mismatch'; byteSize: number; checksumSha256: string }
  | { status: 'not-checked' }
  | { status: 'error'; message: string };

interface ItemReport {
  sourceUrl: string;
  urlSha256: string;
  filename: string;
  key: string;
  usages: ExternalImageCandidate['usages'];
  local: LocalState;
  localAction: 'pending' | 'downloaded' | 'reused' | 'failed';
  remote: RemoteState;
  r2Action: 'pending' | 'uploaded' | 'skipped' | 'failed';
  error: string | null;
}

interface ExternalMediaReport {
  schemaVersion: 1;
  generatedAt: string;
  mode: 'dry-run' | 'apply';
  manifestPath: string;
  manifestChecksumSha256: string;
  backupDirectory: string;
  accountId: string;
  bucket: string;
  prefix: 'legacy/wordpress/external';
  extraction: Omit<ReturnType<typeof extractExternalImages>, 'candidates'>;
  verification: 'direct-r2-download-size-and-sha256';
  counts: {
    total: number;
    pending: number;
    downloaded: number;
    reused: number;
    uploaded: number;
    skipped: number;
    verified: number;
    errors: number;
  };
  totalBytes: number;
  mapping: Record<
    string,
    {
      key: string;
      mimeType: string;
      byteSize: number;
      checksumSha256: string;
      width: number;
      height: number;
    }
  >;
  items: ItemReport[];
}

const USAGE = `Usage:
  pnpm tsx tools/wordpress-media-r2/src/external-cli.ts \\
    --manifest PATH --backup-dir PATH --report PATH [options]

Options:
  --manifest PATH      wordpress-manifest.json (required)
  --backup-dir PATH    Private external-media backup directory outside Git (required)
  --report PATH        Operational JSON report outside Git (required)
  --bucket NAME        R2 bucket (default: mukhtalif-media)
  --account-id ID      Cloudflare account ID (defaults to environment/Mukhtalif)
  --concurrency N      Concurrent download/R2 operations, 1-4 (default: 3)
  --apply              Download approved HTTPS images, save, upload, and verify
  --help               Show help

Dry-run is the default. Only approved mcusercontent.com source URLs are eligible.
Redirects must remain credential-free HTTPS and resolve exclusively to public IPs.
No database, migration, article, or existing R2 object is deleted.
`;

function argumentValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseArguments(args: string[]): CliOptions {
  let manifestPath = '';
  let backupDirectory = '';
  let reportPath = '';
  let bucket = DEFAULT_BUCKET;
  let concurrency = DEFAULT_CONCURRENCY;
  let accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || DEFAULT_ACCOUNT_ID;
  let apply = false;
  let help = false;
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--') continue;
    if (flag === '--apply') apply = true;
    else if (flag === '--help' || flag === '-h') help = true;
    else if (flag === '--manifest') manifestPath = path.resolve(argumentValue(args, index++, flag));
    else if (flag === '--backup-dir')
      backupDirectory = path.resolve(argumentValue(args, index++, flag));
    else if (flag === '--report') reportPath = path.resolve(argumentValue(args, index++, flag));
    else if (flag === '--bucket') bucket = argumentValue(args, index++, flag);
    else if (flag === '--account-id') accountId = argumentValue(args, index++, flag);
    else if (flag === '--concurrency') concurrency = Number(argumentValue(args, index++, flag));
    else throw new Error(`Unknown option: ${flag}`);
  }
  if (!help && (!manifestPath || !backupDirectory || !reportPath)) {
    throw new Error('--manifest, --backup-dir, and --report are required');
  }
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) {
    throw new Error('--concurrency must be an integer between 1 and 4');
  }
  if (!/^[a-f0-9]{32}$/i.test(accountId)) throw new Error('Invalid Cloudflare account ID');
  return {
    apply,
    help,
    manifestPath,
    backupDirectory,
    reportPath,
    bucket: validateBucket(bucket),
    concurrency,
    accountId,
  };
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

async function publicAddress(hostnameValue: string): Promise<{ address: string; family: 4 | 6 }> {
  const hostname = hostnameValue.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    !hostname ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new Error('External image host is not public');
  }
  const literalVersion = isPublicIp(hostname) ? (hostname.includes(':') ? 6 : 4) : 0;
  if (literalVersion) return { address: hostname, family: literalVersion };
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => !isPublicIp(entry.address))) {
    throw new Error('External image host resolved to a non-public address');
  }
  const preferred = addresses.find((entry) => entry.family === 4) ?? addresses[0];
  return { address: preferred.address, family: preferred.family as 4 | 6 };
}

interface DownloadResult {
  bytes: Buffer;
  finalUrl: string;
  headerMimeType: string | null;
}

async function downloadOnce(url: URL): Promise<{
  statusCode: number;
  location: string | null;
  bytes: Buffer;
  headerMimeType: string | null;
}> {
  const pinned = await publicAddress(url.hostname);
  return await new Promise((resolve, reject) => {
    let settled = false;
    const finishReject = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const outgoing = request(
      {
        protocol: 'https:',
        hostname: pinned.address,
        family: pinned.family,
        port: url.port ? Number.parseInt(url.port, 10) : 443,
        path: `${url.pathname}${url.search}`,
        servername: url.hostname,
        method: 'GET',
        headers: {
          host: url.host,
          accept: 'image/png,image/jpeg,image/webp,image/gif',
          'accept-encoding': 'identity',
          'user-agent': 'Mukhtalif-WordPress-Media-Migration/1.0',
        },
      },
      (response) => {
        const statusCode = response.statusCode ?? 0;
        const location =
          typeof response.headers.location === 'string' ? response.headers.location : null;
        const contentEncoding = response.headers['content-encoding'];
        if (contentEncoding && contentEncoding !== 'identity') {
          response.resume();
          finishReject(new Error('Compressed external image responses are not accepted'));
          return;
        }
        const declaredLength = Number(response.headers['content-length'] ?? 0);
        if (Number.isFinite(declaredLength) && declaredLength > MAX_DOWNLOAD_BYTES) {
          response.resume();
          finishReject(new Error('External image exceeds the 25 MiB limit'));
          return;
        }
        if ([301, 302, 303, 307, 308].includes(statusCode)) {
          response.resume();
          if (!settled) {
            settled = true;
            resolve({ statusCode, location, bytes: Buffer.alloc(0), headerMimeType: null });
          }
          return;
        }
        if (statusCode !== 200) {
          response.resume();
          finishReject(new Error(`External image returned HTTP ${statusCode}`));
          return;
        }
        const chunks: Buffer[] = [];
        let total = 0;
        response.on('data', (chunk: Buffer) => {
          total += chunk.byteLength;
          if (total > MAX_DOWNLOAD_BYTES) {
            response.destroy(new Error('External image exceeds the 25 MiB limit'));
            return;
          }
          chunks.push(chunk);
        });
        response.on('error', finishReject);
        response.on('end', () => {
          if (settled) return;
          settled = true;
          const rawContentType = response.headers['content-type'];
          const headerMimeType =
            typeof rawContentType === 'string'
              ? (rawContentType.split(';')[0]?.trim().toLowerCase() ?? null)
              : null;
          resolve({
            statusCode,
            location: null,
            bytes: Buffer.concat(chunks, total),
            headerMimeType,
          });
        });
      },
    );
    outgoing.setTimeout(30_000, () =>
      outgoing.destroy(new Error('External image request timed out')),
    );
    outgoing.on('error', finishReject);
    outgoing.end();
  });
}

async function downloadHttps(sourceUrl: string): Promise<DownloadResult> {
  let current = safeWebUrl(sourceUrl, true);
  if (!current) throw new Error('External image URL must be credential-free HTTPS');
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const result = await downloadOnce(current);
    if (![301, 302, 303, 307, 308].includes(result.statusCode)) {
      return {
        bytes: result.bytes,
        finalUrl: current.toString(),
        headerMimeType: result.headerMimeType,
      };
    }
    if (!result.location) throw new Error('External image redirect has no Location');
    const next = safeWebUrl(new URL(result.location, current).toString(), true);
    if (!next) throw new Error('External image redirect is not credential-free HTTPS');
    current = next;
  }
  throw new Error('External image exceeded five redirects');
}

function localPath(options: CliOptions, candidate: ExternalImageCandidate): string {
  return path.join(options.backupDirectory, candidate.urlSha256, candidate.filename);
}

async function inspectLocal(
  options: CliOptions,
  candidate: ExternalImageCandidate,
): Promise<LocalState> {
  const destination = localPath(options, candidate);
  let fileStats;
  try {
    fileStats = await stat(destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { status: 'missing' };
    return { status: 'error', message: 'External backup could not be inspected' };
  }
  try {
    if (!fileStats.isFile() || fileStats.size > MAX_DOWNLOAD_BYTES) {
      throw new Error('External backup is not a valid bounded file');
    }
    const bytes = await readFile(destination);
    const metadata = inspectImage(bytes);
    const expectedMimeType = externalKey(candidate.sourceUrl).mimeType;
    if (metadata.mimeType !== expectedMimeType) {
      throw new Error('External backup MIME does not match the source filename');
    }
    return {
      status: 'verified',
      path: destination,
      finalUrl: null,
      mimeType: metadata.mimeType,
      byteSize: bytes.byteLength,
      checksumSha256: createHash('sha256').update(bytes).digest('hex'),
      width: metadata.width,
      height: metadata.height,
    };
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : String(error) };
  }
}

async function saveDownloaded(
  options: CliOptions,
  candidate: ExternalImageCandidate,
): Promise<LocalState> {
  const result = await downloadHttps(candidate.sourceUrl);
  if (!result.bytes.length) throw new Error('External image response was empty');
  const metadata = inspectImage(result.bytes);
  const expectedMimeType = externalKey(candidate.sourceUrl).mimeType;
  if (metadata.mimeType !== expectedMimeType) {
    throw new Error('External image bytes do not match the source filename MIME');
  }
  if (result.headerMimeType && result.headerMimeType !== metadata.mimeType) {
    throw new Error('External image Content-Type does not match its bytes');
  }
  const destination = localPath(options, candidate);
  await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  const temporary = `${destination}.${process.pid}.${randomBytes(5).toString('hex')}.tmp`;
  await writeFile(temporary, result.bytes, { flag: 'wx', mode: 0o600 });
  try {
    // An atomic hard link refuses to replace a backup that appeared after the
    // initial missing-file check. Existing snapshots are never overwritten.
    await link(temporary, destination);
    await chmod(destination, 0o600);
  } finally {
    await rm(temporary, { force: true });
  }
  return {
    status: 'verified',
    path: destination,
    finalUrl: result.finalUrl,
    mimeType: metadata.mimeType,
    byteSize: result.bytes.byteLength,
    checksumSha256: createHash('sha256').update(result.bytes).digest('hex'),
    width: metadata.width,
    height: metadata.height,
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
  options: CliOptions,
  args: string[],
): Promise<ProcessResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn(wrangler, args, {
      cwd: REPOSITORY_ROOT,
      env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: options.accountId, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const chunks: Buffer[] = [];
    let total = 0;
    const capture = (chunk: Buffer) => {
      if (total >= 128_000) return;
      chunks.push(chunk.subarray(0, 128_000 - total));
      total += chunk.byteLength;
    };
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);
    child.on('error', reject);
    const timer = setTimeout(() => child.kill('SIGTERM'), 120_000);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        exitCode: code ?? 1,
        output: Buffer.concat(chunks).toString('utf8').replace(ANSI_COLOR_PATTERN, ''),
      });
    });
  });
}

function safeWranglerError(output: string): string {
  if (/specified key does not exist/i.test(output)) return 'The R2 object does not exist';
  if (/authentication|authorization|not authenticated|unauthorized/i.test(output)) {
    return 'Cloudflare authentication failed';
  }
  const line = output
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find(
      (entry) =>
        entry &&
        !/^[─━-]+$/.test(entry) &&
        !entry.startsWith('⛅') &&
        !entry.includes('wrangler') &&
        !entry.includes('Logs were written'),
    );
  return line?.slice(0, 240) ?? 'Wrangler R2 operation failed';
}

async function retryDelay(attempt: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, attempt * 350));
}

async function inspectRemote(
  wrangler: string,
  options: CliOptions,
  candidate: ExternalImageCandidate,
  local: LocalImage,
  tempRoot: string,
): Promise<RemoteState> {
  const destination = path.join(tempRoot, candidate.urlSha256);
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await rm(destination, { force: true });
    const result = await runWrangler(wrangler, options, [
      'r2',
      'object',
      'get',
      `${options.bucket}/${candidate.key}`,
      '--remote',
      '--file',
      destination,
    ]);
    if (result.exitCode === 0) {
      const fileStats = await stat(destination);
      const checksumSha256 = await sha256File(destination);
      await rm(destination, { force: true });
      if (fileStats.size === local.byteSize && checksumSha256 === local.checksumSha256) {
        return { status: 'verified', byteSize: fileStats.size, checksumSha256 };
      }
      return { status: 'mismatch', byteSize: fileStats.size, checksumSha256 };
    }
    if (/specified key does not exist/i.test(result.output)) return { status: 'missing' };
    if (attempt === 3) return { status: 'error', message: safeWranglerError(result.output) };
    await retryDelay(attempt);
  }
  return { status: 'error', message: 'R2 inspection failed' };
}

async function uploadRemote(
  wrangler: string,
  options: CliOptions,
  candidate: ExternalImageCandidate,
  local: LocalImage,
): Promise<{ ok: true } | { ok: false; message: string }> {
  let message = 'Wrangler R2 operation failed';
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = await runWrangler(wrangler, options, [
      'r2',
      'object',
      'put',
      `${options.bucket}/${candidate.key}`,
      '--remote',
      '--force',
      '--file',
      local.path,
      '--content-type',
      local.mimeType,
    ]);
    if (result.exitCode === 0) return { ok: true };
    message = safeWranglerError(result.output);
    if (attempt < 3) await retryDelay(attempt);
  }
  return { ok: false, message };
}

async function assertBucketExists(wrangler: string, options: CliOptions): Promise<void> {
  const result = await runWrangler(wrangler, options, ['r2', 'bucket', 'list']);
  if (result.exitCode !== 0) throw new Error(safeWranglerError(result.output));
  const names = [...result.output.matchAll(/^name:\s+(.+)$/gm)].map((match) => match[1].trim());
  if (!names.includes(options.bucket)) throw new Error(`R2 bucket ${options.bucket} was not found`);
}

function makeReport(
  options: CliOptions,
  extraction: ReturnType<typeof extractExternalImages>,
  manifestChecksumSha256: string,
  items: ItemReport[],
): ExternalMediaReport {
  const mapping: ExternalMediaReport['mapping'] = {};
  for (const item of items) {
    if (item.local.status !== 'verified' || item.remote.status !== 'verified') continue;
    mapping[item.sourceUrl] = {
      key: item.key,
      mimeType: item.local.mimeType,
      byteSize: item.local.byteSize,
      checksumSha256: item.local.checksumSha256,
      width: item.local.width,
      height: item.local.height,
    };
  }
  const extractionSummary: Omit<typeof extraction, 'candidates'> = {
    articleCount: extraction.articleCount,
    articlesWithInlineImages: extraction.articlesWithInlineImages,
    inlineImageOccurrences: extraction.inlineImageOccurrences,
    wxrMappedOccurrences: extraction.wxrMappedOccurrences,
    unresolvedOccurrences: extraction.unresolvedOccurrences,
    uniqueExternalUrls: extraction.uniqueExternalUrls,
    rejected: extraction.rejected,
  };
  const errors = extraction.rejected.length + items.filter((item) => item.error !== null).length;
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode: options.apply ? 'apply' : 'dry-run',
    manifestPath: options.manifestPath,
    manifestChecksumSha256,
    backupDirectory: options.backupDirectory,
    accountId: options.accountId,
    bucket: options.bucket,
    prefix: 'legacy/wordpress/external',
    extraction: extractionSummary,
    verification: 'direct-r2-download-size-and-sha256',
    counts: {
      total: items.length,
      pending: items.filter((item) => item.localAction === 'pending' || item.r2Action === 'pending')
        .length,
      downloaded: items.filter((item) => item.localAction === 'downloaded').length,
      reused: items.filter((item) => item.localAction === 'reused').length,
      uploaded: items.filter((item) => item.r2Action === 'uploaded').length,
      skipped: items.filter((item) => item.r2Action === 'skipped').length,
      verified: items.filter((item) => item.remote.status === 'verified').length,
      errors,
    },
    totalBytes: items.reduce(
      (total, item) => total + (item.local.status === 'verified' ? item.local.byteSize : 0),
      0,
    ),
    mapping,
    items,
  };
}

async function execute(options: CliOptions): Promise<ExternalMediaReport> {
  const manifestText = await readFile(options.manifestPath, 'utf8');
  const extraction = extractExternalImages(JSON.parse(manifestText));
  const manifestChecksumSha256 = createHash('sha256').update(manifestText).digest('hex');
  console.log(
    `Inline images: ${extraction.inlineImageOccurrences}; WXR mapped: ${extraction.wxrMappedOccurrences}; external unique: ${extraction.uniqueExternalUrls}`,
  );

  const wrangler = await findWrangler();
  await assertBucketExists(wrangler, options);
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'mukhtalif-external-r2-'));
  try {
    let completed = 0;
    const items = await mapConcurrent(
      extraction.candidates,
      options.concurrency,
      async (candidate): Promise<ItemReport> => {
        let local = await inspectLocal(options, candidate);
        let localAction: ItemReport['localAction'] =
          local.status === 'verified'
            ? 'reused'
            : local.status === 'missing'
              ? 'pending'
              : 'failed';
        let remote: RemoteState = { status: 'not-checked' };
        let r2Action: ItemReport['r2Action'] = 'pending';
        let error: string | null = local.status === 'error' ? local.message : null;

        if (options.apply && local.status === 'missing') {
          try {
            local = await saveDownloaded(options, candidate);
            localAction = 'downloaded';
          } catch (downloadError) {
            local = {
              status: 'error',
              message:
                downloadError instanceof Error ? downloadError.message : String(downloadError),
            };
            localAction = 'failed';
            error = local.message;
          }
        }

        if (local.status === 'verified') {
          remote = await inspectRemote(wrangler, options, candidate, local, tempRoot);
          if (options.apply && (remote.status === 'missing' || remote.status === 'mismatch')) {
            const upload = await uploadRemote(wrangler, options, candidate, local);
            if (upload.ok) {
              remote = await inspectRemote(wrangler, options, candidate, local, tempRoot);
              r2Action = remote.status === 'verified' ? 'uploaded' : 'failed';
              if (remote.status !== 'verified') {
                error =
                  remote.status === 'error'
                    ? remote.message
                    : `Post-upload verification ended with ${remote.status}`;
              }
            } else {
              remote = { status: 'error', message: upload.message };
              r2Action = 'failed';
              error = upload.message;
            }
          } else if (remote.status === 'verified') {
            r2Action = 'skipped';
          } else if (remote.status === 'error') {
            r2Action = 'failed';
            error = remote.message;
          }
        }

        completed += 1;
        if (completed === extraction.candidates.length || completed % 5 === 0) {
          console.log(`External media processed: ${completed}/${extraction.candidates.length}`);
        }
        return {
          sourceUrl: candidate.sourceUrl,
          urlSha256: candidate.urlSha256,
          filename: candidate.filename,
          key: candidate.key,
          usages: candidate.usages,
          local,
          localAction,
          remote,
          r2Action,
          error,
        };
      },
    );
    return makeReport(options, extraction, manifestChecksumSha256, items);
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
  assertOutsideRepository(options.backupDirectory, '--backup-dir');
  assertOutsideRepository(options.reportPath, '--report');
  const report = await execute(options);
  await atomicJson(options.reportPath, report);
  console.log(`Report: ${options.reportPath}`);
  console.log(JSON.stringify(report.counts));
  if (
    report.counts.errors > 0 ||
    (options.apply && report.counts.verified !== report.counts.total)
  ) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(
    `External WordPress media migration failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
