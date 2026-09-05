import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
  PutObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  type GetObjectCommandOutput,
  type HeadObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import type {
  ObjectStorageBucket,
  ObjectStorageGetOptions,
  ObjectStorageHttpMetadata,
  ObjectStorageObject,
  ObjectStorageObjectBody,
  ObjectStoragePutOptions,
  ObjectStoragePutValue,
  ObjectStorageRange,
  ObjectStorageMultipartUpload,
} from './object-storage';

const MULTIPART_PART_SIZE = 8 * 1024 * 1024;

export interface R2S3ClientConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
}

interface UploadTask {
  done(): Promise<unknown>;
}

type UploadFactory = (options: ConstructorParameters<typeof Upload>[0]) => UploadTask;
type UploadBody = ConstructorParameters<typeof Upload>[0]['params']['Body'];

function invalidResponse(operation: string): Error {
  return new Error(`R2_S3_INVALID_${operation.toUpperCase()}_RESPONSE`);
}

function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
  if (record.name === 'NoSuchBucket') return false;
  if (['NoSuchKey', 'NoSuchObject', 'NotFound'].includes(String(record.name))) return true;
  return record.$metadata?.httpStatusCode === 404;
}

function httpEtag(value: string | undefined): string {
  const etag = value?.trim();
  if (!etag) throw invalidResponse('etag');
  return etag.startsWith('"') && etag.endsWith('"') ? etag : `"${etag}"`;
}

function contentSize(
  output: Pick<GetObjectCommandOutput, 'ContentLength' | 'ContentRange'>,
  ranged: boolean,
): number {
  if (ranged) {
    const match = /\/([0-9]+)$/.exec(output.ContentRange?.trim() ?? '');
    const total = match ? Number(match[1]) : Number.NaN;
    if (!Number.isSafeInteger(total) || total < 0) throw invalidResponse('range');
    return total;
  }
  const size = output.ContentLength;
  if (!Number.isSafeInteger(size) || (size ?? -1) < 0) throw invalidResponse('size');
  return size!;
}

function metadata(
  output: Pick<
    HeadObjectCommandOutput,
    | 'ContentType'
    | 'ContentDisposition'
    | 'ContentLanguage'
    | 'ContentEncoding'
    | 'CacheControl'
    | 'Expires'
  >,
): ObjectStorageHttpMetadata | undefined {
  const result: ObjectStorageHttpMetadata = {
    ...(output.ContentType ? { contentType: output.ContentType } : {}),
    ...(output.ContentDisposition ? { contentDisposition: output.ContentDisposition } : {}),
    ...(output.ContentLanguage ? { contentLanguage: output.ContentLanguage } : {}),
    ...(output.ContentEncoding ? { contentEncoding: output.ContentEncoding } : {}),
    ...(output.CacheControl ? { cacheControl: output.CacheControl } : {}),
    ...(output.Expires ? { cacheExpiry: output.Expires } : {}),
  };
  return Object.keys(result).length ? result : undefined;
}

function rangeHeader(range: ObjectStorageRange | undefined): string | undefined {
  if (!range) return undefined;
  if ('suffix' in range) {
    if (!Number.isSafeInteger(range.suffix) || range.suffix <= 0)
      throw new Error('R2_RANGE_INVALID');
    return `bytes=-${range.suffix}`;
  }
  const offset = range.offset ?? 0;
  const length = range.length;
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('R2_RANGE_INVALID');
  if (length === undefined) return `bytes=${offset}-`;
  if (!Number.isSafeInteger(length) || length <= 0) throw new Error('R2_RANGE_INVALID');
  return `bytes=${offset}-${offset + length - 1}`;
}

function webBody(body: GetObjectCommandOutput['Body']): ReadableStream {
  if (!body) throw invalidResponse('body');
  if (typeof body.transformToWebStream === 'function') {
    return body.transformToWebStream() as unknown as ReadableStream;
  }
  if (body instanceof ReadableStream) return body;
  if (body instanceof Blob) return body.stream();
  if (body instanceof Uint8Array) return new Blob([body]).stream();
  if (body instanceof Readable) return Readable.toWeb(body) as unknown as ReadableStream;
  throw invalidResponse('body');
}

function uploadBody(value: ObjectStoragePutValue): UploadBody {
  if (value === null) return new Uint8Array();
  if (value instanceof ReadableStream) {
    return Readable.fromWeb(value as unknown as NodeReadableStream);
  }
  if (value instanceof Blob) {
    return Readable.fromWeb(value.stream() as unknown as NodeReadableStream);
  }
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return value;
}

function uploadMetadata(options: ObjectStoragePutOptions | undefined) {
  const value = options?.httpMetadata;
  return {
    ...(value?.contentType ? { ContentType: value.contentType } : {}),
    ...(value?.contentDisposition ? { ContentDisposition: value.contentDisposition } : {}),
    ...(value?.contentLanguage ? { ContentLanguage: value.contentLanguage } : {}),
    ...(value?.contentEncoding ? { ContentEncoding: value.contentEncoding } : {}),
    ...(value?.cacheControl ? { CacheControl: value.cacheControl } : {}),
    ...(value?.cacheExpiry ? { Expires: value.cacheExpiry } : {}),
  };
}

function storedObject(output: HeadObjectCommandOutput): ObjectStorageObject {
  const size = output.ContentLength;
  if (!Number.isSafeInteger(size) || (size ?? -1) < 0) throw invalidResponse('head');
  return {
    size: size!,
    httpEtag: httpEtag(output.ETag),
    httpMetadata: metadata(output),
  };
}

/**
 * R2 through its S3-compatible API. `Upload` keeps large audio streaming and
 * switches to multipart automatically; a HEAD after completion preserves the
 * native R2 `put()` contract by returning the stored byte size.
 */
export class R2S3Bucket implements ObjectStorageBucket {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
    private readonly createUpload: UploadFactory = (options) => new Upload(options),
  ) {}

  async head(key: string): Promise<ObjectStorageObject | null> {
    try {
      const output = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return storedObject(output);
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async get(
    key: string,
    options?: ObjectStorageGetOptions,
  ): Promise<ObjectStorageObjectBody | null> {
    const range = rangeHeader(options?.range);
    try {
      const output = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          ...(range ? { Range: range } : {}),
        }),
      );
      return {
        body: webBody(output.Body),
        size: contentSize(output, Boolean(range)),
        httpEtag: httpEtag(output.ETag),
        httpMetadata: metadata(output),
      };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async put(
    key: string,
    value: ObjectStoragePutValue,
    options?: ObjectStoragePutOptions,
  ): Promise<ObjectStorageObject | null> {
    if (options?.onlyIf) {
      try {
        const output = await this.client.send(
          new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: uploadBody(value),
            ...uploadMetadata(options),
            IfMatch: options.onlyIf.etagMatches ? httpEtag(options.onlyIf.etagMatches) : undefined,
            IfNoneMatch: options.onlyIf.etagDoesNotMatch,
          }),
        );
        const stored = await this.head(key);
        if (!stored || !output.ETag) throw invalidResponse('conditional-put');
        return { ...stored, httpEtag: httpEtag(output.ETag) };
      } catch (error) {
        if (
          (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 412
        )
          return null;
        throw error;
      }
    }
    const upload = this.createUpload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: uploadBody(value),
        ...uploadMetadata(options),
      },
      queueSize: 2,
      partSize: MULTIPART_PART_SIZE,
      leavePartsOnError: false,
    });
    await upload.done();
    const stored = await this.head(key);
    if (!stored) throw invalidResponse('put');
    return stored;
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async createMultipartUpload(
    key: string,
    options?: ObjectStoragePutOptions,
  ): Promise<ObjectStorageMultipartUpload> {
    const output = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        ...uploadMetadata(options),
      }),
    );
    if (!output.UploadId) throw invalidResponse('multipart');
    return this.resumeMultipartUpload(key, output.UploadId);
  }

  resumeMultipartUpload(key: string, uploadId: string): ObjectStorageMultipartUpload {
    const identity = { Bucket: this.bucket, Key: key, UploadId: uploadId };
    return {
      key,
      uploadId,
      uploadPart: async (partNumber, value) => {
        const output = await this.client.send(
          new UploadPartCommand({
            ...identity,
            PartNumber: partNumber,
            Body: new Uint8Array(value),
            ContentLength: value.byteLength,
          }),
        );
        if (!output.ETag) throw invalidResponse('part');
        return { partNumber, etag: output.ETag };
      },
      complete: async (parts) => {
        await this.client.send(
          new CompleteMultipartUploadCommand({
            ...identity,
            MultipartUpload: {
              Parts: parts.map((part) => ({ PartNumber: part.partNumber, ETag: part.etag })),
            },
          }),
        );
        const object = await this.head(key);
        if (!object) throw invalidResponse('complete');
        return object;
      },
      abort: async () => {
        try {
          await this.client.send(new AbortMultipartUploadCommand(identity));
        } catch (error) {
          if ((error as { name?: string }).name !== 'NoSuchUpload') throw error;
        }
      },
    };
  }
}

export function createR2S3Client(config: R2S3ClientConfig): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    // R2 does not need the SDK's opportunistic checksum negotiation. Required
    // checksums still pass through, while multipart streaming remains portable.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}
