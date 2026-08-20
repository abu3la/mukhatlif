import { describe, expect, it } from 'vitest';
import type { Episode } from '@mukhtalif/types';
import { resolveAudioMediaMimeType, safeAudioMediaContentType } from '@mukhtalif/types';
import type { Env } from './env';
import app from './index';

/** Minimal R2 double: enough to record what the route stored and served. */
class FakeAudioBucket {
  readonly objects = new Map<string, { bytes: Uint8Array; contentType: string }>();

  async put(key: string, value: ReadableStream | ArrayBuffer | null, options?: {
    httpMetadata?: { contentType?: string };
  }) {
    const bytes =
      value instanceof ArrayBuffer
        ? new Uint8Array(value)
        : new Uint8Array(await new Response(value).arrayBuffer());
    const contentType = options?.httpMetadata?.contentType ?? 'application/octet-stream';
    this.objects.set(key, { bytes, contentType });
    return { key, size: bytes.length };
  }

  async get(key: string, options?: { range?: { offset: number; length?: number } }) {
    const object = this.objects.get(key);
    if (!object) return null;
    const bytes = options?.range
      ? object.bytes.slice(
          options.range.offset,
          options.range.length === undefined
            ? undefined
            : options.range.offset + options.range.length,
        )
      : object.bytes;
    return {
      key,
      size: object.bytes.length,
      httpMetadata: { contentType: object.contentType },
      body: new Response(bytes).body,
    };
  }

  async delete(key: string) {
    this.objects.delete(key);
  }
}

function audioEnv(bucket: FakeAudioBucket): Env {
  return {
    APP_ENV: 'development',
    ALLOW_DEV_AUTH: 'true',
    CORS_ALLOWED_ORIGINS: 'http://127.0.0.1:3001',
    AUDIO: bucket as unknown as R2Bucket,
  };
}

const BYTES = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00]);

function upload(
  bucket: FakeAudioBucket,
  headers: Record<string, string>,
  body: BodyInit | null = BYTES,
  identityId = 'usr-admin-1',
) {
  const requestHeaders = new Headers(headers);
  requestHeaders.set('x-dev-user', identityId);
  return app.request(
    '/episodes/ep-1001/audio',
    { method: 'PUT', headers: requestHeaders, body },
    audioEnv(bucket),
  );
}

const validHeaders = {
  'content-type': 'audio/mpeg',
  'content-length': String(BYTES.length),
};

describe('episode audio upload', () => {
  it('requires episodes.manage', async () => {
    const bucket = new FakeAudioBucket();
    expect((await upload(bucket, validHeaders, BYTES, 'usr-listener-1')).status).toBe(403);
    expect(bucket.objects.size).toBe(0);
  });

  it('reports a missing R2 binding rather than silently dropping the file', async () => {
    const headers = new Headers({ ...validHeaders, 'x-dev-user': 'usr-admin-1' });
    const response = await app.request(
      '/episodes/ep-1001/audio',
      { method: 'PUT', headers, body: BYTES },
      { APP_ENV: 'development', ALLOW_DEV_AUTH: 'true', CORS_ALLOWED_ORIGINS: 'http://x.test' },
    );
    expect(response.status).toBe(503);
  });

  it('stores the object under an extension-bearing key and links it to the episode', async () => {
    const bucket = new FakeAudioBucket();
    const response = await upload(bucket, validHeaders);
    expect(response.status).toBe(200);
    const episode = (await response.json()) as Episode;
    expect(episode.audioKey).toBe('episodes/ep-1001.mp3');
    expect(bucket.objects.get('episodes/ep-1001.mp3')?.contentType).toBe('audio/mpeg');
  });

  it('accepts a content type carrying codec parameters', async () => {
    const bucket = new FakeAudioBucket();
    const response = await upload(bucket, {
      ...validHeaders,
      'content-type': 'audio/ogg; codecs=opus',
    });
    expect(response.status).toBe(200);
    expect(bucket.objects.get('episodes/ep-1001.ogg')?.contentType).toBe('audio/ogg');
  });

  it('refuses a non-audio content type so active content cannot be parked on the origin', async () => {
    const bucket = new FakeAudioBucket();
    for (const contentType of ['text/html', 'image/svg+xml', 'application/octet-stream']) {
      const response = await upload(bucket, { ...validHeaders, 'content-type': contentType });
      expect(response.status).toBe(415);
    }
    expect(bucket.objects.size).toBe(0);
  });

  it('refuses an encoded body and a missing Content-Length', async () => {
    const bucket = new FakeAudioBucket();
    expect(
      (await upload(bucket, { ...validHeaders, 'content-encoding': 'gzip' })).status,
    ).toBe(415);
    const withoutLength = await upload(bucket, { 'content-type': 'audio/mpeg' });
    expect(withoutLength.status).toBe(411);
    expect(bucket.objects.size).toBe(0);
  });

  it('refuses a declared size beyond the documented maximum', async () => {
    const bucket = new FakeAudioBucket();
    const response = await upload(bucket, {
      'content-type': 'audio/mpeg',
      'content-length': String(512 * 1024 * 1024 + 1),
    });
    expect(response.status).toBe(413);
    expect(bucket.objects.size).toBe(0);
  });

  it('discards a stored object whose real size contradicts Content-Length', async () => {
    const bucket = new FakeAudioBucket();
    const response = await upload(bucket, {
      'content-type': 'audio/mpeg',
      'content-length': String(BYTES.length + 10),
    });
    expect(response.status).toBe(422);
    // A truncated upload must never stay linked to the episode.
    expect(bucket.objects.size).toBe(0);
  });

  it('returns 404 for an unknown episode', async () => {
    const bucket = new FakeAudioBucket();
    const headers = new Headers({ ...validHeaders, 'x-dev-user': 'usr-admin-1' });
    const response = await app.request(
      '/episodes/ep-missing/audio',
      { method: 'PUT', headers, body: BYTES },
      audioEnv(bucket),
    );
    expect(response.status).toBe(404);
  });
});

describe('episode audio delivery', () => {
  it('serves the stored audio with nosniff and a clamped content type', async () => {
    const bucket = new FakeAudioBucket();
    expect((await upload(bucket, validHeaders)).status).toBe(200);
    const response = await app.request('/episodes/ep-1001/audio', {}, audioEnv(bucket));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('audio/mpeg');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('accept-ranges')).toBe('bytes');
  });

  it('never echoes a dangerous content type stored before the allowlist existed', async () => {
    const bucket = new FakeAudioBucket();
    expect((await upload(bucket, validHeaders)).status).toBe(200);
    // Simulate a legacy object written by the previous unvalidated route.
    bucket.objects.set('episodes/ep-1001.mp3', {
      bytes: BYTES,
      contentType: 'text/html',
    });
    const response = await app.request('/episodes/ep-1001/audio', {}, audioEnv(bucket));
    expect(response.headers.get('content-type')).toBe('audio/mpeg');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('serves a byte range with the same protective headers', async () => {
    const bucket = new FakeAudioBucket();
    expect((await upload(bucket, validHeaders)).status).toBe(200);
    const response = await app.request(
      '/episodes/ep-1001/audio',
      { headers: { range: 'bytes=0-3' } },
      audioEnv(bucket),
    );
    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe(`bytes 0-3/${BYTES.length}`);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });
});

describe('shared audio media contract', () => {
  it('prefers the declared type and falls back to the file extension', () => {
    expect(resolveAudioMediaMimeType('audio/flac', 'a.mp3')).toBe('audio/flac');
    expect(resolveAudioMediaMimeType('', 'episode-24.m4a')).toBe('audio/mp4');
    expect(resolveAudioMediaMimeType(undefined, 'EPISODE.WAV')).toBe('audio/wav');
    // octet-stream is not an audio type, so the extension decides.
    expect(resolveAudioMediaMimeType('application/octet-stream', 'x.opus')).toBe('audio/opus');
    expect(resolveAudioMediaMimeType('application/octet-stream', 'x.exe')).toBeNull();
  });

  it('downgrades an unrecognized stored type instead of echoing it', () => {
    expect(safeAudioMediaContentType('text/html')).toBe('audio/mpeg');
    expect(safeAudioMediaContentType('audio/flac')).toBe('audio/flac');
  });
});
