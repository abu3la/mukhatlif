import { AwsClient } from 'aws4fetch';
import type { Env } from '../env';

/**
 * Signs single-part PUT links so a browser can send multipart bytes straight to
 * R2. The link is bound to one key, upload id and part number, and expires.
 * Hostinger signs with the R2 keys it already holds; the development Worker
 * signs only when its own R2 keys are configured as secrets.
 */
export interface R2UploadSigner {
  uploadPartUrl(
    key: string,
    uploadId: string,
    partNumber: number,
    expiresSeconds: number,
  ): Promise<string>;
}

export interface R2UploadSignerConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export const MAX_SIGNED_URL_SECONDS = 3600;

function objectPath(bucket: string, key: string): string {
  return [bucket, ...key.split('/')].map(encodeURIComponent).join('/');
}

export function createR2UploadSigner(config: R2UploadSignerConfig): R2UploadSigner {
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: 's3',
    region: 'auto',
  });
  const origin = `https://${config.accountId}.r2.cloudflarestorage.com`;
  return {
    async uploadPartUrl(key, uploadId, partNumber, expiresSeconds) {
      const seconds = Math.max(1, Math.min(MAX_SIGNED_URL_SECONDS, Math.floor(expiresSeconds)));
      const url = new URL(`${origin}/${objectPath(config.bucket, key)}`);
      url.searchParams.set('partNumber', String(partNumber));
      url.searchParams.set('uploadId', uploadId);
      url.searchParams.set('X-Amz-Expires', String(seconds));
      const signed = await client.sign(new Request(url, { method: 'PUT' }), {
        aws: { signQuery: true },
      });
      return signed.url;
    },
  };
}

function configured(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

/** The signer for the media bucket, or undefined when this runtime cannot sign. */
export function getMediaUploadSigner(env: Env): R2UploadSigner | undefined {
  if (env.MEDIA_UPLOAD_SIGNER) return env.MEDIA_UPLOAD_SIGNER;
  const accountId = configured(env.R2_ACCOUNT_ID);
  const accessKeyId = configured(env.R2_ACCESS_KEY_ID);
  const secretAccessKey = configured(env.R2_SECRET_ACCESS_KEY);
  const bucket = configured(env.R2_MEDIA_BUCKET);
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return undefined;
  if (!/^[a-f0-9]{32}$/i.test(accountId)) return undefined;
  return createR2UploadSigner({ accountId, accessKeyId, secretAccessKey, bucket });
}
