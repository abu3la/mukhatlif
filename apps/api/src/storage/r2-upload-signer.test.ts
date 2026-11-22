import { describe, expect, it } from 'vitest';
import type { Env } from '../env';
import { createR2UploadSigner, getMediaUploadSigner } from './r2-upload-signer';

const config = {
  accountId: 'a'.repeat(32),
  accessKeyId: 'r2-access-key-for-tests',
  secretAccessKey: 'r2-secret-access-key-for-tests',
  bucket: 'mukhtalif-media',
};

describe('R2 upload part links', () => {
  it('signs one part of one upload with a capped lifetime', async () => {
    const signer = createR2UploadSigner(config);
    const url = new URL(
      await signer.uploadPartUrl('learning/production/course-1/abc.mp4', 'up/load+id', 7, 99_999),
    );
    expect(url.origin).toBe(`https://${config.accountId}.r2.cloudflarestorage.com`);
    expect(url.pathname).toBe('/mukhtalif-media/learning/production/course-1/abc.mp4');
    expect(url.searchParams.get('partNumber')).toBe('7');
    expect(url.searchParams.get('uploadId')).toBe('up/load+id');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('3600');
    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(url.searchParams.get('X-Amz-Credential')).toMatch(
      /^r2-access-key-for-tests\/\d{8}\/auto\/s3\/aws4_request$/,
    );
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/);
    expect(url.toString()).not.toContain(config.secretAccessKey);
  });

  it('signs different parts differently', async () => {
    const signer = createR2UploadSigner(config);
    const [one, two] = await Promise.all(
      [1, 2].map((part) => signer.uploadPartUrl('k', 'u', part, 60)),
    );
    expect(new URL(one).searchParams.get('X-Amz-Signature')).not.toBe(
      new URL(two).searchParams.get('X-Amz-Signature'),
    );
  });
});

describe('choosing the media upload signer', () => {
  const secrets: Env = {
    R2_ACCOUNT_ID: config.accountId,
    R2_ACCESS_KEY_ID: config.accessKeyId,
    R2_SECRET_ACCESS_KEY: config.secretAccessKey,
    R2_MEDIA_BUCKET: config.bucket,
  };

  it('uses the injected Hostinger signer first', () => {
    const injected = { uploadPartUrl: async () => 'https://signed.test' };
    expect(getMediaUploadSigner({ MEDIA_UPLOAD_SIGNER: injected })).toBe(injected);
  });

  it('builds a Worker signer only from a complete, valid set of R2 settings', () => {
    expect(getMediaUploadSigner(secrets)).toBeDefined();
    for (const key of Object.keys(secrets) as (keyof Env)[])
      expect(getMediaUploadSigner({ ...secrets, [key]: ' ' })).toBeUndefined();
    expect(getMediaUploadSigner({ ...secrets, R2_ACCOUNT_ID: 'not-an-account' })).toBeUndefined();
    expect(getMediaUploadSigner({})).toBeUndefined();
  });
});
