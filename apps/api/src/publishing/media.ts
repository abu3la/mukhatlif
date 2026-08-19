import type {
  ArticleImageAlignment,
  ArticleImageRadius,
  ImageMediaMimeType,
  RichTextDocument,
  RichTextNode,
} from '@mukhtalif/types';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_SIDE = 8_192;
export const MAX_IMAGE_PIXELS = 24_000_000;

export class MediaReferenceError extends Error {
  constructor(
    public readonly code: 'MEDIA_ASSET_NOT_READY' | 'MEDIA_POSTER_NOT_READY',
  ) {
    super(code);
    this.name = 'MediaReferenceError';
  }
}

function canonicalImageAlignment(value: unknown): ArticleImageAlignment {
  return value === 'start' || value === 'end' ? value : 'center';
}

function canonicalImageRadius(value: unknown): ArticleImageRadius {
  return value === 'soft' || value === 'round' ? value : 'none';
}

async function canonicalizeNode(
  node: RichTextNode,
  getAsset: (id: string) => Promise<MediaReferenceAsset | null>,
): Promise<RichTextNode> {
  if (node.type === 'imageBlock') {
    const asset = await getAsset(node.attrs?.mediaId ?? '');
    if (!asset || asset.status !== 'ready') {
      throw new MediaReferenceError('MEDIA_ASSET_NOT_READY');
    }
    return {
      type: 'imageBlock',
      attrs: {
        mediaId: asset.id,
        alt: node.attrs?.alt,
        caption: node.attrs?.caption,
        presentation: node.attrs?.presentation === 'wide' ? 'wide' : 'content',
        alignment: canonicalImageAlignment(node.attrs?.alignment),
        radius: canonicalImageRadius(node.attrs?.radius),
      },
    };
  }
  if (node.type === 'imageGallery') {
    const items = await Promise.all(
      (node.attrs?.items ?? []).map(async (item) => {
        const asset = await getAsset(item.mediaId);
        if (!asset || asset.status !== 'ready') {
          throw new MediaReferenceError('MEDIA_ASSET_NOT_READY');
        }
        return { mediaId: asset.id, alt: item.alt };
      }),
    );
    return {
      type: 'imageGallery',
      attrs: {
        items,
        caption: node.attrs?.caption,
      },
    };
  }
  if (node.type === 'videoEmbed') {
    const poster = await getAsset(node.attrs?.posterMediaId ?? '');
    if (!poster || poster.status !== 'ready') {
      throw new MediaReferenceError('MEDIA_POSTER_NOT_READY');
    }
    return {
      type: 'videoEmbed',
      attrs: {
        provider: node.attrs?.provider,
        videoId: node.attrs?.videoId,
        title: node.attrs?.title,
        posterMediaId: poster.id,
        caption: node.attrs?.caption,
      },
    };
  }
  return {
    ...node,
    content: node.content
      ? await Promise.all(node.content.map((child) => canonicalizeNode(child, getAsset)))
      : undefined,
  };
}

/** Validates database-owned readiness while retaining copy authored for each placement. */
export async function canonicalizeRichTextMedia(
  document: RichTextDocument,
  getAsset: (id: string) => Promise<MediaReferenceAsset | null>,
): Promise<RichTextDocument> {
  return (await canonicalizeNode(document, getAsset)) as RichTextDocument;
}

interface MediaReferenceAsset {
  id: string;
  status: 'pending' | 'uploading' | 'ready';
}

export function richTextReferencesMedia(document: RichTextDocument, id: string): boolean {
  const visit = (node: RichTextNode): boolean =>
    node.attrs?.mediaId === id ||
    node.attrs?.posterMediaId === id ||
    node.attrs?.items?.some((item) => item.mediaId === id) ||
    (node.content ?? []).some(visit);
  return visit(document);
}

export function safeOriginalFileName(value: string): string {
  const basename = value.split(/[\\/]/).at(-1) ?? 'image';
  const cleaned = [...basename.normalize('NFKC')]
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint > 31 && codePoint !== 127;
    })
    .join('')
    .trim();
  return (cleaned || 'image').slice(0, 160);
}

function concatenate(chunks: readonly Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function assertExpectedDimensions(
  width: number,
  height: number,
  expected: { width: number; height: number },
): void {
  if (
    width < 1 ||
    height < 1 ||
    width > MAX_IMAGE_SIDE ||
    height > MAX_IMAGE_SIDE ||
    width * height > MAX_IMAGE_PIXELS
  ) {
    throw new Error('MEDIA_DIMENSIONS_TOO_LARGE');
  }
  if (width !== expected.width || height !== expected.height) {
    throw new Error('MEDIA_DIMENSIONS_MISMATCH');
  }
}

function validateJpegQuantizationTables(data: Uint8Array): void {
  let offset = 0;
  while (offset < data.length) {
    const selector = data[offset] ?? 255;
    offset += 1;
    const precision = selector >>> 4;
    if (precision > 1 || (selector & 0x0f) > 3) throw new Error('MEDIA_JPEG_MALFORMED');
    const tableLength = precision === 0 ? 64 : 128;
    if (offset + tableLength > data.length) throw new Error('MEDIA_JPEG_MALFORMED');
    if (precision === 0) {
      if (data.slice(offset, offset + tableLength).some((value) => value === 0)) {
        throw new Error('MEDIA_JPEG_MALFORMED');
      }
    } else {
      for (let index = offset; index < offset + tableLength; index += 2) {
        if (data[index] === 0 && data[index + 1] === 0) {
          throw new Error('MEDIA_JPEG_MALFORMED');
        }
      }
    }
    offset += tableLength;
  }
}

function validateJpegHuffmanTables(data: Uint8Array): number {
  let offset = 0;
  let classes = 0;
  while (offset < data.length) {
    if (offset + 17 > data.length) throw new Error('MEDIA_JPEG_MALFORMED');
    const selector = data[offset] ?? 255;
    offset += 1;
    const tableClass = selector >>> 4;
    if (tableClass > 1 || (selector & 0x0f) > 3) {
      throw new Error('MEDIA_JPEG_MALFORMED');
    }
    let symbolCount = 0;
    let remainingCodes = 1;
    for (let index = 0; index < 16; index += 1) {
      const count = data[offset + index] ?? 0;
      symbolCount += count;
      remainingCodes = remainingCodes * 2 - count;
      if (remainingCodes < 0) throw new Error('MEDIA_JPEG_MALFORMED');
    }
    offset += 16;
    if (symbolCount < 1 || symbolCount > 256 || offset + symbolCount > data.length) {
      throw new Error('MEDIA_JPEG_MALFORMED');
    }
    offset += symbolCount;
    classes |= tableClass === 0 ? 1 : 2;
  }
  return classes;
}

function sanitizeJpeg(
  bytes: Uint8Array,
  expected: { width: number; height: number },
): Uint8Array {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error('MEDIA_SIGNATURE_MISMATCH');
  }
  const output: Uint8Array[] = [bytes.slice(0, 2)];
  let offset = 2;
  let width = 0;
  let height = 0;
  let sawScan = false;
  let sawEnd = false;
  let sawQuantizationTable = false;
  let huffmanClasses = 0;

  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) throw new Error('MEDIA_JPEG_MALFORMED');
    const markerStart = offset;
    while (bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) throw new Error('MEDIA_JPEG_MALFORMED');
    const marker = bytes[offset] ?? 0;
    offset += 1;

    if (marker === 0x00 || marker === 0xd8) throw new Error('MEDIA_JPEG_MALFORMED');
    if (marker === 0xd9) {
      output.push(new Uint8Array([0xff, 0xd9]));
      sawEnd = true;
      if (offset !== bytes.length) throw new Error('MEDIA_TRAILING_DATA');
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      output.push(bytes.slice(markerStart, offset));
      continue;
    }
    if (offset + 2 > bytes.length) throw new Error('MEDIA_JPEG_MALFORMED');
    const length = ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
    if (length < 2 || offset + length > bytes.length) {
      throw new Error('MEDIA_JPEG_MALFORMED');
    }
    const segmentEnd = offset + length;
    const isMetadata = (marker >= 0xe0 && marker <= 0xef) || marker === 0xfe;
    if (!isMetadata && ![0xc0, 0xc2, 0xc4, 0xda, 0xdb, 0xdd].includes(marker)) {
      throw new Error('MEDIA_JPEG_MALFORMED');
    }
    if (marker === 0xdd && length !== 4) throw new Error('MEDIA_JPEG_MALFORMED');
    if (!isMetadata) output.push(bytes.slice(markerStart, segmentEnd));

    const isStartOfFrame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isStartOfFrame) {
      if (length < 8) throw new Error('MEDIA_JPEG_MALFORMED');
      if (![0xc0, 0xc2].includes(marker)) throw new Error('MEDIA_JPEG_MALFORMED');
      const precision = bytes[offset + 2] ?? 0;
      const frameHeight = ((bytes[offset + 3] ?? 0) << 8) | (bytes[offset + 4] ?? 0);
      const frameWidth = ((bytes[offset + 5] ?? 0) << 8) | (bytes[offset + 6] ?? 0);
      const components = bytes[offset + 7] ?? 0;
      if (precision !== 8 || ![1, 3].includes(components) || length !== 8 + components * 3) {
        throw new Error('MEDIA_JPEG_MALFORMED');
      }
      const componentIds = new Set<number>();
      for (let index = 0; index < components; index += 1) {
        const componentOffset = offset + 8 + index * 3;
        const componentId = bytes[componentOffset] ?? 0;
        const sampling = bytes[componentOffset + 1] ?? 0;
        if (
          componentIds.has(componentId) ||
          (sampling >>> 4) < 1 ||
          (sampling >>> 4) > 4 ||
          (sampling & 0x0f) < 1 ||
          (sampling & 0x0f) > 4 ||
          (bytes[componentOffset + 2] ?? 255) > 3
        ) {
          throw new Error('MEDIA_JPEG_MALFORMED');
        }
        componentIds.add(componentId);
      }
      if ((width && width !== frameWidth) || (height && height !== frameHeight)) {
        throw new Error('MEDIA_JPEG_MALFORMED');
      }
      width = frameWidth;
      height = frameHeight;
    }

    if (marker === 0xdb) {
      validateJpegQuantizationTables(bytes.slice(offset + 2, segmentEnd));
      sawQuantizationTable = true;
    }
    if (marker === 0xc4) {
      huffmanClasses |= validateJpegHuffmanTables(bytes.slice(offset + 2, segmentEnd));
    }

    offset = segmentEnd;
    if (marker !== 0xda) continue;
    const scanComponents = bytes[offset - length + 2] ?? 0;
    if (
      scanComponents < 1 ||
      scanComponents > 3 ||
      length !== 6 + scanComponents * 2
    ) {
      throw new Error('MEDIA_JPEG_MALFORMED');
    }
    const scanDataStart = offset - length + 2;
    const scanIds = new Set<number>();
    for (let index = 0; index < scanComponents; index += 1) {
      const componentId = bytes[scanDataStart + 1 + index * 2] ?? 0;
      const selectors = bytes[scanDataStart + 2 + index * 2] ?? 255;
      if (scanIds.has(componentId) || (selectors >>> 4) > 3 || (selectors & 0x0f) > 3) {
        throw new Error('MEDIA_JPEG_MALFORMED');
      }
      scanIds.add(componentId);
    }
    sawScan = true;
    const scanStart = offset;
    while (offset < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const next = bytes[offset + 1];
      if (next === undefined) throw new Error('MEDIA_JPEG_MALFORMED');
      if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
        offset += 2;
        continue;
      }
      if (next === 0xff) {
        offset += 1;
        continue;
      }
      break;
    }
    output.push(bytes.slice(scanStart, offset));
  }

  if (
    !sawEnd ||
    !sawScan ||
    !sawQuantizationTable ||
    huffmanClasses !== 3 ||
    !width ||
    !height
  ) {
    throw new Error('MEDIA_JPEG_MALFORMED');
  }
  assertExpectedDimensions(width, height, expected);
  return concatenate(output);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let value = n;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[n] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

async function validatePngRaster(
  idat: readonly Uint8Array[],
  width: number,
  height: number,
  bitDepth: number,
  colorType: number,
): Promise<void> {
  const channels: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const channelCount = channels[colorType];
  if (!channelCount) throw new Error('MEDIA_PNG_MALFORMED');
  const rowBytes = Math.ceil((width * channelCount * bitDepth) / 8);
  const rowLength = rowBytes + 1;
  const expectedLength = rowLength * height;
  let received = 0;
  try {
    const stream = new Blob([...idat]).stream().pipeThrough(new DecompressionStream('deflate'));
    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (let index = 0; index < value.length; index += 1) {
        if (received % rowLength === 0 && (value[index] ?? 5) > 4) {
          throw new Error('MEDIA_PNG_MALFORMED');
        }
        received += 1;
        if (received > expectedLength) throw new Error('MEDIA_PNG_MALFORMED');
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'MEDIA_PNG_MALFORMED') throw error;
    throw new Error('MEDIA_PNG_MALFORMED');
  }
  if (received !== expectedLength) throw new Error('MEDIA_PNG_MALFORMED');
}

async function sanitizePng(
  bytes: Uint8Array,
  expected: { width: number; height: number },
): Promise<Uint8Array> {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!signature.every((byte, index) => bytes[index] === byte)) {
    throw new Error('MEDIA_SIGNATURE_MISMATCH');
  }
  const output: Uint8Array[] = [bytes.slice(0, 8)];
  const idat: Uint8Array[] = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let sawHeader = false;
  let sawPalette = false;
  let sawData = false;
  let dataEnded = false;
  let sawEnd = false;
  let sawTransparency = false;

  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) throw new Error('MEDIA_PNG_MALFORMED');
    const chunkStart = offset;
    const length = view.getUint32(offset);
    if (length > MAX_IMAGE_BYTES || offset + 12 + length > bytes.length) {
      throw new Error('MEDIA_PNG_MALFORMED');
    }
    const typeBytes = bytes.slice(offset + 4, offset + 8);
    if (![...typeBytes].every((byte) => (byte >= 65 && byte <= 90) || (byte >= 97 && byte <= 122))) {
      throw new Error('MEDIA_PNG_MALFORMED');
    }
    const type = new TextDecoder().decode(typeBytes);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const storedCrc = view.getUint32(dataEnd);
    if (crc32(bytes.slice(offset + 4, dataEnd)) !== storedCrc) {
      throw new Error('MEDIA_PNG_MALFORMED');
    }
    offset = dataEnd + 4;

    if (!sawHeader && type !== 'IHDR') throw new Error('MEDIA_PNG_MALFORMED');
    if (type === 'IHDR') {
      if (sawHeader || length !== 13) throw new Error('MEDIA_PNG_MALFORMED');
      sawHeader = true;
      width = view.getUint32(dataStart);
      height = view.getUint32(dataStart + 4);
      bitDepth = bytes[dataStart + 8] ?? 0;
      colorType = bytes[dataStart + 9] ?? 255;
      const validDepths: Record<number, number[]> = {
        0: [1, 2, 4, 8, 16],
        2: [8, 16],
        3: [1, 2, 4, 8],
        4: [8, 16],
        6: [8, 16],
      };
      if (
        !validDepths[colorType]?.includes(bitDepth) ||
        bytes[dataStart + 10] !== 0 ||
        bytes[dataStart + 11] !== 0 ||
        bytes[dataStart + 12] !== 0
      ) {
        throw new Error('MEDIA_PNG_MALFORMED');
      }
      assertExpectedDimensions(width, height, expected);
      output.push(bytes.slice(chunkStart, offset));
      continue;
    }
    if (type === 'PLTE') {
      if (sawPalette || sawData || length < 3 || length > 768 || length % 3 !== 0) {
        throw new Error('MEDIA_PNG_MALFORMED');
      }
      sawPalette = true;
      output.push(bytes.slice(chunkStart, offset));
      continue;
    }
    if (type === 'IDAT') {
      if (dataEnded) throw new Error('MEDIA_PNG_MALFORMED');
      sawData = true;
      idat.push(bytes.slice(dataStart, dataEnd));
      output.push(bytes.slice(chunkStart, offset));
      continue;
    }
    if (sawData) dataEnded = true;
    if (type === 'IEND') {
      if (!sawData || sawEnd || length !== 0 || offset !== bytes.length) {
        throw new Error(offset === bytes.length ? 'MEDIA_PNG_MALFORMED' : 'MEDIA_TRAILING_DATA');
      }
      sawEnd = true;
      output.push(bytes.slice(chunkStart, offset));
      break;
    }
    if (type === 'tRNS') {
      if (sawTransparency || sawData || ![0, 2, 3].includes(colorType)) {
        throw new Error('MEDIA_PNG_MALFORMED');
      }
      sawTransparency = true;
      output.push(bytes.slice(chunkStart, offset));
      continue;
    }
    const critical = (typeBytes[0] ?? 0) >= 65 && (typeBytes[0] ?? 0) <= 90;
    if (critical) throw new Error('MEDIA_PNG_MALFORMED');
    // All remaining ancillary chunks are intentionally stripped, including
    // eXIf, text variants, timestamps, ICC profiles, and application data.
  }

  if (!sawHeader || !sawData || !sawEnd || (colorType === 3 && !sawPalette)) {
    throw new Error('MEDIA_PNG_MALFORMED');
  }
  await validatePngRaster(idat, width, height, bitDepth, colorType);
  return concatenate(output);
}

export async function validateAndSanitizeImage(
  input: ArrayBuffer,
  mimeType: ImageMediaMimeType,
  expected: { width: number; height: number },
): Promise<ArrayBuffer> {
  if (input.byteLength < 1) throw new Error('MEDIA_FILE_EMPTY');
  if (input.byteLength > MAX_IMAGE_BYTES) throw new Error('MEDIA_FILE_TOO_LARGE');
  const bytes = new Uint8Array(input);
  const sanitized =
    mimeType === 'image/jpeg'
      ? sanitizeJpeg(bytes, expected)
      : await sanitizePng(bytes, expected);
  return sanitized.buffer.slice(
    sanitized.byteOffset,
    sanitized.byteOffset + sanitized.byteLength,
  ) as ArrayBuffer;
}
