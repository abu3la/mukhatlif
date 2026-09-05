import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { open, stat, statfs, unlink } from 'node:fs/promises';
import { request } from 'node:https';
import type { IncomingMessage } from 'node:http';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
  UploadPartCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { APPROVED_R2_BUCKET, canonicalAudioSource, type AudioMigrationPlanItem } from './core.ts';
import { inspectAudioHead, publicAddress, safeHttpsUrl } from './network.ts';
import {
  archiveObjectContentType,
  archiveObjectMetadata,
  reviewedSourceAudioFormat,
  validReviewedAacPrefix,
} from './reviewed-audio-formats.ts';

export const PART_SIZE = 16 * 1024 * 1024;
const AUDIO_SNIFF_BYTES = 16 * 1024;
const MP3_SYNC_SEARCH_LIMIT = 4096;
const RESERVE_BYTES = 2 * 1024 ** 3;
export interface TransferState {
  sha256?: string;
  downloaded?: boolean;
  uploadId?: string;
  parts?: Array<{ PartNumber: number; ETag: string }>;
  verifiedAt?: string;
  etag?: string;
  linkedAt?: string;
}
export class IntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntegrityError';
  }
}

function mp3Frame(bytes: Buffer, offset: number) {
  if (offset + 4 > bytes.length || bytes[offset] !== 0xff || (bytes[offset + 1]! & 0xe0) !== 0xe0)
    return null;
  const version = (bytes[offset + 1]! >> 3) & 3;
  const layer = (bytes[offset + 1]! >> 1) & 3;
  const bitrateIndex = bytes[offset + 2]! >> 4;
  const sampleIndex = (bytes[offset + 2]! >> 2) & 3;
  if (
    version === 1 ||
    layer !== 1 ||
    bitrateIndex === 0 ||
    bitrateIndex === 15 ||
    sampleIndex === 3
  )
    return null;
  const bitrates =
    version === 3
      ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
      : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  const sampleRate =
    [44100, 48000, 32000][sampleIndex]! / (version === 3 ? 1 : version === 2 ? 2 : 4);
  const padding = (bytes[offset + 2]! >> 1) & 1;
  const length =
    Math.floor(((version === 3 ? 144000 : 72000) * bitrates[bitrateIndex]!) / sampleRate) + padding;
  return { version, sampleRate, channels: bytes[offset + 3]! >> 6 === 3 ? 1 : 2, length };
}

function hasBoundedMp3FrameRun(bytes: Buffer): boolean {
  // A cut made mid-frame can precede the first complete MPEG frame with a
  // short binary fragment. Require three complete, correctly spaced Layer III
  // frames with consistent stream parameters; a lone sync word is not proof.
  if (
    /^(?:<!doctype|<html|<head|<body|<\?xml|\{|\[)/i.test(
      bytes.subarray(0, 512).toString('utf8').trimStart(),
    )
  )
    return false;
  for (let offset = 1; offset <= Math.min(MP3_SYNC_SEARCH_LIMIT, bytes.length - 4); offset++) {
    const first = mp3Frame(bytes, offset);
    if (!first) continue;
    let next = offset;
    let count = 0;
    for (; count < 3; count++) {
      const frame = mp3Frame(bytes, next);
      if (
        !frame ||
        frame.version !== first.version ||
        frame.sampleRate !== first.sampleRate ||
        frame.channels !== first.channels ||
        next + frame.length > bytes.length
      )
        break;
      next += frame.length;
    }
    if (count === 3) return true;
  }
  return false;
}

export function validAudioMagic(bytes: Buffer, extension: string): boolean {
  if (extension === 'm4a') return bytes.length >= 12 && bytes.toString('ascii', 4, 8) === 'ftyp';
  if (extension !== 'mp3' || bytes.length < 4) return false;
  return (
    bytes.toString('ascii', 0, 3) === 'ID3' ||
    (bytes[0] === 0xff &&
      (bytes[1]! & 0xe0) === 0xe0 &&
      (bytes[1]! & 0x18) !== 0x08 &&
      (bytes[1]! & 0x06) !== 0 &&
      (bytes[2]! & 0xf0) !== 0xf0 &&
      (bytes[2]! & 0x0c) !== 0x0c) ||
    hasBoundedMp3FrameRun(bytes)
  );
}

export async function digestStream(source: AsyncIterable<Uint8Array>, expectedBytes: number) {
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of source) {
    bytes += chunk.byteLength;
    if (bytes > expectedBytes) throw new IntegrityError('Body exceeds the reviewed byte size');
    hash.update(chunk);
  }
  if (bytes !== expectedBytes)
    throw new IntegrityError('Body is shorter than the reviewed byte size');
  return hash.digest('hex');
}

async function publicGet(url: URL, redirects = 0): Promise<IncomingMessage> {
  if (redirects > 5) throw new IntegrityError('Too many source redirects');
  const pinned = await publicAddress(url.hostname);
  const response = await new Promise<IncomingMessage>((resolve, reject) => {
    const req = request(
      {
        hostname: pinned.address,
        family: pinned.family,
        servername: url.hostname,
        port: url.port ? Number(url.port) : 443,
        path: `${url.pathname}${url.search}`,
        headers: {
          host: url.host,
          'accept-encoding': 'identity',
          'user-agent': 'Mukhtalif-Archive/1.0',
        },
      },
      resolve,
    );
    req.setTimeout(60_000, () => req.destroy(new Error('Source download stalled')));
    req.on('error', reject);
    req.end();
  });
  if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) {
    const location = response.headers.location;
    response.destroy();
    if (!location) throw new IntegrityError('Source redirect has no Location');
    return publicGet(safeHttpsUrl(new URL(location, url).href), redirects + 1);
  }
  if (response.statusCode !== 200) {
    response.destroy();
    throw new Error(`Source GET HTTP ${response.statusCode}`);
  }
  return response;
}

async function validateFile(file: string, item: AudioMigrationPlanItem): Promise<string> {
  const details = await stat(file);
  if (!details.isFile() || details.size !== item.expectedByteSize)
    throw new IntegrityError('Temporary file size mismatch');
  const handle = await open(file, 'r');
  try {
    const { buffer, bytesRead } = await handle.read(
      Buffer.alloc(AUDIO_SNIFF_BYTES),
      0,
      AUDIO_SNIFF_BYTES,
      0,
    );
    const prefix = buffer.subarray(0, bytesRead);
    const valid = reviewedSourceAudioFormat(item)
      ? validReviewedAacPrefix(prefix)
      : validAudioMagic(prefix, item.extension);
    if (!valid) throw new IntegrityError('Downloaded body is not the declared audio format');
  } finally {
    await handle.close();
  }
  const digest = await digestStream(createReadStream(file), item.expectedByteSize);
  archiveObjectContentType(item, digest);
  return digest;
}

async function download(file: string, item: AudioMigrationPlanItem): Promise<string> {
  canonicalAudioSource(item.sourceUrl);
  const head = await inspectAudioHead({
    sourceUrl: item.sourceUrl,
    expectedByteSize: item.expectedByteSize,
    expectedMimeType: item.mimeType,
  });
  if (head.status !== 'verified')
    throw new IntegrityError(`Source preflight failed: ${head.error}`);
  const disk = await statfs(file.slice(0, file.lastIndexOf('/')));
  if (disk.bavail * disk.bsize < item.expectedByteSize + RESERVE_BYTES)
    throw new IntegrityError('Insufficient free disk space; 2 GiB reserve required');
  const response = await publicGet(canonicalAudioSource(item.sourceUrl));
  if (
    Number(response.headers['content-length']) !== item.expectedByteSize ||
    (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity')
  ) {
    response.destroy();
    throw new IntegrityError('Source GET headers no longer match the reviewed file');
  }
  let bytes = 0;
  const limit = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      callback(
        bytes > item.expectedByteSize ? new IntegrityError('Source exceeded byte budget') : null,
        chunk,
      );
    },
  });
  await pipeline(response, limit, createWriteStream(file, { flags: 'wx', mode: 0o600 }));
  return validateFile(file, item);
}

function status(error: unknown): number | undefined {
  return (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
}

export async function transferAudio(input: {
  client: S3Client;
  item: AudioMigrationPlanItem;
  file: string;
  state: TransferState;
  save: () => Promise<void>;
  progress?: (message: string) => void;
}): Promise<void> {
  const { client, item, file, state, save } = input;
  const target = { Bucket: APPROVED_R2_BUCKET, Key: item.key };
  const progress = input.progress ?? (() => {});
  // A verified checkpoint is tied to the exact reviewed plan by the caller.
  // HEAD checks that the verified object has not been replaced since that run.
  if (state.verifiedAt) {
    const contentType = archiveObjectContentType(item, state.sha256);
    const metadata = archiveObjectMetadata(item, state.sha256!);
    const head = await client.send(new HeadObjectCommand(target));
    if (
      head.ETag !== state.etag ||
      head.ContentLength !== item.expectedByteSize ||
      head.ContentType !== contentType ||
      Object.entries(metadata).some(([key, value]) => head.Metadata?.[key] !== value)
    )
      throw new IntegrityError('Previously verified R2 object changed; refusing to continue');
    await unlink(file).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
    return;
  }
  if (state.downloaded && state.sha256) {
    try {
      if ((await validateFile(file, item)) !== state.sha256)
        throw new IntegrityError('Temporary file hash changed');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      state.downloaded = false;
    }
  }
  if (!state.downloaded) {
    // Only the exact per-object temporary path owned by this job is removed.
    await unlink(file).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
    progress('downloading');
    const hash = await download(file, item);
    if (state.sha256 && state.sha256 !== hash)
      throw new IntegrityError('Source changed since previous upload parts');
    state.sha256 = hash;
    state.downloaded = true;
    await save();
  }
  const contentType = archiveObjectContentType(item, state.sha256);
  const metadata = archiveObjectMetadata(item, state.sha256!);
  let existing;
  try {
    existing = await client.send(new HeadObjectCommand(target));
  } catch (error) {
    if (status(error) !== 404) throw error;
  }
  if (
    existing &&
    (existing.ContentLength !== item.expectedByteSize ||
      existing.ContentType !== contentType ||
      Object.entries(metadata).some(([key, value]) => existing.Metadata?.[key] !== value))
  )
    throw new IntegrityError('Existing R2 object differs; it will not be overwritten');

  if (!existing) {
    if (state.uploadId) {
      // Reconcile remote parts after a crash between uploading and checkpointing.
      try {
        const remote = await client.send(
          new ListPartsCommand({ ...target, UploadId: state.uploadId }),
        );
        // Archive files are bounded to < 16 GiB, so there are never > 1000 parts.
        if (remote.IsTruncated) throw new IntegrityError('Unexpected multipart pagination');
        state.parts = (remote.Parts ?? []).map((part) => {
          const n = part.PartNumber;
          if (
            !n ||
            !part.ETag ||
            part.Size !== Math.min(PART_SIZE, item.expectedByteSize - (n - 1) * PART_SIZE)
          )
            throw new IntegrityError('Unexpected remote multipart part');
          return { PartNumber: n, ETag: part.ETag };
        });
      } catch (error) {
        if (status(error) !== 404) throw error;
        delete state.uploadId;
        state.parts = [];
      }
    }
    if (!state.uploadId) {
      const result = await client.send(
        new CreateMultipartUploadCommand({
          ...target,
          ContentType: contentType,
          Metadata: metadata,
        }),
      );
      if (!result.UploadId) throw new Error('R2 did not return an upload ID');
      state.uploadId = result.UploadId;
      state.parts = [];
      await save();
    }
    const count = Math.ceil(item.expectedByteSize / PART_SIZE);
    for (let n = 1; n <= count; n++) {
      if (state.parts?.some((part) => part.PartNumber === n)) continue;
      const start = (n - 1) * PART_SIZE;
      const length = Math.min(PART_SIZE, item.expectedByteSize - start);
      // Buffer one part only; SDK retries can safely replay this bounded body.
      const handle = await open(file, 'r');
      let body: Buffer;
      try {
        body = Buffer.alloc(length);
        let offset = 0;
        while (offset < length) {
          const { bytesRead } = await handle.read(body, offset, length - offset, start + offset);
          if (!bytesRead) throw new IntegrityError('Temporary file truncated during upload');
          offset += bytesRead;
        }
      } finally {
        await handle.close();
      }
      progress(`uploading part ${n}/${count}`);
      const result = await client.send(
        new UploadPartCommand({
          ...target,
          UploadId: state.uploadId,
          PartNumber: n,
          Body: body,
          ContentLength: length,
          ContentMD5: createHash('md5').update(body).digest('base64'),
        }),
      );
      if (!result.ETag) throw new Error('R2 did not acknowledge the upload part');
      state.parts!.push({ PartNumber: n, ETag: result.ETag });
      await save();
    }
    // Atomic create-only publication. Never retry without this condition.
    await client.send(
      new CompleteMultipartUploadCommand({
        ...target,
        UploadId: state.uploadId,
        IfNoneMatch: '*',
        MultipartUpload: { Parts: state.parts!.sort((a, b) => a.PartNumber - b.PartNumber) },
      }),
    );
  }
  progress('verifying R2 SHA-256');
  const remote = await client.send(new GetObjectCommand(target));
  if (
    !remote.Body ||
    remote.ContentLength !== item.expectedByteSize ||
    remote.ContentType !== contentType ||
    Object.entries(metadata).some(([key, value]) => remote.Metadata?.[key] !== value)
  ) {
    (remote.Body as { destroy?: () => void } | undefined)?.destroy?.();
    throw new IntegrityError('R2 verification body, size or format metadata differs');
  }
  try {
    const digest = await digestStream(
      remote.Body as AsyncIterable<Uint8Array>,
      item.expectedByteSize,
    );
    if (digest !== state.sha256) throw new IntegrityError('R2 SHA-256 mismatch');
  } finally {
    (remote.Body as { destroy?: () => void }).destroy?.();
  }
  state.verifiedAt = new Date().toISOString();
  state.etag = remote.ETag;
  delete state.uploadId;
  state.parts = [];
  await save();
  await unlink(file);
  progress('verified');
}
