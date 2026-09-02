import { createHash } from 'node:crypto';
import { mkdir, open, readFile, rename, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { checksumObject, omitChecksum } from './hash.ts';
import type {
  MediaDownloadReport,
  MediaDownloadResult,
  MediaReconciliation,
  RestMediaRecord,
  WordPressManifest,
} from './types.ts';

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function optionalNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function rendered(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  return optionalString((value as Record<string, unknown>).rendered);
}

export function parseRestMediaManifest(value: unknown): RestMediaRecord[] {
  if (!Array.isArray(value)) throw new Error('REST media manifest must be a JSON array');
  const result: RestMediaRecord[] = [];
  for (const [index, item] of value.entries()) {
    if (!item || typeof item !== 'object') {
      throw new Error(`REST media record ${index} must be an object`);
    }
    const record = item as Record<string, unknown>;
    const id = optionalNumber(record.id);
    const sourceUrl = optionalString(record.source_url);
    if (id === null || !Number.isInteger(id) || !sourceUrl) {
      throw new Error(`REST media record ${index} is missing id or source_url`);
    }
    const details =
      record.media_details && typeof record.media_details === 'object'
        ? (record.media_details as Record<string, unknown>)
        : {};
    result.push({
      id,
      sourceUrl,
      mimeType: optionalString(record.mime_type),
      altText: optionalString(record.alt_text),
      captionHtml: rendered(record.caption),
      width: optionalNumber(details.width),
      height: optionalNumber(details.height),
      byteSize: optionalNumber(details.filesize),
      originalPath: optionalString(details.file),
    });
  }
  return result.sort((left, right) => left.id - right.id);
}

export function reconcileRestMedia(
  manifest: WordPressManifest,
  restRecords: RestMediaRecord[],
): MediaReconciliation {
  const wxrIds = new Set(manifest.candidates.attachment.map((record) => record.legacyId));
  const restIds = new Set(restRecords.map((record) => record.id));
  return {
    wxrCount: wxrIds.size,
    restCount: restIds.size,
    matchedCount: [...wxrIds].filter((id) => restIds.has(id)).length,
    missingFromRest: [...wxrIds].filter((id) => !restIds.has(id)).sort((a, b) => a - b),
    missingFromWxr: [...restIds].filter((id) => !wxrIds.has(id)).sort((a, b) => a - b),
  };
}

export function mergeRestMedia(
  manifest: WordPressManifest,
  restRecords: RestMediaRecord[],
): WordPressManifest {
  const byId = new Map(restRecords.map((record) => [record.id, record]));
  const attachments = manifest.candidates.attachment.map((record) => {
    const rest = byId.get(record.legacyId);
    if (!rest || !record.media) return record;
    const media = {
      source: 'wxr+rest' as const,
      sourceUrl: rest.sourceUrl,
      attachedFile: rest.originalPath ?? record.media.attachedFile,
      mimeType: rest.mimeType ?? record.media.mimeType,
      altText: rest.altText ?? record.media.altText,
      captionHtml: rest.captionHtml ?? record.media.captionHtml,
      width: rest.width,
      height: rest.height,
      byteSize: rest.byteSize,
    };
    const withoutChecksum = omitChecksum(record);
    const updated = { ...withoutChecksum, media };
    return { ...updated, checksumSha256: checksumObject(updated) };
  });
  const withoutChecksum = omitChecksum(manifest);
  const updated = {
    ...withoutChecksum,
    candidates: { ...manifest.candidates, attachment: attachments },
  };
  return {
    ...updated,
    checksumSha256: checksumObject(updated),
  };
}

function safeFileName(sourceUrl: string): string {
  const url = new URL(sourceUrl);
  const rawName = path.basename(url.pathname);
  let decoded = rawName;
  try {
    decoded = decodeURIComponent(rawName);
  } catch {
    decoded = rawName;
  }
  const safe = decoded
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^\.+/, '')
    .slice(0, 180);
  return safe || 'media.bin';
}

async function fileChecksum(filePath: string): Promise<{ byteSize: number; sha256: string }> {
  const data = await readFile(filePath);
  return { byteSize: data.byteLength, sha256: createHash('sha256').update(data).digest('hex') };
}

async function reusable(
  outputDirectory: string,
  previous: MediaDownloadResult | undefined,
): Promise<MediaDownloadResult | null> {
  if (!previous?.relativePath || !previous.checksumSha256 || previous.disposition === 'failed') {
    return null;
  }
  const target = path.join(outputDirectory, previous.relativePath);
  try {
    const current = await fileChecksum(target);
    if (current.sha256 !== previous.checksumSha256 || current.byteSize !== previous.byteSize)
      return null;
    return { ...previous, disposition: 'reused', error: null };
  } catch {
    return null;
  }
}

async function downloadOne(
  record: { legacyId: number; sourceUrl: string },
  outputDirectory: string,
  fetcher: typeof fetch,
  maximumBytes: number,
): Promise<MediaDownloadResult> {
  const source = new URL(record.sourceUrl);
  if (source.protocol !== 'https:' || source.username || source.password) {
    return {
      legacyId: record.legacyId,
      sourceUrl: record.sourceUrl,
      finalUrl: null,
      relativePath: null,
      mimeType: null,
      byteSize: null,
      checksumSha256: null,
      disposition: 'failed',
      error: 'Only credential-free HTTPS media URLs are allowed',
    };
  }
  const relativePath = path.join(
    'media',
    'originals',
    String(record.legacyId),
    safeFileName(source.href),
  );
  const target = path.join(outputDirectory, relativePath);
  const temporary = `${target}.partial`;
  try {
    const response = await fetcher(source, { redirect: 'follow' });
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
    const declaredLength = Number.parseInt(response.headers.get('content-length') ?? '', 10);
    if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
      throw new Error(`Content-Length ${declaredLength} exceeds ${maximumBytes} bytes`);
    }
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    const handle = await open(temporary, 'w', 0o600);
    const hash = createHash('sha256');
    let byteSize = 0;
    try {
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        byteSize += chunk.byteLength;
        if (byteSize > maximumBytes) throw new Error(`Download exceeds ${maximumBytes} bytes`);
        hash.update(chunk);
        await handle.write(chunk);
      }
    } finally {
      await handle.close();
    }
    await rename(temporary, target);
    return {
      legacyId: record.legacyId,
      sourceUrl: record.sourceUrl,
      finalUrl: response.url || record.sourceUrl,
      relativePath,
      mimeType: response.headers.get('content-type'),
      byteSize,
      checksumSha256: hash.digest('hex'),
      disposition: 'downloaded',
      error: null,
    };
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    return {
      legacyId: record.legacyId,
      sourceUrl: record.sourceUrl,
      finalUrl: null,
      relativePath: null,
      mimeType: null,
      byteSize: null,
      checksumSha256: null,
      disposition: 'failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function downloadWordPressMedia(options: {
  manifest: WordPressManifest;
  outputDirectory: string;
  previousReport?: MediaDownloadReport | null;
  concurrency?: number;
  maximumBytesPerFile?: number;
  fetcher?: typeof fetch;
}): Promise<MediaDownloadReport> {
  const records = options.manifest.candidates.attachment
    .filter((record) => record.media?.sourceUrl)
    .map((record) => ({ legacyId: record.legacyId, sourceUrl: record.media!.sourceUrl! }));
  const previous = new Map(
    (options.previousReport?.results ?? []).map((result) => [result.legacyId, result]),
  );
  const results = new Array<MediaDownloadResult>(records.length);
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 4, 12));
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, records.length) }, async () => {
    while (cursor < records.length) {
      const index = cursor;
      cursor += 1;
      const record = records[index];
      const reused = await reusable(options.outputDirectory, previous.get(record.legacyId));
      results[index] =
        reused ??
        (await downloadOne(
          record,
          options.outputDirectory,
          options.fetcher ?? fetch,
          options.maximumBytesPerFile ?? 250 * 1024 * 1024,
        ));
    }
  });
  await Promise.all(workers);
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    requested: records.length,
    downloaded: results.filter((result) => result.disposition === 'downloaded').length,
    reused: results.filter((result) => result.disposition === 'reused').length,
    failed: results.filter((result) => result.disposition === 'failed').length,
    results,
  };
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}
