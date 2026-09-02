import path from 'node:path';
import { isIP } from 'node:net';
import { sha256 } from './hash.ts';
import type { MediaDownloadReport, WordPressManifest, WordPressRecord } from './types.ts';

export interface VerifiedR2MediaItem {
  legacyId: number;
  key: string;
  mimeType: string;
  byteSize: number;
  checksumSha256: string;
  sourceUrl: string;
  width: number | null;
  height: number | null;
}

export interface VerifiedR2MediaStorage {
  schemaVersion: 1;
  deploymentEnvironment: 'development' | 'production';
  bucket: string;
  prefix: string;
  mediaPublicOrigin: string;
  mediaDownloadReportChecksumSha256: string;
  r2VerificationReportChecksumSha256: string;
  items: VerifiedR2MediaItem[];
}

export interface VerifiedExternalR2MediaItem {
  sourceUrl: string;
  urlSha256: string;
  key: string;
  mimeType: string;
  byteSize: number;
  checksumSha256: string;
  width: number;
  height: number;
}

export interface VerifiedExternalR2MediaStorage {
  schemaVersion: 1;
  bucket: string;
  prefix: string;
  r2VerificationReportChecksumSha256: string;
  items: VerifiedExternalR2MediaItem[];
}

interface R2ReportItem {
  legacyId?: unknown;
  key?: unknown;
  mimeType?: unknown;
  byteSize?: unknown;
  checksumSha256?: unknown;
  finalRemote?: {
    status?: unknown;
    byteSize?: unknown;
    checksumSha256?: unknown;
  };
  error?: unknown;
}

interface R2Report {
  schemaVersion?: unknown;
  sourceReportChecksumSha256?: unknown;
  bucket?: unknown;
  prefix?: unknown;
  verification?: unknown;
  counts?: {
    total?: unknown;
    verified?: unknown;
    mismatched?: unknown;
    missing?: unknown;
    errors?: unknown;
  };
  items?: unknown;
}

interface ExternalR2ReportItem {
  sourceUrl?: unknown;
  urlSha256?: unknown;
  key?: unknown;
  local?: {
    status?: unknown;
    mimeType?: unknown;
    byteSize?: unknown;
    checksumSha256?: unknown;
    width?: unknown;
    height?: unknown;
  };
  remote?: {
    status?: unknown;
    byteSize?: unknown;
    checksumSha256?: unknown;
  };
  error?: unknown;
}

interface ExternalR2Report {
  schemaVersion?: unknown;
  manifestChecksumSha256?: unknown;
  bucket?: unknown;
  prefix?: unknown;
  verification?: unknown;
  extraction?: { uniqueExternalUrls?: unknown; rejected?: unknown };
  counts?: { total?: unknown; verified?: unknown; errors?: unknown };
  mapping?: unknown;
  items?: unknown;
}

const SHA256 = /^[0-9a-f]{64}$/;

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is missing`);
  return value;
}

function requiredInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || Number(value) < 0) throw new Error(`${label} is invalid`);
  return Number(value);
}

function requireChecksum(value: unknown, label: string): string {
  const checksum = requiredString(value, label);
  if (!SHA256.test(checksum)) throw new Error(`${label} is not a SHA-256 checksum`);
  return checksum;
}

function normalizeOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/') {
    throw new Error('Media public origin must be an HTTPS origin without credentials or a path');
  }
  return url.origin;
}

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split('.').map((part) => Number.parseInt(part, 10));
  if (
    octets.length !== 4 ||
    octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }
  return (
    octets[0] === 0 ||
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 100 && (octets[1] ?? 0) >= 64 && (octets[1] ?? 0) <= 127) ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && (octets[1] ?? 0) >= 16 && (octets[1] ?? 0) <= 31) ||
    (octets[0] === 192 && octets[1] === 168) ||
    (octets[0] === 198 && ((octets[1] ?? 0) === 18 || (octets[1] ?? 0) === 19)) ||
    (octets[0] ?? 0) >= 224
  );
}

function isPrivateIpv6(hostname: string): boolean {
  const unbracketed = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (isIP(unbracketed) !== 6) return false;
  if (unbracketed === '::' || unbracketed === '::1') return true;
  const mappedIpv4 = unbracketed.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedIpv4) {
    const upper = Number.parseInt(mappedIpv4[1]!, 16);
    const lower = Number.parseInt(mappedIpv4[2]!, 16);
    const address = [upper >> 8, upper & 0xff, lower >> 8, lower & 0xff].join('.');
    if (isPrivateIpv4(address)) return true;
  }
  const firstHextet = Number.parseInt(unbracketed.split(':', 1)[0] || '0', 16);
  return (firstHextet & 0xfe00) === 0xfc00 || (firstHextet & 0xffc0) === 0xfe80;
}

export function validateMediaPublicOrigin(
  value: string,
  environment: 'development' | 'production',
): string {
  const origin = normalizeOrigin(value);
  const url = new URL(origin);
  const hostname = url.hostname.toLowerCase();
  if (
    environment === 'production' &&
    (hostname === 'localhost' ||
      isPrivateIpv6(hostname) ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.workers.dev') ||
      hostname.endsWith('.pages.dev') ||
      hostname.includes('mukhtalif-development') ||
      isPrivateIpv4(hostname))
  ) {
    throw new Error(
      'Production media public origin must be the real production delivery origin; development, localhost, workers.dev, and pages.dev origins are forbidden',
    );
  }
  return origin;
}

function attachmentMap(manifest: WordPressManifest): Map<number, WordPressRecord> {
  return new Map(manifest.candidates.attachment.map((record) => [record.legacyId, record]));
}

function downloadMap(
  report: MediaDownloadReport,
): Map<number, MediaDownloadReport['results'][number]> {
  const result = new Map<number, MediaDownloadReport['results'][number]>();
  for (const item of report.results) {
    if (result.has(item.legacyId))
      throw new Error(`Duplicate downloaded media ID ${item.legacyId}`);
    result.set(item.legacyId, item);
  }
  return result;
}

export function verifyR2MediaStorage(options: {
  manifest: WordPressManifest;
  mediaDownloadReport: MediaDownloadReport;
  mediaDownloadReportRaw: string;
  r2Report: unknown;
  r2ReportRaw: string;
  mediaPublicOrigin: string;
  environment: 'development' | 'production';
}): VerifiedR2MediaStorage {
  const report = options.r2Report as R2Report;
  if (report.schemaVersion !== 1 || !Array.isArray(report.items)) {
    throw new Error('R2 verification report does not match schema version 1');
  }
  const sourceChecksum = sha256(options.mediaDownloadReportRaw);
  if (report.sourceReportChecksumSha256 !== sourceChecksum) {
    throw new Error('R2 report is not tied to the supplied media download report');
  }
  const bucket = requiredString(report.bucket, 'R2 bucket');
  const prefix = requiredString(report.prefix, 'R2 prefix').replace(/^\/+|\/+$/g, '');
  if (bucket !== 'mukhtalif-media') throw new Error(`Unexpected R2 bucket: ${bucket}`);
  if (prefix !== 'legacy/wordpress') throw new Error(`Unexpected R2 prefix: ${prefix}`);
  if (report.verification !== 'direct-r2-download-size-and-sha256') {
    throw new Error('R2 report did not use direct size and SHA-256 verification');
  }
  const counts = report.counts ?? {};
  const total = requiredInteger(counts.total, 'R2 total count');
  const verified = requiredInteger(counts.verified, 'R2 verified count');
  if (
    total !== report.items.length ||
    verified !== total ||
    requiredInteger(counts.mismatched, 'R2 mismatched count') !== 0 ||
    requiredInteger(counts.missing, 'R2 missing count') !== 0 ||
    requiredInteger(counts.errors, 'R2 error count') !== 0
  ) {
    throw new Error('R2 verification report is incomplete or contains failures');
  }
  if (
    options.mediaDownloadReport.schemaVersion !== 1 ||
    options.mediaDownloadReport.failed !== 0 ||
    options.mediaDownloadReport.requested !== options.mediaDownloadReport.results.length
  ) {
    throw new Error('Media download report is incomplete or contains failures');
  }
  const attachments = attachmentMap(options.manifest);
  const downloads = downloadMap(options.mediaDownloadReport);
  if (attachments.size !== report.items.length || downloads.size !== report.items.length) {
    throw new Error('WXR attachments, downloads, and R2 verification counts do not match');
  }
  const seen = new Set<number>();
  const items: VerifiedR2MediaItem[] = [];
  for (const rawItem of report.items as R2ReportItem[]) {
    const legacyId = requiredInteger(rawItem.legacyId, 'R2 legacy ID');
    if (!legacyId || seen.has(legacyId))
      throw new Error(`Invalid or duplicate R2 legacy ID ${legacyId}`);
    seen.add(legacyId);
    const key = requiredString(rawItem.key, `R2 key ${legacyId}`);
    if (!key.startsWith(`${prefix}/${legacyId}/`) || path.posix.basename(key) === '') {
      throw new Error(`R2 key ${legacyId} does not use the deterministic legacy prefix`);
    }
    const mimeType = requiredString(rawItem.mimeType, `R2 MIME ${legacyId}`);
    const byteSize = requiredInteger(rawItem.byteSize, `R2 byte size ${legacyId}`);
    const checksumSha256 = requireChecksum(rawItem.checksumSha256, `R2 checksum ${legacyId}`);
    if (
      rawItem.error !== null ||
      rawItem.finalRemote?.status !== 'verified' ||
      rawItem.finalRemote.byteSize !== byteSize ||
      rawItem.finalRemote.checksumSha256 !== checksumSha256
    ) {
      throw new Error(`R2 object ${legacyId} is not verified against its local source`);
    }
    const attachment = attachments.get(legacyId);
    const download = downloads.get(legacyId);
    if (!attachment || !download)
      throw new Error(`R2 object ${legacyId} has no WXR/download source`);
    if (
      download.error !== null ||
      !['downloaded', 'reused'].includes(download.disposition) ||
      download.byteSize !== byteSize ||
      download.checksumSha256 !== checksumSha256 ||
      download.mimeType !== mimeType ||
      download.sourceUrl !== attachment.media?.sourceUrl
    ) {
      throw new Error(`R2 object ${legacyId} does not match the media download ledger`);
    }
    items.push({
      legacyId,
      key,
      mimeType,
      byteSize,
      checksumSha256,
      sourceUrl: download.sourceUrl,
      width: attachment.media?.width ?? null,
      height: attachment.media?.height ?? null,
    });
  }
  items.sort((left, right) => left.legacyId - right.legacyId);
  return {
    schemaVersion: 1,
    deploymentEnvironment: options.environment,
    bucket,
    prefix,
    mediaPublicOrigin: validateMediaPublicOrigin(options.mediaPublicOrigin, options.environment),
    mediaDownloadReportChecksumSha256: sourceChecksum,
    r2VerificationReportChecksumSha256: sha256(options.r2ReportRaw),
    items,
  };
}

export function wordpressMediaAssetId(legacyId: number): string {
  if (!Number.isInteger(legacyId) || legacyId < 1)
    throw new Error('Media legacy ID must be positive');
  return `med-${sha256(`wordpress:mukhtalif.net:attachment:${legacyId}`).slice(0, 32)}`;
}

export function wordpressExternalMediaAssetId(sourceUrl: string): string {
  return `med-${sha256(`wordpress:mukhtalif.net:external-image:${sourceUrl}`).slice(0, 32)}`;
}

export function verifyExternalR2MediaStorage(options: {
  manifestRaw: string;
  r2Report: unknown;
  r2ReportRaw: string;
}): VerifiedExternalR2MediaStorage {
  const report = options.r2Report as ExternalR2Report;
  if (report.schemaVersion !== 1 || !Array.isArray(report.items)) {
    throw new Error('External R2 verification report does not match schema version 1');
  }
  if (report.manifestChecksumSha256 !== sha256(options.manifestRaw)) {
    throw new Error('External R2 report is not tied to the supplied WordPress manifest file');
  }
  const bucket = requiredString(report.bucket, 'External R2 bucket');
  const prefix = requiredString(report.prefix, 'External R2 prefix').replace(/^\/+|\/+$/g, '');
  if (bucket !== 'mukhtalif-media' || prefix !== 'legacy/wordpress/external') {
    throw new Error('External R2 report uses an unexpected bucket or prefix');
  }
  if (report.verification !== 'direct-r2-download-size-and-sha256') {
    throw new Error('External R2 report did not use direct size and SHA-256 verification');
  }
  const total = requiredInteger(report.counts?.total, 'External R2 total count');
  const verified = requiredInteger(report.counts?.verified, 'External R2 verified count');
  if (
    total !== report.items.length ||
    verified !== total ||
    requiredInteger(report.counts?.errors, 'External R2 error count') !== 0 ||
    requiredInteger(report.extraction?.uniqueExternalUrls, 'External R2 unique URL count') !==
      total ||
    !Array.isArray(report.extraction?.rejected) ||
    report.extraction.rejected.length !== 0
  ) {
    throw new Error('External R2 verification report is incomplete or contains failures');
  }
  if (!report.mapping || typeof report.mapping !== 'object' || Array.isArray(report.mapping)) {
    throw new Error('External R2 verification mapping is missing');
  }
  const mapping = report.mapping as Record<string, Record<string, unknown>>;
  if (Object.keys(mapping).length !== total) {
    throw new Error('External R2 mapping count does not match verified items');
  }
  const seen = new Set<string>();
  const items: VerifiedExternalR2MediaItem[] = [];
  for (const rawItem of report.items as ExternalR2ReportItem[]) {
    const sourceUrl = requiredString(rawItem.sourceUrl, 'External media source URL');
    const source = new URL(sourceUrl);
    if (
      source.protocol !== 'https:' ||
      source.username ||
      source.password ||
      source.hostname !== 'mcusercontent.com'
    ) {
      throw new Error(
        `External media source is not an approved mcusercontent HTTPS URL: ${sourceUrl}`,
      );
    }
    if (seen.has(sourceUrl)) throw new Error(`Duplicate external media source URL: ${sourceUrl}`);
    seen.add(sourceUrl);
    const urlSha256 = requireChecksum(rawItem.urlSha256, `External URL checksum ${sourceUrl}`);
    if (urlSha256 !== sha256(sourceUrl)) {
      throw new Error(`External media URL checksum does not match ${sourceUrl}`);
    }
    const key = requiredString(rawItem.key, `External R2 key ${sourceUrl}`);
    if (!key.startsWith(`${prefix}/${urlSha256}/`) || !path.posix.basename(key)) {
      throw new Error(`External R2 key is not deterministic for ${sourceUrl}`);
    }
    const local = rawItem.local ?? {};
    const remote = rawItem.remote ?? {};
    const mimeType = requiredString(local.mimeType, `External MIME ${sourceUrl}`);
    const byteSize = requiredInteger(local.byteSize, `External byte size ${sourceUrl}`);
    const checksumSha256 = requireChecksum(local.checksumSha256, `External checksum ${sourceUrl}`);
    const width = requiredInteger(local.width, `External width ${sourceUrl}`);
    const height = requiredInteger(local.height, `External height ${sourceUrl}`);
    if (
      rawItem.error !== null ||
      local.status !== 'verified' ||
      remote.status !== 'verified' ||
      remote.byteSize !== byteSize ||
      remote.checksumSha256 !== checksumSha256
    ) {
      throw new Error(`External R2 object is not verified against its local source: ${sourceUrl}`);
    }
    const mapped = mapping[sourceUrl];
    if (
      !mapped ||
      mapped.key !== key ||
      mapped.mimeType !== mimeType ||
      mapped.byteSize !== byteSize ||
      mapped.checksumSha256 !== checksumSha256 ||
      mapped.width !== width ||
      mapped.height !== height
    ) {
      throw new Error(`External R2 mapping disagrees with verified item ${sourceUrl}`);
    }
    items.push({
      sourceUrl,
      urlSha256,
      key,
      mimeType,
      byteSize,
      checksumSha256,
      width,
      height,
    });
  }
  items.sort((left, right) => left.sourceUrl.localeCompare(right.sourceUrl));
  return {
    schemaVersion: 1,
    bucket,
    prefix,
    r2VerificationReportChecksumSha256: sha256(options.r2ReportRaw),
    items,
  };
}

export function mediaPublicUrl(storage: VerifiedR2MediaStorage, legacyId: number): string {
  return `${storage.mediaPublicOrigin}/media/${wordpressMediaAssetId(legacyId)}`;
}
