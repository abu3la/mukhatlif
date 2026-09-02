import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export interface MediaDownloadResult {
  legacyId: number;
  sourceUrl: string;
  finalUrl: string;
  relativePath: string;
  mimeType: string;
  byteSize: number;
  checksumSha256: string;
  disposition: 'downloaded' | 'reused';
  error: null;
}

export interface MediaDownloadReport {
  schemaVersion: number;
  requested: number;
  downloaded: number;
  reused: number;
  failed: number;
  results: MediaDownloadResult[];
}

export interface LocalMediaObject extends MediaDownloadResult {
  absolutePath: string;
  key: string;
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const MIME_PATTERN = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i;
const BUCKET_PATTERN = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;

export function normalizePrefix(value: string): string {
  const prefix = value.replace(/^\/+|\/+$/g, '');
  const segments = prefix.split('/');
  if (
    !prefix ||
    segments.some(
      (segment) => !segment || segment === '.' || segment === '..' || /[\0\r\n]/.test(segment),
    )
  ) {
    throw new Error('The R2 prefix must contain safe, non-empty path segments');
  }
  return prefix;
}

export function validateBucket(value: string): string {
  if (!BUCKET_PATTERN.test(value)) {
    throw new Error('The R2 bucket name is invalid');
  }
  return value;
}

export function objectKey(prefix: string, legacyId: number, relativePath: string): string {
  if (!Number.isSafeInteger(legacyId) || legacyId <= 0) {
    throw new Error(`Invalid WordPress legacy ID: ${String(legacyId)}`);
  }
  const filename = path.posix.basename(relativePath);
  if (!filename || filename === '.' || filename === '..' || /[\\/\0\r\n]/.test(filename)) {
    throw new Error(`Invalid media filename for legacy ID ${legacyId}`);
  }
  return `${normalizePrefix(prefix)}/${legacyId}/${filename}`;
}

export async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

function assertDownloadResult(value: unknown, index: number): asserts value is MediaDownloadResult {
  if (!value || typeof value !== 'object') {
    throw new Error(`Invalid result at index ${index}`);
  }
  const result = value as Partial<MediaDownloadResult>;
  if (!Number.isSafeInteger(result.legacyId) || Number(result.legacyId) <= 0) {
    throw new Error(`Invalid legacyId at result ${index}`);
  }
  if (typeof result.relativePath !== 'string' || !result.relativePath) {
    throw new Error(`Invalid relativePath at result ${index}`);
  }
  if (!MIME_PATTERN.test(result.mimeType ?? '')) {
    throw new Error(`Invalid MIME type at result ${index}`);
  }
  if (!Number.isSafeInteger(result.byteSize) || Number(result.byteSize) < 0) {
    throw new Error(`Invalid byteSize at result ${index}`);
  }
  if (!SHA256_PATTERN.test(result.checksumSha256 ?? '')) {
    throw new Error(`Invalid SHA-256 checksum at result ${index}`);
  }
  if (!['downloaded', 'reused'].includes(result.disposition ?? '') || result.error !== null) {
    throw new Error(`Result ${index} is not a successful media download`);
  }
}

export async function loadAndVerifyMedia(
  reportPath: string,
  prefix: string,
): Promise<{ report: MediaDownloadReport; objects: LocalMediaObject[] }> {
  const raw = await readFile(reportPath, 'utf8');
  const parsed = JSON.parse(raw) as Partial<MediaDownloadReport>;
  if (!Array.isArray(parsed.results)) throw new Error('Download report results must be an array');
  if (parsed.failed !== 0) throw new Error('Download report contains failed items');
  if (parsed.requested !== parsed.results.length) {
    throw new Error('Download report requested count does not match its results');
  }
  if ((parsed.downloaded ?? 0) + (parsed.reused ?? 0) !== parsed.results.length) {
    throw new Error('Download report success counts do not match its results');
  }

  const reportDirectory = path.dirname(reportPath);
  const objects: LocalMediaObject[] = [];
  const keys = new Set<string>();
  for (let index = 0; index < parsed.results.length; index += 1) {
    const result = parsed.results[index];
    assertDownloadResult(result, index);
    if (path.isAbsolute(result.relativePath)) {
      throw new Error(`Absolute relativePath at result ${index}`);
    }
    const absolutePath = path.resolve(reportDirectory, result.relativePath);
    const relativeToReport = path.relative(reportDirectory, absolutePath);
    if (relativeToReport.startsWith('..') || path.isAbsolute(relativeToReport)) {
      throw new Error(`Media path escapes the report directory at result ${index}`);
    }
    const key = objectKey(prefix, result.legacyId, result.relativePath);
    if (keys.has(key)) throw new Error(`Duplicate deterministic R2 key: ${key}`);
    keys.add(key);

    const fileStats = await stat(absolutePath);
    if (!fileStats.isFile()) throw new Error(`Media path is not a file: ${result.relativePath}`);
    if (fileStats.size !== result.byteSize) {
      throw new Error(`Local byte size mismatch for legacy ID ${result.legacyId}`);
    }
    const checksum = await sha256File(absolutePath);
    if (checksum !== result.checksumSha256) {
      throw new Error(`Local checksum mismatch for legacy ID ${result.legacyId}`);
    }
    objects.push({ ...result, absolutePath, key });
  }

  return { report: parsed as MediaDownloadReport, objects };
}

export async function mapConcurrent<T, Result>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<Result>,
): Promise<Result[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error('Concurrency must be a positive integer');
  }
  const results = new Array<Result>(values.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (cursor < values.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await mapper(values[index], index);
      }
    }),
  );
  return results;
}
