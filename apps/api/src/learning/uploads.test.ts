import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../env';
import type { R2UploadSigner } from '../storage/r2-upload-signer';
import { upload } from './uploads';
import { LearningError } from './domain';

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({ assets: [] as Record<string, unknown>[] }));

/** Just enough of the Supabase query builder for learning_assets. */
function query() {
  const filters: [string, unknown][] = [];
  let patch: Row | null = null;
  const matches = () => db.assets.filter((row) => filters.every(([k, v]) => row[k] === v));
  const builder = {
    insert: async (row: Row) => {
      db.assets.push({
        ready: false,
        parts: [],
        received: 0,
        created_at: new Date().toISOString(),
        ...row,
      });
      return { error: null };
    },
    select: () => {
      if (patch) {
        const updated = apply();
        return Promise.resolve({ data: updated.map((row) => ({ id: row.id })), error: null });
      }
      return builder;
    },
    update: (values: Row) => {
      patch = values;
      return builder;
    },
    eq: (key: string, value: unknown) => {
      filters.push([key, value]);
      return builder;
    },
    // Like Supabase, a read returns a copy, not the stored row.
    maybeSingle: async () => ({
      data: matches()[0] ? structuredClone(matches()[0]) : null,
      error: null,
    }),
    then: (resolve: (value: { error: null }) => void) => {
      apply();
      resolve({ error: null });
    },
  };
  const apply = () => {
    const rows = matches();
    for (const row of rows) Object.assign(row, patch);
    return rows;
  };
  return builder;
}

vi.mock('./service', () => ({
  learningDb: () => ({ from: () => query() }),
  checkDb: (error: unknown) => {
    if (error) throw error;
  },
}));

const CHUNK = 5 * 1024 * 1024;
const actor = { id: 'admin-1', name: 'Studio', admin: true };

/** An R2 stand-in: parts land by part number, as a browser PUT to a signed link would. */
function fakeBucket() {
  const objects = new Map<string, Uint8Array>();
  const uploads = new Map<string, { key: string; parts: Map<number, Uint8Array> }>();
  const handle = (key: string, uploadId: string) => ({
    key,
    uploadId,
    uploadPart: async (partNumber: number, value: ArrayBuffer) => {
      uploads.get(uploadId)!.parts.set(partNumber, new Uint8Array(value));
      return { partNumber, etag: `etag${partNumber}` };
    },
    complete: async (parts: { partNumber: number; etag: string }[]) => {
      const stored = uploads.get(uploadId)!.parts;
      for (const part of parts)
        if (!stored.has(part.partNumber) || part.etag !== `etag${part.partNumber}`)
          throw new Error('InvalidPart');
      const total = parts.reduce((sum, part) => sum + stored.get(part.partNumber)!.length, 0);
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const part of parts) {
        bytes.set(stored.get(part.partNumber)!, offset);
        offset += stored.get(part.partNumber)!.length;
      }
      objects.set(key, bytes);
      return { size: total, httpEtag: '"whole"' };
    },
    abort: async () => undefined,
  });
  return {
    objects,
    /** What R2 does when the browser PUTs one part to its signed link. */
    browserPut(uploadId: string, partNumber: number, bytes: Uint8Array) {
      uploads.get(uploadId)!.parts.set(partNumber, bytes);
      return `"etag${partNumber}"`;
    },
    createMultipartUpload: async (key: string) => {
      const uploadId = `upload-${uploads.size + 1}`;
      uploads.set(uploadId, { key, parts: new Map() });
      return handle(key, uploadId);
    },
    resumeMultipartUpload: handle,
    head: async (key: string) =>
      objects.has(key) ? { size: objects.get(key)!.length, httpEtag: '"whole"' } : null,
    get: vi.fn(async (key: string, options?: { range?: { offset: number; length: number } }) => {
      const bytes = objects.get(key);
      if (!bytes) return null;
      const { offset = 0, length = bytes.length } = options?.range ?? {};
      return {
        body: new Blob([bytes.slice(offset, offset + length)]).stream(),
        size: bytes.length,
        httpEtag: '"whole"',
      };
    }),
    put: async () => null,
    delete: vi.fn(async (key: string) => {
      objects.delete(key);
    }),
  };
}

function mp4(size: number) {
  const bytes = new Uint8Array(size);
  bytes.set([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70]);
  return bytes;
}

let bucket: ReturnType<typeof fakeBucket>;
let signer: R2UploadSigner & { uploadPartUrl: ReturnType<typeof vi.fn> };
let env: Env;
const run = (action: string, payload: Record<string, unknown>, who = actor) =>
  upload(env, 'course-1', `studio.${action}`, payload, who);
async function failure(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(LearningError);
  return error as LearningError;
}
async function startDirect(size: number) {
  const session = (await run('upload-start', { filename: 'abc.mp4', size })) as {
    token: string;
  };
  const row = db.assets.find((asset) => asset.id === session.token)!;
  return { token: session.token, row, uploadId: String(row.upload_id) };
}

beforeEach(() => {
  db.assets = [];
  bucket = fakeBucket();
  signer = {
    uploadPartUrl: vi.fn(
      async (key: string, uploadId: string, part: number, seconds: number) =>
        `https://r2.test/${key}?partNumber=${part}&uploadId=${uploadId}&X-Amz-Expires=${seconds}`,
    ),
  };
  env = {
    SUPABASE_URL: 'https://db.test',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
    MEDIA: bucket as unknown as Env['MEDIA'],
    MEDIA_UPLOAD_SIGNER: signer,
  };
});

describe('starting a course upload', () => {
  it('offers the direct route only when this runtime can sign R2 links', async () => {
    expect(await run('upload-start', { filename: 'a.mp4', size: 10 })).toMatchObject({
      chunkSize: CHUNK,
      direct: true,
    });
    env.MEDIA_UPLOAD_SIGNER = undefined;
    const fallback = await run('upload-start', { filename: 'b.mp4', size: 10 });
    expect(fallback).toMatchObject({ chunkSize: CHUNK });
    expect(fallback).not.toHaveProperty('direct');
  });
});

describe('signing part links', () => {
  it('signs the requested parts for the owner, never past the upload lifetime', async () => {
    const { token, uploadId, row } = await startDirect(CHUNK * 2 + 10);
    const result = (await run('upload-sign', { token, parts: [1, 3] })) as {
      urls: { part: number; url: string }[];
      expiresIn: number;
    };
    expect(result.urls.map(({ part }) => part)).toEqual([1, 3]);
    expect(result.expiresIn).toBe(3600);
    expect(signer.uploadPartUrl).toHaveBeenCalledWith(row.object_key, uploadId, 3, 3600);
    row.created_at = new Date(Date.now() - 23.9 * 3600 * 1000).toISOString();
    const late = (await run('upload-sign', { token, parts: [2] })) as { expiresIn: number };
    expect(late.expiresIn).toBeLessThanOrEqual(360);
    row.created_at = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
    expect((await failure(run('upload-sign', { token, parts: [2] }))).status).toBe(422);
  });

  it('rejects parts past the end, repeated parts, other owners and a missing signer', async () => {
    const { token } = await startDirect(CHUNK + 1);
    expect((await failure(run('upload-sign', { token, parts: [3] }))).status).toBe(422);
    expect((await failure(run('upload-sign', { token, parts: [1, 1] }))).status).toBe(422);
    const stranger = { ...actor, id: 'admin-2' };
    expect((await failure(run('upload-sign', { token, parts: [1] }, stranger))).status).toBe(422);
    env.MEDIA_UPLOAD_SIGNER = undefined;
    expect((await failure(run('upload-sign', { token, parts: [1] }))).status).toBe(503);
    expect(signer.uploadPartUrl).not.toHaveBeenCalled();
  });

  it('does not mix direct parts into an upload that already sent pieces through the API', async () => {
    const { token, row } = await startDirect(CHUNK + 1);
    row.received = CHUNK;
    expect((await failure(run('upload-sign', { token, parts: [2] }))).status).toBe(409);
    expect(
      (await failure(run('upload-finish', { token, parts: [{ part: 1, etag: 'etag1' }] }))).status,
    ).toBe(409);
  });
});

describe('finishing a direct upload', () => {
  it('assembles the parts the browser sent, checks the stored file and marks it ready', async () => {
    const size = CHUNK * 2 + 100;
    const { token, uploadId, row } = await startDirect(size);
    const bytes = mp4(size);
    const parts = [1, 2, 3].map((part) => ({
      part,
      etag: bucket.browserPut(uploadId, part, bytes.slice((part - 1) * CHUNK, part * CHUNK)),
    }));
    expect(parts[0].etag).toBe('"etag1"');
    expect(await run('upload-finish', { token, parts })).toEqual({
      file: `/private/files/${token}`,
    });
    expect(row).toMatchObject({ ready: true, upload_id: null, received: size });
    expect(bucket.objects.get(String(row.object_key))?.length).toBe(size);
    expect(bucket.get).toHaveBeenCalledWith(row.object_key, { range: { offset: 0, length: 16 } });
    // A repeated finish after success is harmless.
    expect(await run('upload-finish', { token, parts })).toEqual({
      file: `/private/files/${token}`,
    });
  });

  it('requires every part, in order, before assembling', async () => {
    const { token, uploadId } = await startDirect(CHUNK + 1);
    const first = bucket.browserPut(uploadId, 1, mp4(CHUNK));
    expect(
      (await failure(run('upload-finish', { token, parts: [{ part: 1, etag: first }] }))).status,
    ).toBe(422);
    expect(
      (
        await failure(
          run('upload-finish', {
            token,
            parts: [
              { part: 2, etag: 'etag2' },
              { part: 1, etag: first },
            ],
          }),
        )
      ).status,
    ).toBe(422);
  });

  it('leaves the upload unfinished when R2 rejects a reported part', async () => {
    const { token, uploadId, row } = await startDirect(CHUNK);
    bucket.browserPut(uploadId, 1, mp4(CHUNK));
    const error = await failure(
      run('upload-finish', { token, parts: [{ part: 1, etag: 'forged' }] }),
    );
    expect(error.status).toBe(503);
    expect(row.ready).toBe(false);
  });

  it('deletes a stored file whose content does not match its type', async () => {
    const { token, uploadId, row } = await startDirect(CHUNK);
    const etag = bucket.browserPut(uploadId, 1, new Uint8Array(CHUNK));
    const error = await failure(run('upload-finish', { token, parts: [{ part: 1, etag }] }));
    expect(error.status).toBe(422);
    expect(bucket.delete).toHaveBeenCalledWith(row.object_key);
    expect(bucket.objects.has(String(row.object_key))).toBe(false);
    expect(row.ready).toBe(false);
  });

  it('deletes a stored file whose size differs from the declared size', async () => {
    const { token, uploadId, row } = await startDirect(CHUNK + 10);
    const parts = [
      { part: 1, etag: bucket.browserPut(uploadId, 1, mp4(CHUNK)) },
      { part: 2, etag: bucket.browserPut(uploadId, 2, new Uint8Array(500)) },
    ];
    expect((await failure(run('upload-finish', { token, parts }))).status).toBe(422);
    expect(bucket.objects.has(String(row.object_key))).toBe(false);
  });
});

describe('the upload route through the API', () => {
  it('still accepts base64 pieces in order when this runtime cannot sign', async () => {
    env.MEDIA_UPLOAD_SIGNER = undefined;
    const bytes = mp4(100);
    const { token } = (await run('upload-start', { filename: 'a.mp4', size: 100 })) as {
      token: string;
    };
    const content = btoa(String.fromCharCode(...bytes));
    expect(await run('upload-chunk', { token, offset: 0, content })).toEqual({ received: 100 });
    expect(await run('upload-finish', { token })).toEqual({ file: `/private/files/${token}` });
    expect(db.assets[0]).toMatchObject({ ready: true, received: 100 });
  });
});
