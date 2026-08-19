import { Hono, type Context } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { MediaAsset, MediaUploadReservation } from '@mukhtalif/types';
import { createMediaUploadSchema, mediaAssetIdSchema } from '@mukhtalif/validation';
import { requirePermission, type AppEnv } from '../auth';
import { getMediaPublicOrigin } from '../env';
import {
  safeOriginalFileName,
  validateAndSanitizeImage,
} from '../publishing/media';
import { getRepository, type StoredMediaAsset } from '../repo';

const UPLOAD_LEASE_MS = 15 * 60_000;

function mediaPublicUrl(origin: string | null, id: string): string | undefined {
  return origin
    ? new URL(`/media/${encodeURIComponent(id)}`, `${origin.replace(/\/$/, '')}/`).toString()
    : undefined;
}

function toMediaAsset(asset: StoredMediaAsset, origin: string | null): MediaAsset {
  return {
    id: asset.id,
    kind: 'image',
    mimeType: asset.mimeType,
    fileName: asset.fileName,
    byteSize: asset.byteSize,
    width: asset.width,
    height: asset.height,
    defaultAlt: asset.defaultAlt,
    defaultCaption: asset.defaultCaption,
    status: asset.status === 'ready' ? 'ready' : 'pending',
    publicUrl: asset.status === 'ready' ? mediaPublicUrl(origin, asset.id) : undefined,
    createdAt: asset.createdAt,
  };
}

function errorBody(code: string, error: string) {
  return { code, error };
}

function uploadFailure(error: unknown): { code: string; message: string } | null {
  if (!(error instanceof Error) || !error.message.startsWith('MEDIA_')) return null;
  return { code: error.message, message: 'Image validation failed' };
}

export const studioMediaRoute = new Hono<AppEnv>()
  .use('*', requirePermission('articles.view'))
  .get('/', async (c) => {
    const origin = getMediaPublicOrigin(c.env, new URL(c.req.url).origin);
    const assets = await getRepository(c.env).listReadyMediaAssets();
    return c.json(assets.map((asset) => toMediaAsset(asset, origin)));
  })
  .post(
    '/uploads',
    requirePermission('articles.manage'),
    zValidator('json', createMediaUploadSchema),
    async (c) => {
      if (!c.env.MEDIA) {
        return c.json(
          errorBody('MEDIA_STORAGE_NOT_CONFIGURED', 'Media storage is not configured'),
          503,
        );
      }
      getMediaPublicOrigin(c.env, new URL(c.req.url).origin);
      const input = c.req.valid('json');
      const id = `med-${crypto.randomUUID().replaceAll('-', '')}`;
      const extension = input.mimeType === 'image/jpeg' ? 'jpg' : 'png';
      const asset = await getRepository(c.env).createMediaUpload({
        id,
        mimeType: input.mimeType,
        fileName: safeOriginalFileName(input.fileName),
        storageKey: `articles/images/${id}.${extension}`,
        expectedByteSize: input.byteSize,
        width: input.width,
        height: input.height,
        defaultAlt: input.defaultAlt,
        defaultCaption: input.defaultCaption,
        createdAt: new Date().toISOString(),
      });
      const result: MediaUploadReservation = {
        asset: toMediaAsset(asset, null),
        uploadUrl: `/studio/media/uploads/${encodeURIComponent(asset.id)}/content`,
      };
      return c.json(result, 201);
    },
  )
  .put(
    '/uploads/:id/content',
    requirePermission('articles.manage'),
    async (c) => {
      if (!c.env.MEDIA) {
        return c.json(
          errorBody('MEDIA_STORAGE_NOT_CONFIGURED', 'Media storage is not configured'),
          503,
        );
      }
      const bucket = c.env.MEDIA;
      const id = c.req.param('id');
      if (!mediaAssetIdSchema.safeParse(id).success) {
        return c.json(errorBody('MEDIA_UPLOAD_NOT_FOUND', 'Media upload not found'), 404);
      }
      const repo = getRepository(c.env);
      const current = await repo.getMediaAsset(id);
      if (!current) {
        return c.json(errorBody('MEDIA_UPLOAD_NOT_FOUND', 'Media upload not found'), 404);
      }
      if (current.status === 'ready') {
        return c.json(errorBody('MEDIA_ALREADY_READY', 'Media upload is already complete'), 409);
      }
      const contentType = c.req.header('content-type')?.trim().toLowerCase();
      if (contentType !== current.mimeType) {
        return c.json(errorBody('MEDIA_MIME_MISMATCH', 'Content-Type does not match reservation'), 415);
      }
      const contentEncoding = c.req.header('content-encoding');
      if (contentEncoding && contentEncoding.toLowerCase() !== 'identity') {
        return c.json(errorBody('MEDIA_CONTENT_ENCODING_FORBIDDEN', 'Encoded uploads are not accepted'), 415);
      }
      const declaredLength = c.req.header('content-length');
      if (!declaredLength) {
        return c.json(
          errorBody('MEDIA_CONTENT_LENGTH_REQUIRED', 'Content-Length is required'),
          411,
        );
      }
      if (Number(declaredLength) !== current.expectedByteSize) {
        return c.json(errorBody('MEDIA_SIZE_MISMATCH', 'Upload size does not match reservation'), 422);
      }

      const input = await c.req.arrayBuffer();
      if (input.byteLength !== current.expectedByteSize) {
        return c.json(errorBody('MEDIA_SIZE_MISMATCH', 'Upload size does not match reservation'), 422);
      }
      let sanitized: ArrayBuffer;
      try {
        sanitized = await validateAndSanitizeImage(input, current.mimeType, {
          width: current.width,
          height: current.height,
        });
      } catch (error) {
        const failure = uploadFailure(error);
        if (failure) return c.json(errorBody(failure.code, failure.message), 422);
        throw error;
      }

      const origin = getMediaPublicOrigin(c.env, new URL(c.req.url).origin);
      const staleBefore = new Date(Date.now() - UPLOAD_LEASE_MS).toISOString();
      const claim = await repo.claimMediaUpload(current.id, staleBefore);
      if (!claim) {
        return c.json(errorBody('MEDIA_UPLOAD_IN_PROGRESS', 'Media upload is already in progress'), 409);
      }
      const { asset: claimed, uploadToken } = claim;
      const attemptStorageKey = `${claimed.storageKey}.attempt-${uploadToken}`;
      let ready: StoredMediaAsset;
      try {
        await bucket.put(attemptStorageKey, sanitized, {
          httpMetadata: {
            contentType: claimed.mimeType,
            cacheControl: 'public, max-age=31536000, immutable',
          },
        });
        const completed = await repo.completeMediaUpload(
          claimed.id,
          sanitized.byteLength,
          uploadToken,
          attemptStorageKey,
        );
        if (!completed) throw new Error('MEDIA_UPLOAD_STATE_LOST');
        ready = completed;
      } catch (error) {
        try {
          await bucket.delete(attemptStorageKey);
        } finally {
          await repo.releaseMediaUpload(claimed.id, uploadToken);
        }
        const failure = uploadFailure(error);
        if (failure) return c.json(errorBody(failure.code, failure.message), 409);
        throw error;
      }
      return c.json(toMediaAsset(ready, origin));
    },
  );

function mediaHeaders(
  asset: StoredMediaAsset,
  object: { httpEtag: string },
  contentLength: number,
): Headers {
  return new Headers({
    'content-type': asset.mimeType,
    'content-length': String(contentLength),
    'content-disposition': 'inline',
    'cache-control': 'public, max-age=31536000, immutable',
    etag: object.httpEtag,
    'x-content-type-options': 'nosniff',
    'cross-origin-resource-policy': 'cross-origin',
    'accept-ranges': 'bytes',
  });
}

async function publicMediaResponse(c: Context<AppEnv>) {
  if (!c.env.MEDIA) return c.json({ error: 'Media not found' }, 404);
  getMediaPublicOrigin(c.env, new URL(c.req.url).origin);
  const id = c.req.param('id') ?? '';
  if (!mediaAssetIdSchema.safeParse(id).success) return c.json({ error: 'Media not found' }, 404);
  const asset = await getRepository(c.env).getMediaAsset(id);
  if (!asset || asset.status !== 'ready') return c.json({ error: 'Media not found' }, 404);

  if (c.req.method === 'HEAD') {
    const object = await c.env.MEDIA.head(asset.storageKey);
    if (!object || object.size !== asset.byteSize) {
      return c.json({ error: 'Media not found' }, 404);
    }
    return new Response(null, { headers: mediaHeaders(asset, object, object.size) });
  }

  const range = c.req.header('range');
  let requestRange: { offset: number; length: number } | undefined;
  let contentRange: string | undefined;
  if (range) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(range);
    const start = match ? Number(match[1]) : Number.NaN;
    const requestedEnd = match?.[2] ? Number(match[2]) : asset.byteSize - 1;
    const end = Math.min(requestedEnd, asset.byteSize - 1);
    if (!match || !Number.isSafeInteger(start) || start < 0 || start > end) {
      return new Response(null, {
        status: 416,
        headers: { 'content-range': `bytes */${asset.byteSize}` },
      });
    }
    requestRange = { offset: start, length: end - start + 1 };
    contentRange = `bytes ${start}-${end}/${asset.byteSize}`;
  }
  const object = await c.env.MEDIA.get(asset.storageKey, requestRange ? { range: requestRange } : undefined);
  if (!object || object.size !== asset.byteSize) {
    return c.json({ error: 'Media not found' }, 404);
  }
  if (c.req.header('if-none-match') === object.httpEtag && !requestRange) {
    return new Response(null, { status: 304, headers: { etag: object.httpEtag } });
  }
  const length = requestRange?.length ?? asset.byteSize;
  const headers = mediaHeaders(asset, object, length);
  if (contentRange) headers.set('content-range', contentRange);
  return new Response(object.body, { status: requestRange ? 206 : 200, headers });
}

export const publicMediaRoute = new Hono<AppEnv>();
publicMediaRoute.get('/:id', publicMediaResponse);
publicMediaRoute.on('HEAD', '/:id', publicMediaResponse);
