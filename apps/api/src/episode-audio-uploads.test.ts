import { describe, expect, it } from 'vitest';
import type { Episode, EpisodeAudioUploadSession } from '@mukhtalif/types';
import app from './index';
import { getRepository } from './repo';
import type { Env } from './env';
import type {
  ObjectStorageBucket,
  ObjectStoragePutOptions,
  ObjectStoragePutValue,
  ObjectStorageMultipartUpload,
} from './storage/object-storage';

class MultipartBucket implements ObjectStorageBucket {
  objects = new Map<
    string,
    { bytes: ArrayBuffer; options?: ObjectStoragePutOptions; etag: string }
  >();
  uploads = new Map<
    string,
    { key: string; options?: ObjectStoragePutOptions; parts: Map<number, ArrayBuffer> }
  >();
  aborted: string[] = [];
  beforeComplete?: () => Promise<void>;
  async head(key: string) {
    const object = this.objects.get(key);
    return object
      ? {
          size: object.bytes.byteLength,
          httpEtag: object.etag,
          httpMetadata: object.options?.httpMetadata,
        }
      : null;
  }
  async get(key: string) {
    const head = await this.head(key);
    return head ? { ...head, body: new Response(this.objects.get(key)!.bytes).body! } : null;
  }
  async put(key: string, value: ObjectStoragePutValue, options?: ObjectStoragePutOptions) {
    if (options?.onlyIf?.etagMatches && this.objects.get(key)?.etag !== options.onlyIf.etagMatches)
      return null;
    const bytes = await new Response(value as BodyInit).arrayBuffer();
    this.objects.set(key, { bytes, options, etag: crypto.randomUUID() });
    return this.head(key);
  }
  async delete(key: string) {
    this.objects.delete(key);
  }
  async createMultipartUpload(key: string, options?: ObjectStoragePutOptions) {
    const id = crypto.randomUUID();
    this.uploads.set(id, { key, options, parts: new Map() });
    return this.resumeMultipartUpload(key, id);
  }
  resumeMultipartUpload(key: string, uploadId: string): ObjectStorageMultipartUpload {
    return {
      key,
      uploadId,
      uploadPart: async (partNumber, value) => {
        const upload = this.uploads.get(uploadId);
        if (!upload) throw new Error('NoSuchUpload');
        upload.parts.set(partNumber, value);
        return { partNumber, etag: `part-${partNumber}` };
      },
      abort: async () => {
        this.uploads.delete(uploadId);
        this.aborted.push(uploadId);
      },
      complete: async (parts) => {
        await this.beforeComplete?.();
        const upload = this.uploads.get(uploadId)!;
        const blob = new Blob(parts.map((part) => upload.parts.get(part.partNumber)!));
        await this.put(key, blob, upload.options);
        this.uploads.delete(uploadId);
        return (await this.head(key))!;
      },
    };
  }
}
const base = '/studio/episodes/ep-1001/audio-uploads';
const envFor = (bucket: MultipartBucket): Env => ({
  APP_ENV: 'development',
  ALLOW_DEV_AUTH: 'true',
  AUDIO: bucket,
  CORS_ALLOWED_ORIGINS: 'http://127.0.0.1:3001',
});
function request(
  bucket: MultipartBucket,
  path: string,
  method = 'GET',
  body?: BodyInit,
  headers?: Record<string, string>,
) {
  return app.request(
    path,
    { method, body, headers: { 'x-dev-user': 'usr-admin-1', ...headers } },
    envFor(bucket),
  );
}
async function create(bucket: MultipartBucket, size = 6) {
  const response = await request(
    bucket,
    base,
    'POST',
    JSON.stringify({ size, fileName: 'test.mp3', contentType: 'audio/mpeg' }),
    { 'content-type': 'application/json' },
  );
  expect(response.status).toBe(201);
  return (await response.json()) as EpisodeAudioUploadSession;
}
async function putPart(
  bucket: MultipartBucket,
  session: EpisodeAudioUploadSession,
  body = new Uint8Array([1, 2, 3, 4, 5, 6]),
  part = 1,
  hashOverride?: string,
) {
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', body)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
  return request(
    bucket,
    `${base}/${session.id}/parts/${part}?sha256=${hashOverride ?? hash}`,
    'PUT',
    body,
    { 'content-length': String(body.byteLength) },
  );
}

describe('authenticated resumable episode audio', () => {
  it('requires operator permission and binds reservations to the actor and episode', async () => {
    const bucket = new MultipartBucket();
    const denied = await request(bucket, base, 'POST', '{}', {
      'content-type': 'application/json',
      'x-dev-user': 'usr-listener-1',
    });
    expect(denied.status).toBe(403);
    const session = await create(bucket);
    expect(session).not.toHaveProperty('key');
    expect(session).not.toHaveProperty('uploadId');
    expect(
      (await request(bucket, `/studio/episodes/ep-other/audio-uploads/${session.id}`)).status,
    ).toBe(404);
    const key = [...bucket.objects.keys()].find((key) => key.endsWith('session.json'))!;
    const record = (await new Response(bucket.objects.get(key)!.bytes).json()) as Record<
      string,
      unknown
    >;
    await bucket.put(key, JSON.stringify({ ...record, actorId: 'different-owner' }));
    expect((await request(bucket, `${base}/${session.id}`)).status).toBe(404);
  });

  it('rejects invalid size, type, empty file and unknown episodes', async () => {
    const bucket = new MultipartBucket();
    for (const input of [
      { size: 0, contentType: 'audio/mpeg' },
      { size: 600 * 1024 * 1024, contentType: 'audio/mpeg' },
      { size: 6, contentType: 'text/html' },
    ]) {
      const response = await request(
        bucket,
        base,
        'POST',
        JSON.stringify({ fileName: 'bad.mp3', ...input }),
        { 'content-type': 'application/json' },
      );
      expect(response.status).toBeGreaterThanOrEqual(400);
    }
    expect(bucket.uploads.size).toBe(0);
  });

  it('verifies part checksum and exact size before persisting a receipt', async () => {
    const bucket = new MultipartBucket();
    const session = await create(bucket);
    expect((await putPart(bucket, session, undefined, 1, '0'.repeat(64))).status).toBe(422);
    expect((await putPart(bucket, session, new Uint8Array(7))).status).toBe(422);
    expect((await putPart(bucket, session, undefined, 2)).status).toBe(400);
    expect((await putPart(bucket, session)).status).toBe(200);
    const saved = (await (
      await request(bucket, `${base}/${session.id}`)
    ).json()) as EpisodeAudioUploadSession;
    expect(saved.uploadedParts).toEqual([1]);
  });

  it('completes multiple parts and reconciles a repeated completion without recopying', async () => {
    const bucket = new MultipartBucket();
    const size = 16 * 1024 * 1024 + 6;
    const previous = (await getRepository(envFor(bucket)).getEpisode('ep-1001'))!.audioKey;
    const session = await create(bucket, size);
    expect((await request(bucket, `${base}/${session.id}/complete`, 'POST')).status).toBe(409);
    expect((await putPart(bucket, session, new Uint8Array(session.partSize))).status).toBe(200);
    expect((await putPart(bucket, session, undefined, 2)).status).toBe(200);
    const result = await request(bucket, `${base}/${session.id}/complete`, 'POST');
    expect(result.status).toBe(200);
    const episode = (await result.json()) as Episode;
    expect(episode.audioKey).not.toBe(previous);
    expect((await bucket.head(episode.audioKey!))?.size).toBe(size);
    expect((await request(bucket, `${base}/${session.id}/complete`, 'POST')).status).toBe(200);
    expect(
      ((await (await request(bucket, `${base}/${session.id}`)).json()) as EpisodeAudioUploadSession)
        .status,
    ).toBe('completed');
  });

  it('cancels only the reservation, preserves old bytes and link, and refuses completion', async () => {
    const bucket = new MultipartBucket();
    const repo = getRepository(envFor(bucket));
    await bucket.put('old-audio.mp3', 'original');
    await repo.setEpisodeAudioKey('ep-1001', 'old-audio.mp3');
    const session = await create(bucket);
    await putPart(bucket, session);
    expect((await request(bucket, `${base}/${session.id}`, 'DELETE')).status).toBe(200);
    expect((await request(bucket, `${base}/${session.id}`, 'DELETE')).status).toBe(200);
    expect((await request(bucket, `${base}/${session.id}/complete`, 'POST')).status).toBe(409);
    expect((await repo.getEpisode('ep-1001'))?.audioKey).toBe('old-audio.mp3');
    expect(await new Response((await bucket.get('old-audio.mp3'))!.body).text()).toBe('original');
  });

  it('prevents a second uploader from overwriting a newly replaced audio link', async () => {
    const bucket = new MultipartBucket();
    const first = await create(bucket);
    const second = await create(bucket);
    await putPart(bucket, first);
    await putPart(bucket, second);
    const winner = (await (
      await request(bucket, `${base}/${first.id}/complete`, 'POST')
    ).json()) as Episode;
    expect((await request(bucket, `${base}/${second.id}/complete`, 'POST')).status).toBe(409);
    expect((await getRepository(envFor(bucket)).getEpisode('ep-1001'))?.audioKey).toBe(
      winner.audioKey,
    );
  });

  it('locks cancellation out once final verification begins', async () => {
    const bucket = new MultipartBucket();
    const session = await create(bucket);
    await putPart(bucket, session);
    let started!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    bucket.beforeComplete = async () => {
      started();
      await released;
    };
    const completion = request(bucket, `${base}/${session.id}/complete`, 'POST');
    await entered;
    expect((await request(bucket, `${base}/${session.id}`, 'DELETE')).status).toBe(409);
    release();
    expect((await completion).status).toBe(200);
    expect(bucket.aborted).toEqual([]);
  });
});
