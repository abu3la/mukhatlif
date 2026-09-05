/**
 * The object operations used by the API. Cloudflare's native R2Bucket is
 * structurally compatible with this deliberately small contract; Hostinger's
 * Node runtime supplies the S3 implementation in r2-s3.ts.
 */
export interface ObjectStorageHttpMetadata {
  contentType?: string;
  contentDisposition?: string;
  contentLanguage?: string;
  contentEncoding?: string;
  cacheControl?: string;
  cacheExpiry?: Date;
}

export interface ObjectStorageObject {
  size: number;
  httpEtag: string;
  httpMetadata?: ObjectStorageHttpMetadata;
}

export interface ObjectStorageObjectBody extends ObjectStorageObject {
  body: ReadableStream;
}

export type ObjectStorageRange =
  { offset: number; length?: number } | { offset?: number; length: number } | { suffix: number };

export interface ObjectStorageGetOptions {
  range?: ObjectStorageRange;
}

export interface ObjectStoragePutOptions {
  httpMetadata?: ObjectStorageHttpMetadata;
  onlyIf?: { etagMatches?: string; etagDoesNotMatch?: string };
}

export interface ObjectStorageUploadedPart {
  partNumber: number;
  etag: string;
}

export interface ObjectStorageMultipartUpload {
  key: string;
  uploadId: string;
  uploadPart(partNumber: number, value: ArrayBuffer): Promise<ObjectStorageUploadedPart>;
  complete(parts: ObjectStorageUploadedPart[]): Promise<ObjectStorageObject>;
  abort(): Promise<void>;
}

export type ObjectStoragePutValue =
  ReadableStream | ArrayBuffer | ArrayBufferView | string | Blob | null;

export interface ObjectStorageBucket {
  createMultipartUpload?(
    key: string,
    options?: ObjectStoragePutOptions,
  ): Promise<ObjectStorageMultipartUpload>;
  resumeMultipartUpload?(key: string, uploadId: string): ObjectStorageMultipartUpload;
  head(key: string): Promise<ObjectStorageObject | null>;
  get(key: string, options?: ObjectStorageGetOptions): Promise<ObjectStorageObjectBody | null>;
  put(
    key: string,
    value: ObjectStoragePutValue,
    options?: ObjectStoragePutOptions,
  ): Promise<ObjectStorageObject | null>;
  delete(key: string): Promise<void>;
}
