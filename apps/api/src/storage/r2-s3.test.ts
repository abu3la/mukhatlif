import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import type { S3Client } from '@aws-sdk/client-s3';
import type { Upload } from '@aws-sdk/lib-storage';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { R2S3Bucket } from './r2-s3';

function sdkBody(value: string) {
  return {
    transformToWebStream: () => new Blob([value]).stream(),
  } as never;
}

describe('R2S3Bucket', () => {
  it('maps a full object to the portable R2 contract', async () => {
    const send = vi.fn().mockResolvedValue({
      Body: sdkBody('hello'),
      ContentLength: 5,
      ETag: 'abc123',
      ContentType: 'text/plain',
      CacheControl: 'public, max-age=60',
    });
    const bucket = new R2S3Bucket({ send } as unknown as S3Client, 'media');

    const object = await bucket.get('hello.txt');

    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(GetObjectCommand);
    expect(object).toMatchObject({
      size: 5,
      httpEtag: '"abc123"',
      httpMetadata: { contentType: 'text/plain', cacheControl: 'public, max-age=60' },
    });
    expect(await new Response(object!.body).text()).toBe('hello');
  });

  it('uses Content-Range total size instead of the ranged ContentLength', async () => {
    const send = vi.fn().mockResolvedValue({
      Body: sdkBody('345'),
      ContentLength: 3,
      ContentRange: 'bytes 3-5/10',
      ETag: '"range"',
    });
    const bucket = new R2S3Bucket({ send } as unknown as S3Client, 'media');

    const object = await bucket.get('asset', { range: { offset: 3, length: 3 } });

    const command = send.mock.calls[0]?.[0] as GetObjectCommand;
    expect(command.input.Range).toBe('bytes=3-5');
    expect(object?.size).toBe(10);
    expect(await new Response(object!.body).text()).toBe('345');
  });

  it('rejects a ranged provider response without a safe total size', async () => {
    const send = vi.fn().mockResolvedValue({
      Body: sdkBody('345'),
      ContentLength: 3,
      ETag: 'range',
    });
    const bucket = new R2S3Bucket({ send } as unknown as S3Client, 'media');

    await expect(bucket.get('asset', { range: { offset: 3, length: 3 } })).rejects.toThrow(
      'R2_S3_INVALID_RANGE_RESPONSE',
    );
  });

  it('maps missing objects to null but does not hide a missing bucket', async () => {
    const missingObject = vi.fn().mockRejectedValue({ name: 'NoSuchKey' });
    const objectBucket = new R2S3Bucket(
      { send: missingObject } as unknown as S3Client,
      'media',
    );
    await expect(objectBucket.get('missing')).resolves.toBeNull();

    const missingBucket = vi.fn().mockRejectedValue({
      name: 'NoSuchBucket',
      $metadata: { httpStatusCode: 404 },
    });
    const broken = new R2S3Bucket({ send: missingBucket } as unknown as S3Client, 'media');
    await expect(broken.head('missing')).rejects.toMatchObject({ name: 'NoSuchBucket' });
  });

  it('streams uploads through the multipart helper then verifies stored size with HEAD', async () => {
    const send = vi.fn().mockResolvedValue({
      ContentLength: 6,
      ETag: 'stored',
      ContentType: 'audio/mpeg',
      CacheControl: 'private, max-age=0',
    });
    const done = vi.fn().mockResolvedValue(undefined);
    const createUpload = vi.fn((_options: ConstructorParameters<typeof Upload>[0]) => ({ done }));
    const bucket = new R2S3Bucket(
      { send } as unknown as S3Client,
      'audio',
      createUpload,
    );
    const stream = new Blob(['stream']).stream();

    const stored = await bucket.put('episode.mp3', stream, {
      httpMetadata: { contentType: 'audio/mpeg', cacheControl: 'private, max-age=0' },
    });

    expect(done).toHaveBeenCalledOnce();
    expect(createUpload).toHaveBeenCalledOnce();
    const upload = createUpload.mock.calls[0]?.[0];
    expect(upload).toBeDefined();
    if (!upload) throw new Error('Expected upload options');
    expect(upload.params).toMatchObject({
      Bucket: 'audio',
      Key: 'episode.mp3',
      ContentType: 'audio/mpeg',
      CacheControl: 'private, max-age=0',
    });
    expect(upload.params.Body).toBeInstanceOf(Readable);
    expect(upload.queueSize).toBe(2);
    expect(upload.leavePartsOnError).toBe(false);
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(HeadObjectCommand);
    expect(stored).toMatchObject({ size: 6, httpEtag: '"stored"' });
  });

  it('passes ArrayBuffer bytes without converting them to text', async () => {
    const send = vi.fn().mockResolvedValue({ ContentLength: 3, ETag: 'bytes' });
    const createUpload = vi.fn((_options: ConstructorParameters<typeof Upload>[0]) => ({
      done: vi.fn().mockResolvedValue(undefined),
    }));
    const bucket = new R2S3Bucket(
      { send } as unknown as S3Client,
      'media',
      createUpload,
    );
    await bucket.put('image', new Uint8Array([0, 1, 255]).buffer);
    expect(createUpload.mock.calls[0]?.[0]?.params.Body).toEqual(new Uint8Array([0, 1, 255]));
  });

  it('deletes from the selected bucket', async () => {
    const send = vi.fn().mockResolvedValue({});
    const bucket = new R2S3Bucket({ send } as unknown as S3Client, 'media');
    await bucket.delete('old');
    const command = send.mock.calls[0]?.[0] as DeleteObjectCommand;
    expect(command).toBeInstanceOf(DeleteObjectCommand);
    expect(command.input).toEqual({ Bucket: 'media', Key: 'old' });
  });
});
