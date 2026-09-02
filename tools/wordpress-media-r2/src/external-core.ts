import { createHash } from 'node:crypto';
import { BlockList, isIP } from 'node:net';
import path from 'node:path';
import { parseFragment, type DefaultTreeAdapterMap } from 'parse5';

type HtmlNode = DefaultTreeAdapterMap['node'];
type HtmlElement = DefaultTreeAdapterMap['element'];

interface ManifestMedia {
  sourceUrl?: string | null;
}

interface ManifestRecord {
  legacyId: number;
  contentHtml?: string;
  suggestedTargetSlug?: string;
  media?: ManifestMedia | null;
}

interface WordPressManifest {
  candidates?: {
    post?: ManifestRecord[];
    attachment?: ManifestRecord[];
  };
}

export interface ExternalImageUsage {
  legacyPostId: number;
  articleId: string;
  slug: string;
  order: number;
}

export interface ExternalImageCandidate {
  sourceUrl: string;
  urlSha256: string;
  filename: string;
  key: string;
  usages: ExternalImageUsage[];
}

export interface ExternalExtraction {
  articleCount: number;
  articlesWithInlineImages: number;
  inlineImageOccurrences: number;
  wxrMappedOccurrences: number;
  unresolvedOccurrences: number;
  uniqueExternalUrls: number;
  candidates: ExternalImageCandidate[];
  rejected: Array<{ sourceUrl: string | null; reason: string; usage: ExternalImageUsage }>;
}

export interface ImageMetadata {
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
  width: number;
  height: number;
}

const EXTERNAL_HOST_SUFFIX = '.mcusercontent.com';
const EXTENSION_MIME = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
]);
const NON_PUBLIC_IPS = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  NON_PUBLIC_IPS.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 32],
  ['2001:2::', 48],
  ['2001:10::', 28],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  NON_PUBLIC_IPS.addSubnet(network, prefix, 'ipv6');
}

function isElement(node: HtmlNode): node is HtmlElement {
  return 'tagName' in node;
}

function children(node: HtmlNode): HtmlNode[] {
  return 'childNodes' in node ? (node.childNodes as HtmlNode[]) : [];
}

function attribute(element: HtmlElement, name: string): string | null {
  return element.attrs.find((candidate) => candidate.name.toLowerCase() === name)?.value ?? null;
}

function classNames(element: HtmlElement): string[] {
  return (attribute(element, 'class') ?? '').split(/\s+/).filter(Boolean);
}

export function safeWebUrl(value: string | null, httpsOnly = false): URL | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    const protocols = httpsOnly ? ['https:'] : ['http:', 'https:'];
    if (!protocols.includes(url.protocol) || url.username || url.password) return null;
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

export function normalizedMediaPath(value: string): string | null {
  try {
    const url = new URL(value);
    const decoded = decodeURIComponent(url.pathname).normalize('NFC');
    return decoded
      .replace(/-\d{2,5}x\d{2,5}(?=\.[^./]+$)/i, '')
      .replace(/-scaled(?=\.[^./]+$)/i, '');
  } catch {
    return null;
  }
}

function attachmentIdFromClasses(values: string[]): number | null {
  for (const value of values) {
    const match = value.match(/^(?:wp-image|uag-image)-(\d+)$/);
    if (match) return Number.parseInt(match[1]!, 10);
  }
  return null;
}

function filenameFromUrl(url: URL): { filename: string; mimeType: string } {
  const encoded = path.posix.basename(url.pathname);
  let decoded: string;
  try {
    decoded = decodeURIComponent(encoded).normalize('NFC');
  } catch {
    throw new Error('URL filename contains invalid percent encoding');
  }
  const extension = path.extname(decoded).toLowerCase();
  const mimeType = EXTENSION_MIME.get(extension);
  if (!mimeType) throw new Error('URL does not have a supported raster image extension');
  const filename = decoded
    .replace(/[\\/\0\r\n\t]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!filename || filename === '.' || filename === '..') throw new Error('URL filename is empty');
  if (Buffer.byteLength(filename, 'utf8') > 220) throw new Error('URL filename is too long');
  return { filename, mimeType };
}

export function externalKey(
  sourceUrl: string,
  prefix = 'legacy/wordpress/external',
): {
  urlSha256: string;
  filename: string;
  mimeType: string;
  key: string;
} {
  const url = safeWebUrl(sourceUrl, true);
  if (!url) throw new Error('External image URL must be credential-free HTTPS');
  const hostname = url.hostname.toLowerCase();
  if (hostname !== 'mcusercontent.com' && !hostname.endsWith(EXTERNAL_HOST_SUFFIX)) {
    throw new Error('External image host is not an approved mcusercontent.com host');
  }
  const { filename, mimeType } = filenameFromUrl(url);
  const canonical = url.toString();
  const urlSha256 = createHash('sha256').update(canonical).digest('hex');
  return {
    urlSha256,
    filename,
    mimeType,
    key: `${prefix.replace(/^\/+|\/+$/g, '')}/${urlSha256}/${filename}`,
  };
}

export function extractExternalImages(manifestValue: unknown): ExternalExtraction {
  if (!manifestValue || typeof manifestValue !== 'object') throw new Error('Manifest is invalid');
  const manifest = manifestValue as WordPressManifest;
  const posts = manifest.candidates?.post;
  const attachments = manifest.candidates?.attachment;
  if (!Array.isArray(posts) || !Array.isArray(attachments)) {
    throw new Error('Manifest candidates.post and candidates.attachment are required');
  }

  const attachmentIds = new Set<number>();
  const exact = new Map<string, number>();
  const derived = new Map<string, number>();
  for (const attachment of attachments) {
    if (!Number.isSafeInteger(attachment.legacyId) || attachment.legacyId <= 0) continue;
    attachmentIds.add(attachment.legacyId);
    const source = safeWebUrl(attachment.media?.sourceUrl ?? null);
    if (!source) continue;
    exact.set(source.toString(), attachment.legacyId);
    const normalized = normalizedMediaPath(source.toString());
    if (normalized && !derived.has(normalized)) derived.set(normalized, attachment.legacyId);
  }

  let articlesWithInlineImages = 0;
  let inlineImageOccurrences = 0;
  let wxrMappedOccurrences = 0;
  let unresolvedOccurrences = 0;
  const byUrl = new Map<string, ExternalImageCandidate>();
  const rejected: ExternalExtraction['rejected'] = [];

  for (const post of posts) {
    if (!Number.isSafeInteger(post.legacyId) || typeof post.contentHtml !== 'string') continue;
    const slug = post.suggestedTargetSlug ?? `article-${post.legacyId}`;
    const fragment = parseFragment(post.contentHtml);
    const images: HtmlElement[] = [];
    const visit = (node: HtmlNode): void => {
      if (!isElement(node)) return;
      if (node.tagName.toLowerCase() === 'img') images.push(node);
      for (const child of children(node)) visit(child);
    };
    for (const node of fragment.childNodes) visit(node as HtmlNode);
    if (images.length > 0) articlesWithInlineImages += 1;

    for (let order = 0; order < images.length; order += 1) {
      const image = images[order];
      inlineImageOccurrences += 1;
      const usage: ExternalImageUsage = {
        legacyPostId: post.legacyId,
        articleId: `art-wp-${post.legacyId}`,
        slug,
        order,
      };
      const url = safeWebUrl(attribute(image, 'src'));
      const classId = attachmentIdFromClasses(classNames(image));
      const exactId = url ? exact.get(url.toString()) : null;
      const derivedId = url ? derived.get(normalizedMediaPath(url.toString()) ?? '') : null;
      if ((classId && attachmentIds.has(classId)) || exactId || derivedId) {
        wxrMappedOccurrences += 1;
        continue;
      }

      unresolvedOccurrences += 1;
      if (!url) {
        rejected.push({ sourceUrl: attribute(image, 'src'), reason: 'invalid-image-url', usage });
        continue;
      }
      try {
        const resolved = externalKey(url.toString());
        const existing = byUrl.get(url.toString());
        if (existing) existing.usages.push(usage);
        else {
          byUrl.set(url.toString(), {
            sourceUrl: url.toString(),
            urlSha256: resolved.urlSha256,
            filename: resolved.filename,
            key: resolved.key,
            usages: [usage],
          });
        }
      } catch (error) {
        rejected.push({
          sourceUrl: url.toString(),
          reason: error instanceof Error ? error.message : String(error),
          usage,
        });
      }
    }
  }

  return {
    articleCount: posts.length,
    articlesWithInlineImages,
    inlineImageOccurrences,
    wxrMappedOccurrences,
    unresolvedOccurrences,
    uniqueExternalUrls: byUrl.size,
    candidates: [...byUrl.values()].sort((left, right) =>
      left.sourceUrl.localeCompare(right.sourceUrl),
    ),
    rejected,
  };
}

function validDimensions(width: number, height: number): { width: number; height: number } {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > 100_000 ||
    height > 100_000
  ) {
    throw new Error('Image dimensions are invalid');
  }
  return { width, height };
}

function jpegDimensions(bytes: Buffer): { width: number; height: number } {
  let offset = 2;
  const startOfFrame = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ]);
  while (offset + 4 <= bytes.length) {
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) break;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) break;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) break;
    if (startOfFrame.has(marker) && length >= 7) {
      return validDimensions(bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3));
    }
    offset += length;
  }
  throw new Error('JPEG dimensions could not be read');
}

export function inspectImage(bytes: Buffer): ImageMetadata {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
    const { width, height } = validDimensions(bytes.readUInt32BE(16), bytes.readUInt32BE(20));
    return { mimeType: 'image/png', width, height };
  }
  if (bytes.length >= 10 && bytes.subarray(0, 3).toString('ascii') === 'GIF') {
    const { width, height } = validDimensions(bytes.readUInt16LE(6), bytes.readUInt16LE(8));
    return { mimeType: 'image/gif', width, height };
  }
  if (bytes.length >= 12 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    const { width, height } = jpegDimensions(bytes);
    return { mimeType: 'image/jpeg', width, height };
  }
  if (
    bytes.length >= 30 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    const chunk = bytes.subarray(12, 16).toString('ascii');
    if (chunk === 'VP8X') {
      const width = 1 + bytes.readUIntLE(24, 3);
      const height = 1 + bytes.readUIntLE(27, 3);
      return { mimeType: 'image/webp', ...validDimensions(width, height) };
    }
    if (chunk === 'VP8L' && bytes[20] === 0x2f) {
      const bits = bytes.readUInt32LE(21);
      const width = (bits & 0x3fff) + 1;
      const height = ((bits >>> 14) & 0x3fff) + 1;
      return { mimeType: 'image/webp', ...validDimensions(width, height) };
    }
    if (chunk === 'VP8 ' && bytes.subarray(23, 26).equals(Buffer.from([0x9d, 0x01, 0x2a]))) {
      const width = bytes.readUInt16LE(26) & 0x3fff;
      const height = bytes.readUInt16LE(28) & 0x3fff;
      return { mimeType: 'image/webp', ...validDimensions(width, height) };
    }
    throw new Error('WebP dimensions could not be read');
  }
  throw new Error('Downloaded bytes are not a supported raster image');
}

export function isPublicIp(value: string): boolean {
  const version = isIP(value);
  if (version === 4) return !NON_PUBLIC_IPS.check(value, 'ipv4');
  if (version === 6) return !NON_PUBLIC_IPS.check(value, 'ipv6');
  return false;
}
