import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import {
  MAX_AUDIO_UPLOAD_BYTES,
  audioMediaExtension,
  parseAudioMediaMimeType,
  type EpisodeAudioUploadSession,
} from '@mukhtalif/types';
import { requirePermission, type AppEnv } from '../auth';
import { getRepository } from '../repo';
import type { ObjectStorageBucket, ObjectStorageUploadedPart } from '../storage/object-storage';

const PART_SIZE = 16 * 1024 * 1024;
const TTL = 24 * 60 * 60 * 1000;
const uuid = z.string().uuid();
interface Session extends Omit<EpisodeAudioUploadSession, 'uploadedParts'> {
  key: string;
  uploadId: string;
  episodeId: string;
  actorId: string;
  contentType: string;
  previousKey: string | null;
}
class UploadError extends Error {
  constructor(
    readonly status: 400 | 404 | 409 | 410 | 413 | 422 | 503,
    readonly code: string,
  ) {
    super(code);
  }
}
const fail = (status: UploadError['status'], code: string): never => {
  throw new UploadError(status, code);
};
function bucketFor(c: Context<AppEnv>) {
  const bucket = c.env.AUDIO;
  if (!bucket?.createMultipartUpload || !bucket.resumeMultipartUpload)
    return fail(503, 'MULTIPART_UNAVAILABLE');
  return bucket;
}
function sessionKey(c: Context<AppEnv>, id: string) {
  // The shared bucket must never make development reservations visible in production.
  const scope = c.env.SUPABASE_URL
    ? new URL(c.env.SUPABASE_URL).hostname
    : `local-${c.env.APP_ENV}`;
  return `_studio-audio-uploads/${scope}/${id}/session.json`;
}
const partKey = (key: string, part: number) => key.replace('session.json', `part-${part}.json`);
const jsonOptions = {
  httpMetadata: { contentType: 'application/json', cacheControl: 'private, no-store' },
};
async function readSession(c: Context<AppEnv>) {
  const id = c.req.param('upload') ?? '';
  if (!uuid.safeParse(id).success) return fail(404, 'UPLOAD_NOT_FOUND');
  const bucket = bucketFor(c);
  const key = sessionKey(c, id);
  const object = await bucket.get(key);
  if (!object) return fail(404, 'UPLOAD_NOT_FOUND');
  const session = (await new Response(object.body).json()) as Session;
  if (session.episodeId !== c.req.param('id') || session.actorId !== c.get('authUserId'))
    return fail(404, 'UPLOAD_NOT_FOUND');
  return { bucket, key, session, etag: object.httpEtag };
}
async function receipts(bucket: ObjectStorageBucket, key: string, session: Session) {
  const result: ObjectStorageUploadedPart[] = [];
  for (let part = 1; part <= session.partCount; part++) {
    const object = await bucket.get(partKey(key, part));
    if (object) result.push((await new Response(object.body).json()) as ObjectStorageUploadedPart);
  }
  return result;
}
function view(session: Session, parts: ObjectStorageUploadedPart[]): EpisodeAudioUploadSession {
  const { id, size, partSize, partCount, fileName, status, expiresAt } = session;
  return {
    id,
    size,
    partSize,
    partCount,
    fileName,
    status,
    expiresAt,
    uploadedParts: parts.map((p) => p.partNumber),
  };
}
async function transition(
  record: Awaited<ReturnType<typeof readSession>>,
  status: Session['status'],
) {
  const next = { ...record.session, status };
  const stored = await record.bucket.put(record.key, JSON.stringify(next), {
    ...jsonOptions,
    onlyIf: { etagMatches: record.etag.replace(/^"|"$/g, '') },
  });
  if (!stored) return fail(409, 'UPLOAD_STATE_CHANGED');
  record.session = next;
  record.etag = stored.httpEtag;
}

/** Bound memory even when an untrusted client lies about Content-Length. */
async function readPart(body: ReadableStream<Uint8Array>, length: number) {
  const reader = body.getReader();
  const bytes = new Uint8Array(length);
  let offset = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (offset + chunk.value.byteLength > length) return fail(413, 'PART_TOO_LARGE');
      bytes.set(chunk.value, offset);
      offset += chunk.value.byteLength;
    }
    if (offset !== length) return fail(422, 'PART_SIZE_MISMATCH');
    return bytes.buffer;
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

export const episodeAudioUploadsRoute = new Hono<AppEnv>()
  .use('*', requirePermission('episodes.manage'))
  .onError((error, c) => {
    if (error instanceof UploadError)
      return c.json({ code: error.code, error: error.message }, error.status);
    console.error('Episode multipart operation failed', error);
    return c.json(
      { code: 'UPLOAD_SERVICE_ERROR', error: 'Audio upload service is unavailable' },
      503,
    );
  })
  .post(
    '/',
    zValidator(
      'json',
      z.object({
        fileName: z.string().trim().min(1).max(255),
        contentType: z.string().max(100),
        size: z.number().int().positive().max(MAX_AUDIO_UPLOAD_BYTES),
      }),
    ),
    async (c) => {
      const input = c.req.valid('json');
      const contentType = parseAudioMediaMimeType(input.contentType);
      if (!contentType) return fail(422, 'AUDIO_MIME_UNSUPPORTED');
      const episode = await getRepository(c.env).getEpisode(c.req.param('id') ?? '');
      if (!episode) return fail(404, 'EPISODE_NOT_FOUND');
      const actorId = c.get('authUserId');
      if (!actorId) return fail(404, 'UPLOAD_NOT_FOUND');
      const bucket = bucketFor(c);
      const id = crypto.randomUUID();
      // Never overwrite an existing episode object, even on cancellation or failure.
      const stem =
        input.fileName
          .replace(/[\\/]|\p{Cc}/gu, '_')
          .replace(/\.[^.]*$/, '')
          .slice(0, 180) || 'audio';
      const key = `episodes/${episode.id}/uploads/${id}/${stem}.${audioMediaExtension(contentType)}`;
      const upload = await bucket.createMultipartUpload!(key, {
        httpMetadata: { contentType, cacheControl: 'private, max-age=0, must-revalidate' },
      });
      const session: Session = {
        id,
        key,
        uploadId: upload.uploadId,
        episodeId: episode.id,
        actorId,
        previousKey: episode.audioKey ?? null,
        contentType,
        fileName: input.fileName,
        size: input.size,
        partSize: PART_SIZE,
        partCount: Math.ceil(input.size / PART_SIZE),
        status: 'active',
        expiresAt: Date.now() + TTL,
      };
      try {
        await bucket.put(sessionKey(c, id), JSON.stringify(session), jsonOptions);
      } catch (error) {
        await upload.abort();
        throw error;
      }
      return c.json(view(session, []), 201);
    },
  )
  .get('/:upload', async (c) => {
    const record = await readSession(c);
    if (record.session.expiresAt < Date.now() && record.session.status === 'active')
      return fail(410, 'UPLOAD_EXPIRED');
    return c.json(view(record.session, await receipts(record.bucket, record.key, record.session)));
  })
  .put('/:upload/parts/:part', async (c) => {
    const { session, bucket, key } = await readSession(c);
    if (session.status !== 'active') return fail(409, 'UPLOAD_NOT_ACTIVE');
    if (session.expiresAt < Date.now()) return fail(410, 'UPLOAD_EXPIRED');
    const part = Number(c.req.param('part'));
    if (!Number.isSafeInteger(part) || part < 1 || part > session.partCount)
      return fail(400, 'INVALID_PART');
    const expected = Math.min(session.partSize, session.size - (part - 1) * session.partSize);
    if (Number(c.req.header('content-length')) !== expected || !c.req.raw.body)
      return fail(422, 'PART_SIZE_MISMATCH');
    if (c.req.header('content-encoding')) return fail(400, 'ENCODED_PART_FORBIDDEN');
    const hash = c.req.query('sha256') ?? '';
    if (!/^[a-f0-9]{64}$/.test(hash)) return fail(400, 'PART_CHECKSUM_REQUIRED');
    const bytes = await readPart(c.req.raw.body, expected);
    const actual = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('');
    if (actual !== hash) return fail(422, 'PART_CHECKSUM_MISMATCH');
    const uploaded = await bucket.resumeMultipartUpload!(session.key, session.uploadId).uploadPart(
      part,
      bytes,
    );
    // Abort may have won while the request was in flight. Never report it as active.
    if ((await readSession(c)).session.status !== 'active') return fail(409, 'UPLOAD_NOT_ACTIVE');
    await bucket.put(partKey(key, part), JSON.stringify(uploaded), jsonOptions);
    return c.json({ partNumber: part, bytes: expected });
  })
  .delete('/:upload', async (c) => {
    const record = await readSession(c);
    if (record.session.status === 'completed' || record.session.status === 'finalizing')
      return fail(409, 'UPLOAD_FINALIZING');
    if (record.session.status !== 'cancelled') await transition(record, 'cancelled');
    await record.bucket.resumeMultipartUpload!(record.session.key, record.session.uploadId).abort();
    return c.json({ status: 'cancelled' });
  })
  .post('/:upload/complete', async (c) => {
    const record = await readSession(c);
    const { bucket, key } = record;
    const repo = getRepository(c.env);
    if (record.session.status === 'cancelled') return fail(409, 'UPLOAD_CANCELLED');
    if (record.session.status === 'active' && record.session.expiresAt < Date.now())
      return fail(410, 'UPLOAD_EXPIRED');
    const parts = await receipts(bucket, key, record.session);
    if (parts.length !== record.session.partCount) return fail(409, 'UPLOAD_INCOMPLETE');
    if (record.session.status === 'active') await transition(record, 'finalizing');
    const session = record.session;
    let object = await bucket.head(session.key);
    if (!object) {
      try {
        object = await bucket.resumeMultipartUpload!(session.key, session.uploadId).complete(parts);
      } catch (error) {
        object = await bucket.head(session.key);
        if (!object) throw error;
      }
    }
    if (object.size !== session.size || object.httpMetadata?.contentType !== session.contentType)
      return fail(422, 'AUDIO_VERIFICATION_FAILED');
    let episode = await repo.getEpisode(session.episodeId);
    if (episode?.audioKey !== session.key) {
      episode = await repo.setEpisodeAudioKey(session.episodeId, session.key, session.previousKey);
      if (!episode) return fail(409, 'EPISODE_AUDIO_CHANGED');
    }
    if (record.session.status !== 'completed') await transition(record, 'completed');
    return c.json(episode);
  });
