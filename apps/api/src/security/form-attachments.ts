import { z } from 'zod';
import type { FormSubmissionAttachmentRef } from '@mukhtalif/types';
import { getFormRateLimitSecret, getSupabaseCredentials, isDevAuthEnabled, type Env } from '../env';
import type { ObjectStorageBucket } from '../storage/object-storage';

export const MAX_CAREERS_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_TOKEN_LIFETIME_MS = 60 * 60 * 1000;
export class FormAttachmentError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 409 | 413 | 415 | 422 | 503 = 400,
  ) {
    super(message);
  }
}
const recordSchema = z
  .object({
    id: z.string().regex(/^att-[a-f0-9-]{36}$/),
    fileName: z.string().min(1).max(180),
    mimeType: z.literal('application/pdf'),
    byteSize: z.number().int().positive().max(MAX_CAREERS_ATTACHMENT_BYTES),
    kind: z.enum(['cv', 'portfolio']),
    owner: z.string().min(40).max(100),
    expiresAt: z.string().datetime(),
    state: z.enum(['uploaded', 'claimed', 'releasing']),
    claimId: z.string().uuid().optional(),
  })
  .strict();
type UploadRecord = z.infer<typeof recordSchema>;
const payloadSchema = recordSchema.pick({ id: true, owner: true, expiresAt: true, kind: true });

export function attachmentStorage(env: Env): { bucket: ObjectStorageBucket; prefix: string } {
  if (!env.MEDIA) throw new FormAttachmentError('Attachment uploads are unavailable', 503);
  const credentials = getSupabaseCredentials(env);
  const namespace = credentials
    ? new URL(credentials.url).hostname.split('.')[0]
    : isDevAuthEnabled(env)
      ? 'local-development'
      : null;
  if (!namespace || !/^[a-z0-9-]+$/.test(namespace))
    throw new FormAttachmentError('Attachment storage is unavailable', 503);
  return { bucket: env.MEDIA, prefix: `form-attachments/${namespace}` };
}

export function acceptedAttachmentKey(env: Env, id: string): string {
  if (!/^att-[a-f0-9-]{36}$/.test(id)) throw new FormAttachmentError('Attachment not found');
  return `${attachmentStorage(env).prefix}/accepted/${id}.pdf`;
}

function base64url(bytes: Uint8Array) {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
function fromBase64url(value: string) {
  const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/'));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
async function key(env: Env) {
  // A distinct protocol label prevents attachment tokens being used as rate
  // fingerprints, despite deriving from the same environment-specific secret.
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(getFormRateLimitSecret(env)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}
async function ownerHash(env: Env, email: string) {
  return base64url(
    new Uint8Array(
      await crypto.subtle.sign(
        'HMAC',
        await key(env),
        new TextEncoder().encode(`career-attachment-owner-v1\0${email.trim().toLowerCase()}`),
      ),
    ),
  );
}
async function sign(env: Env, payload: z.infer<typeof payloadSchema>) {
  const encoded = base64url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign(
    'HMAC',
    await key(env),
    new TextEncoder().encode(`career-attachment-token-v1\0${encoded}`),
  );
  return `${encoded}.${base64url(new Uint8Array(signature))}`;
}
async function verify(env: Env, token: string, email: string) {
  try {
    const parts = token.split('.');
    if (parts.length !== 2 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part)))
      throw new Error();
    const signature = fromBase64url(parts[1]);
    const valid = await crypto.subtle.verify(
      'HMAC',
      await key(env),
      signature,
      new TextEncoder().encode(`career-attachment-token-v1\0${parts[0]}`),
    );
    if (!valid) throw new Error();
    const payload = payloadSchema.parse(
      JSON.parse(new TextDecoder().decode(fromBase64url(parts[0]))),
    );
    if (
      Date.parse(payload.expiresAt) <= Date.now() ||
      payload.owner !== (await ownerHash(env, email))
    )
      throw new Error();
    return payload;
  } catch {
    throw new FormAttachmentError(
      'The attachment expired or does not belong to this application',
      422,
    );
  }
}

export async function readBoundedBody(stream: ReadableStream<Uint8Array> | null, limit: number) {
  if (!stream) throw new FormAttachmentError('A file is required');
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new FormAttachmentError('File exceeds the 10 MB limit', 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function uploadCareerAttachment(env: Env, form: FormData) {
  const email = z.string().trim().email().max(254).safeParse(form.get('email'));
  const kind = z.enum(['cv', 'portfolio']).safeParse(form.get('kind'));
  const fileValue: unknown = form.get('file');
  if (
    !email.success ||
    !kind.success ||
    form.get('privacyAccepted') !== 'true' ||
    !(fileValue instanceof Blob) ||
    typeof (fileValue as { name?: unknown }).name !== 'string'
  ) {
    throw new FormAttachmentError('Invalid attachment upload');
  }
  const file = fileValue as Blob & { name: string };
  const keys = [...form.keys()];
  if (
    keys.length !== 4 ||
    new Set(keys).size !== 4 ||
    keys.some((name) => !['email', 'kind', 'file', 'privacyAccepted'].includes(name))
  ) {
    throw new FormAttachmentError('Invalid upload fields');
  }
  if (!file.size || file.size > MAX_CAREERS_ATTACHMENT_BYTES)
    throw new FormAttachmentError('File exceeds the 10 MB limit', 413);
  if (file.type !== 'application/pdf' || !/\.pdf$/i.test(file.name))
    throw new FormAttachmentError('Only PDF files are accepted', 415);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = new TextDecoder('latin1').decode(bytes);
  if (
    !/^%PDF-[12]\.\d/.test(text) ||
    !text.slice(-1024).includes('%%EOF') ||
    /\/(JavaScript|JS|Launch|EmbeddedFile|RichMedia|OpenAction|AA)\b/i.test(text)
  ) {
    throw new FormAttachmentError('The file is not a supported PDF', 415);
  }
  const fileName = [...file.name]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && (code < 127 || code > 159) && character !== '/' && character !== '\\';
    })
    .join('')
    .trim()
    .slice(0, 180);
  if (!fileName) throw new FormAttachmentError('Invalid filename');
  const { bucket, prefix } = attachmentStorage(env);
  const record: UploadRecord = {
    id: `att-${crypto.randomUUID()}`,
    fileName,
    mimeType: 'application/pdf',
    byteSize: file.size,
    kind: kind.data,
    owner: await ownerHash(env, email.data),
    expiresAt: new Date(Date.now() + ATTACHMENT_TOKEN_LIFETIME_MS).toISOString(),
    state: 'uploaded',
  };
  const objectKey = `${prefix}/pending/${record.id}.pdf`;
  try {
    const saved = await bucket.put(objectKey, bytes, {
      httpMetadata: { contentType: 'application/pdf', cacheControl: 'private, no-store' },
    });
    if (!saved) throw new Error('Upload failed');
    const metadata = await bucket.put(
      `${prefix}/pending/${record.id}.json`,
      JSON.stringify(record),
      { httpMetadata: { contentType: 'application/json', cacheControl: 'private, no-store' } },
    );
    if (!metadata) throw new Error('Upload record failed');
  } catch {
    await bucket.delete(objectKey).catch(() => undefined);
    throw new FormAttachmentError('The attachment could not be stored', 503);
  }
  const attachment: FormSubmissionAttachmentRef = {
    id: record.id,
    fileName,
    mimeType: record.mimeType,
    byteSize: record.byteSize,
  };
  const { id, owner, expiresAt, kind: attachmentKind } = record;
  return {
    attachment,
    token: await sign(env, { id, owner, expiresAt, kind: attachmentKind }),
    expiresAt,
  };
}

/** Claims each token once before saving the form; pending objects support safe retries. */
export async function claimCareerAttachments(
  env: Env,
  tokens: string[],
  email: string,
  claimId: string,
) {
  const { bucket, prefix } = attachmentStorage(env);
  const claimed: { record: UploadRecord; etag: string }[] = [];
  const release = async () => {
    for (const { record, etag } of claimed) {
      const releasing = await bucket.put(
        `${prefix}/pending/${record.id}.json`,
        JSON.stringify({ ...record, state: 'releasing', claimId }),
        { onlyIf: { etagMatches: etag }, httpMetadata: { contentType: 'application/json' } },
      );
      if (!releasing) continue;
      // Delete the failed accepted copy while holding the exclusive claim.
      // Unlocking first could delete a later successful retry's accepted copy.
      await bucket.delete(acceptedAttachmentKey(env, record.id));
      const original = { ...record, state: 'uploaded' as const };
      delete original.claimId;
      await bucket.put(`${prefix}/pending/${record.id}.json`, JSON.stringify(original), {
        onlyIf: { etagMatches: releasing.httpEtag },
        httpMetadata: { contentType: 'application/json' },
      });
    }
  };
  try {
    const kinds = new Set<string>();
    for (const token of tokens) {
      const payload = await verify(env, token, email);
      if (kinds.has(payload.kind))
        throw new FormAttachmentError('Only one CV and one portfolio are allowed', 422);
      kinds.add(payload.kind);
      const metadata = await bucket.get(`${prefix}/pending/${payload.id}.json`);
      if (!metadata)
        throw new FormAttachmentError(
          'The attachment has already been submitted or is unavailable',
          422,
        );
      const record = recordSchema.parse(
        JSON.parse(new TextDecoder().decode(await readBoundedBody(metadata.body, 8192))),
      );
      if (
        record.id !== payload.id ||
        record.owner !== payload.owner ||
        record.kind !== payload.kind ||
        record.expiresAt !== payload.expiresAt ||
        record.state !== 'uploaded'
      ) {
        throw new FormAttachmentError(
          'The attachment has already been submitted or is unavailable',
          422,
        );
      }
      const file = await bucket.get(`${prefix}/pending/${record.id}.pdf`);
      if (!file || file.size !== record.byteSize)
        throw new FormAttachmentError('The attachment is unavailable', 422);
      const locked = await bucket.put(
        `${prefix}/pending/${record.id}.json`,
        JSON.stringify({ ...record, state: 'claimed', claimId }),
        {
          onlyIf: { etagMatches: metadata.httpEtag },
          httpMetadata: { contentType: 'application/json' },
        },
      );
      if (!locked) throw new FormAttachmentError('The attachment is already being submitted', 409);
      claimed.push({ record, etag: locked.httpEtag });
      const copied = await bucket.put(acceptedAttachmentKey(env, record.id), file.body, {
        httpMetadata: { contentType: 'application/pdf', cacheControl: 'private, no-store' },
      });
      if (!copied || copied.size !== record.byteSize)
        throw new FormAttachmentError('The attachment could not be finalized', 503);
    }
  } catch (error) {
    await release().catch(() => undefined);
    if (error instanceof FormAttachmentError) throw error;
    throw new FormAttachmentError('The attachment could not be verified', 503);
  }
  return {
    refs: claimed.map(({ record }) => ({
      id: record.id,
      fileName: record.fileName,
      mimeType: record.mimeType,
      byteSize: record.byteSize,
    })),
    release,
    finish: async () => {
      await Promise.all(
        claimed.flatMap(({ record }) => [
          bucket.delete(`${prefix}/pending/${record.id}.pdf`),
          bucket.delete(`${prefix}/pending/${record.id}.json`),
        ]),
      );
    },
  };
}
