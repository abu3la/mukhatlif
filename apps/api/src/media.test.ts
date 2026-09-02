import { describe, expect, it } from 'vitest';
import type { Article, MediaAsset, MediaUploadReservation } from '@mukhtalif/types';
import type { Env } from './env';
import { richTextDocumentSchema } from '@mukhtalif/validation';
import app from './index';
import { validateAndSanitizeImage } from './publishing/media';
import { createMemoryRepository } from './repo/memory';
import { renderRichText } from './publishing/rich-text';

const ONE_PIXEL_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function decodeBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let value = n;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[n] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const output = new Uint8Array(12 + data.length);
  const view = new DataView(output.buffer);
  const typeBytes = new TextEncoder().encode(type);
  view.setUint32(0, data.length);
  output.set(typeBytes, 4);
  output.set(data, 8);
  view.setUint32(8 + data.length, crc32(output.slice(4, 8 + data.length)));
  return output;
}

function insertBeforeIdat(png: Uint8Array, chunk: Uint8Array): Uint8Array {
  let offset = 8;
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  while (offset < png.length) {
    const length = view.getUint32(offset);
    const type = new TextDecoder().decode(png.slice(offset + 4, offset + 8));
    if (type === 'IDAT') {
      const output = new Uint8Array(png.length + chunk.length);
      output.set(png.slice(0, offset));
      output.set(chunk, offset);
      output.set(png.slice(offset), offset + chunk.length);
      return output;
    }
    offset += length + 12;
  }
  throw new Error('IDAT missing');
}

class FakeMediaBucket {
  readonly objects = new Map<
    string,
    { bytes: Uint8Array; contentType: string; cacheControl: string }
  >();

  async put(key: string, value: ArrayBuffer, options?: R2PutOptions): Promise<R2Object> {
    const metadata = options?.httpMetadata;
    const object = {
      bytes: new Uint8Array(value.slice(0)),
      contentType:
        (metadata instanceof Headers ? metadata.get('content-type') : metadata?.contentType) ??
        'application/octet-stream',
      cacheControl:
        (metadata instanceof Headers ? metadata.get('cache-control') : metadata?.cacheControl) ??
        '',
    };
    this.objects.set(key, object);
    return this.metadata(key, object) as R2Object;
  }

  async get(key: string, options?: R2GetOptions): Promise<R2ObjectBody | null> {
    const object = this.objects.get(key);
    if (!object) return null;
    const range =
      options?.range && 'offset' in options.range && options.range.offset !== undefined
        ? options.range
        : undefined;
    const offset = range?.offset;
    const bytes =
      offset !== undefined
        ? object.bytes.slice(offset, offset + (range?.length ?? object.bytes.length))
        : object.bytes;
    return {
      ...this.metadata(key, object),
      body: new Response(bytes).body!,
      bodyUsed: false,
      arrayBuffer: () => Promise.resolve(arrayBuffer(bytes)),
      bytes: () => Promise.resolve(bytes.slice()),
      text: () => Promise.resolve(new TextDecoder().decode(bytes)),
      json: () => Promise.reject(new Error('not json')),
      blob: () => Promise.resolve(new Blob([bytes], { type: object.contentType })),
      writeHttpMetadata: () => undefined,
    } as unknown as R2ObjectBody;
  }

  async head(key: string): Promise<R2Object | null> {
    const object = this.objects.get(key);
    return object ? (this.metadata(key, object) as R2Object) : null;
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  private metadata(
    key: string,
    object: { bytes: Uint8Array; contentType: string; cacheControl: string },
  ) {
    return {
      key,
      version: '1',
      size: object.bytes.length,
      etag: 'fixture-etag',
      httpEtag: '"fixture-etag"',
      checksums: {},
      uploaded: new Date(),
      httpMetadata: {
        contentType: object.contentType,
        cacheControl: object.cacheControl,
      },
      customMetadata: {},
      range: undefined,
      storageClass: 'Standard',
      ssecKeyMd5: undefined,
    };
  }
}

function mediaEnv(bucket: FakeMediaBucket): Env {
  return {
    APP_ENV: 'development',
    ALLOW_DEV_AUTH: 'true',
    CORS_ALLOWED_ORIGINS: 'http://127.0.0.1:3001',
    MEDIA_PUBLIC_ORIGIN: 'http://127.0.0.1:8787',
    MEDIA: bucket as unknown as R2Bucket,
  };
}

function apiRequest(path: string, init: RequestInit, env: Env) {
  const headers = new Headers(init.headers);
  headers.set('x-dev-user', 'usr-admin-1');
  return app.request(path, { ...init, headers }, env);
}

async function uploadOnePixel(bucket: FakeMediaBucket): Promise<MediaAsset> {
  const bytes = decodeBase64(ONE_PIXEL_PNG);
  const env = mediaEnv(bucket);
  const reservationResponse = await apiRequest(
    '/studio/media/uploads',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        fileName: 'pixel.png',
        mimeType: 'image/png',
        byteSize: bytes.length,
        width: 1,
        height: 1,
        defaultAlt: 'صورة افتراضية',
      }),
    },
    env,
  );
  expect(reservationResponse.status).toBe(201);
  const reservation = (await reservationResponse.json()) as MediaUploadReservation;
  expect(reservation.asset).toMatchObject({ kind: 'image', status: 'pending' });
  expect(reservation.asset).not.toHaveProperty('storageKey');

  const uploadResponse = await apiRequest(
    reservation.uploadUrl,
    {
      method: 'PUT',
      headers: {
        'content-type': 'image/png',
        'content-length': String(bytes.length),
      },
      body: bytes,
    },
    env,
  );
  expect(uploadResponse.status).toBe(200);
  return (await uploadResponse.json()) as MediaAsset;
}

describe('image sanitization', () => {
  it('strips PNG textual metadata while retaining a valid raster', async () => {
    const png = decodeBase64(ONE_PIXEL_PNG);
    const textChunk = pngChunk('tEXt', new TextEncoder().encode('Author\0Private Name'));
    const withMetadata = insertBeforeIdat(png, textChunk);
    const sanitized = new Uint8Array(
      await validateAndSanitizeImage(arrayBuffer(withMetadata), 'image/png', {
        width: 1,
        height: 1,
      }),
    );
    expect(new TextDecoder().decode(sanitized)).not.toContain('Author');
    expect(sanitized.length).toBeLessThan(withMetadata.length);
  });

  it('rejects dimension lies and trailing polyglot bytes', async () => {
    const png = decodeBase64(ONE_PIXEL_PNG);
    await expect(
      validateAndSanitizeImage(arrayBuffer(png), 'image/png', { width: 2, height: 1 }),
    ).rejects.toThrow('MEDIA_DIMENSIONS_MISMATCH');
    const trailing = new Uint8Array(png.length + 4);
    trailing.set(png);
    trailing.set([0x50, 0x4b, 0x03, 0x04], png.length);
    await expect(
      validateAndSanitizeImage(arrayBuffer(trailing), 'image/png', { width: 1, height: 1 }),
    ).rejects.toThrow('MEDIA_TRAILING_DATA');
  });

  it('strips JPEG application metadata and rejects bytes after the final image marker', async () => {
    const jpeg = new Uint8Array([
      0xff,
      0xd8,
      0xff,
      0xe1,
      0x00,
      0x0a,
      0x45,
      0x78,
      0x69,
      0x66,
      0x00,
      0x00,
      0x41,
      0x42,
      0xff,
      0xdb,
      0x00,
      0x43,
      0x00,
      ...Array<number>(64).fill(1),
      0xff,
      0xc4,
      0x00,
      0x26,
      0x00,
      0x01,
      ...Array<number>(15).fill(0),
      0x00,
      0x10,
      0x01,
      ...Array<number>(15).fill(0),
      0x00,
      0xff,
      0xc0,
      0x00,
      0x0b,
      0x08,
      0x00,
      0x01,
      0x00,
      0x01,
      0x01,
      0x01,
      0x11,
      0x00,
      0xff,
      0xda,
      0x00,
      0x08,
      0x01,
      0x01,
      0x00,
      0x00,
      0x3f,
      0x00,
      0x00,
      0xff,
      0xd9,
    ]);
    const sanitized = new Uint8Array(
      await validateAndSanitizeImage(arrayBuffer(jpeg), 'image/jpeg', { width: 1, height: 1 }),
    );
    expect(new TextDecoder().decode(sanitized)).not.toContain('Exif');
    expect(sanitized.length).toBeLessThan(jpeg.length);

    const trailing = new Uint8Array(jpeg.length + 2);
    trailing.set(jpeg);
    trailing.set([0x50, 0x4b], jpeg.length);
    await expect(
      validateAndSanitizeImage(arrayBuffer(trailing), 'image/jpeg', { width: 1, height: 1 }),
    ).rejects.toThrow('MEDIA_TRAILING_DATA');
  });
});

describe('media API and article projection', () => {
  it('fences reclaimed upload attempts with private tokens and attempt-specific keys', async () => {
    const repo = createMemoryRepository();
    const id = `med-${crypto.randomUUID().replaceAll('-', '')}`;
    await repo.createMediaUpload({
      id,
      mimeType: 'image/png',
      fileName: 'fenced.png',
      storageKey: `articles/images/${id}.png`,
      expectedByteSize: 67,
      width: 1,
      height: 1,
      defaultAlt: 'صورة',
      createdAt: new Date().toISOString(),
    });
    const first = await repo.claimMediaUpload(id, new Date(0).toISOString());
    expect(first).not.toBeNull();
    const reclaimed = await repo.claimMediaUpload(id, new Date(Date.now() + 60_000).toISOString());
    expect(reclaimed).not.toBeNull();
    expect(reclaimed?.uploadToken).not.toBe(first?.uploadToken);

    const staleCompletion = await repo.completeMediaUpload(
      id,
      60,
      first!.uploadToken,
      `${first!.asset.storageKey}.attempt-${first!.uploadToken}`,
    );
    expect(staleCompletion).toBeNull();
    await repo.releaseMediaUpload(id, first!.uploadToken);
    expect((await repo.getMediaAsset(id))?.uploadToken).toBe(reclaimed?.uploadToken);

    const finalKey = `${reclaimed!.asset.storageKey}.attempt-${reclaimed!.uploadToken}`;
    const ready = await repo.completeMediaUpload(id, 60, reclaimed!.uploadToken, finalKey);
    expect(ready).toMatchObject({ status: 'ready', storageKey: finalKey });
    expect(ready?.uploadToken).toBeUndefined();
  });

  it('keeps the library Studio-only and rejects video-file reservations', async () => {
    const bucket = new FakeMediaBucket();
    const env = mediaEnv(bucket);
    const listener = await app.request(
      '/studio/media',
      { headers: { 'x-dev-user': 'usr-listener-1' } },
      env,
    );
    expect(listener.status).toBe(403);

    const video = await apiRequest(
      '/studio/media/uploads',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fileName: 'clip.mp4',
          mimeType: 'video/mp4',
          byteSize: 100,
          width: 1280,
          height: 720,
          defaultAlt: 'فيديو',
        }),
      },
      env,
    );
    expect(video.status).toBe(400);
  });

  it('reserves, validates, stores and publicly streams a ready image without key leakage', async () => {
    const bucket = new FakeMediaBucket();
    const asset = await uploadOnePixel(bucket);
    expect(asset).toMatchObject({
      status: 'ready',
      width: 1,
      height: 1,
      publicUrl: expect.stringMatching(/^http:\/\/127\.0\.0\.1:8787\/media\/med-/),
    });

    const list = await apiRequest('/studio/media', {}, mediaEnv(bucket));
    const listed = (await list.json()) as MediaAsset[];
    expect(list.status).toBe(200);
    expect(listed.some((candidate) => candidate.id === asset.id)).toBe(true);
    expect(JSON.stringify(listed)).not.toContain('storageKey');

    const publicResponse = await app.request(`/media/${asset.id}`, {}, mediaEnv(bucket));
    expect(publicResponse.status).toBe(200);
    expect(publicResponse.headers.get('content-type')).toBe('image/png');
    expect(publicResponse.headers.get('x-content-type-options')).toBe('nosniff');
    expect(publicResponse.headers.get('cache-control')).toContain('immutable');
    expect(new Uint8Array(await publicResponse.arrayBuffer())).toEqual(decodeBase64(ONE_PIXEL_PNG));
  });

  it('requires an exact Content-Length before reading upload content', async () => {
    const bucket = new FakeMediaBucket();
    const bytes = decodeBase64(ONE_PIXEL_PNG);
    const env = mediaEnv(bucket);
    const reservationResponse = await apiRequest(
      '/studio/media/uploads',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fileName: 'pixel.png',
          mimeType: 'image/png',
          byteSize: bytes.length,
          width: 1,
          height: 1,
          defaultAlt: 'بكسل',
        }),
      },
      env,
    );
    const reservation = (await reservationResponse.json()) as MediaUploadReservation;
    const response = await apiRequest(
      reservation.uploadUrl,
      {
        method: 'PUT',
        headers: { 'content-type': 'image/png', 'content-length': String(bytes.length + 1) },
        body: bytes,
      },
      env,
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: 'MEDIA_SIZE_MISMATCH' });
    expect(bucket.objects.size).toBe(0);
  });

  it('keeps placement-specific alt text and renders safe video fallbacks', async () => {
    const bucket = new FakeMediaBucket();
    const poster = await uploadOnePixel(bucket);
    const env = mediaEnv(bucket);
    const create = await apiRequest(
      '/studio/articles',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slug: `media-${crypto.randomUUID().slice(0, 8)}`,
          titleAr: 'مقال بصري',
          author: { type: 'custom', displayName: 'فريق مختلف' },
          content: {
            type: 'doc',
            content: [
              {
                type: 'imageBlock',
                attrs: {
                  mediaId: poster.id,
                  alt: 'وصف خاص بسياق هذا المقال',
                  caption: 'تعليق داخل المقال',
                  presentation: 'wide',
                  alignment: 'end',
                  radius: 'soft',
                },
              },
              {
                type: 'imageBlock',
                attrs: {
                  mediaId: poster.id,
                  alt: 'صورة بعقد قديم',
                  presentation: 'content',
                },
              },
              {
                type: 'videoEmbed',
                attrs: {
                  provider: 'youtube',
                  videoId: 'dQw4w9WgXcQ',
                  title: 'عنوان الفيديو',
                  posterMediaId: poster.id,
                  caption: 'شرح الفيديو',
                },
              },
            ],
          },
          newsletter: { enabled: true, subject: 'نشرة بصرية' },
        }),
      },
      env,
    );
    expect(create.status).toBe(201);
    const article = (await create.json()) as Article;
    expect(article.content.content?.[0]?.attrs?.alt).toBe('وصف خاص بسياق هذا المقال');
    expect(article.content.content?.[0]?.attrs?.alt).not.toBe(poster.defaultAlt);
    expect(article.content.content?.[0]?.attrs).toMatchObject({
      presentation: 'wide',
      alignment: 'end',
      radius: 'soft',
    });
    expect(article.content.content?.[1]?.attrs).toMatchObject({
      presentation: 'content',
      alignment: 'center',
      radius: 'none',
    });
    expect(article.contentHtml).toContain('width:100%;max-width:none');
    expect(article.contentHtml).toContain('margin-inline-start:auto;margin-inline-end:0');
    expect(article.contentHtml).toContain('border-radius:12px');
    expect(article.contentHtml).toContain('width:100%;max-width:640px');
    expect(article.contentHtml).toContain('margin-inline-start:auto;margin-inline-end:auto');
    expect(article.contentHtml).toContain('border-radius:0');
    expect(article.contentHtml).toContain('data-media-kind="video"');
    expect(article.contentHtml).toContain('border-radius:8px');

    const preview = await apiRequest(
      `/studio/articles/${article.id}/newsletter/preview`,
      { method: 'POST' },
      env,
    );
    const html = ((await preview.json()) as { html: string }).html;
    expect(preview.status).toBe(200);
    expect(html).toContain(`http://127.0.0.1:8787/media/${poster.id}`);
    expect(html).toContain('align="left"');
    expect(html).toContain('border-radius:12px');
    expect(html).toContain('margin:0 auto 0 0');
    expect(html).toContain('align="center"');
    expect(html).toContain('border-radius:0');
    expect(html).toContain('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(html).toContain('border-radius:8px');
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('<video');
  });

  it('persists ready image galleries and rejects a gallery with an unavailable asset', async () => {
    const bucket = new FakeMediaBucket();
    const first = await uploadOnePixel(bucket);
    const second = await uploadOnePixel(bucket);
    const env = mediaEnv(bucket);
    const create = await apiRequest(
      '/studio/articles',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slug: `gallery-${crypto.randomUUID().slice(0, 8)}`,
          titleAr: 'معرض صور',
          author: { type: 'custom', displayName: 'فريق مختلف' },
          content: {
            type: 'doc',
            content: [
              {
                type: 'imageGallery',
                attrs: {
                  items: [
                    { mediaId: first.id, alt: 'وصف الصورة الأولى في المقال' },
                    { mediaId: second.id, alt: 'وصف الصورة الثانية في المقال' },
                  ],
                  caption: 'تعليق المعرض المشترك',
                },
              },
            ],
          },
          newsletter: { enabled: true, subject: 'نشرة المعرض' },
        }),
      },
      env,
    );
    expect(create.status).toBe(201);
    const article = (await create.json()) as Article;
    expect(article.content.content?.[0]).toMatchObject({
      type: 'imageGallery',
      attrs: {
        items: [
          { mediaId: first.id, alt: 'وصف الصورة الأولى في المقال' },
          { mediaId: second.id, alt: 'وصف الصورة الثانية في المقال' },
        ],
        caption: 'تعليق المعرض المشترك',
      },
    });
    expect(article.content.content?.[0]).not.toHaveProperty('content');
    expect(article.contentHtml).toContain('data-media-kind="image-gallery"');
    expect(article.contentHtml).toContain('display:flex;flex-wrap:wrap');
    expect(article.contentHtml).not.toContain('object-fit');
    expect(article.bodyAr).toBe(
      'وصف الصورة الأولى في المقال\nوصف الصورة الثانية في المقال\nتعليق المعرض المشترك',
    );

    const preview = await apiRequest(
      `/studio/articles/${article.id}/newsletter/preview`,
      { method: 'POST' },
      env,
    );
    expect(preview.status).toBe(200);
    const previewHtml = ((await preview.json()) as { html: string }).html;
    expect(previewHtml).toContain('<table role="presentation"');
    expect(previewHtml).toContain(`http://127.0.0.1:8787/media/${first.id}`);
    expect(previewHtml).toContain(`http://127.0.0.1:8787/media/${second.id}`);
    expect(previewHtml.indexOf('تعليق المعرض المشترك')).toBeGreaterThan(
      previewHtml.indexOf('</table>'),
    );

    const unavailable = await apiRequest(
      '/studio/articles',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slug: `gallery-missing-${crypto.randomUUID().slice(0, 8)}`,
          titleAr: 'معرض غير جاهز',
          author: { type: 'custom', displayName: 'فريق مختلف' },
          content: {
            type: 'doc',
            content: [
              {
                type: 'imageGallery',
                attrs: {
                  items: [
                    { mediaId: first.id, alt: 'صورة جاهزة' },
                    {
                      mediaId: 'med-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
                      alt: 'صورة غير موجودة',
                    },
                  ],
                },
              },
            ],
          },
        }),
      },
      env,
    );
    expect(unavailable.status).toBe(422);
    expect(await unavailable.json()).toMatchObject({ code: 'MEDIA_ASSET_NOT_READY' });
  });
});

describe('media-rich-text allowlist', () => {
  const mediaId = 'med-0123456789abcdef0123456789abcdef';

  it('accepts only top-level source-free media nodes', () => {
    const valid = richTextDocumentSchema.safeParse({
      type: 'doc',
      content: [
        {
          type: 'imageBlock',
          attrs: {
            mediaId,
            alt: 'وصف سياقي',
            presentation: 'content',
          },
        },
        {
          type: 'videoEmbed',
          attrs: {
            provider: 'vimeo',
            videoId: '123456789',
            title: 'عنوان',
            posterMediaId: mediaId,
          },
        },
      ],
    });
    expect(valid.success).toBe(true);

    const rawSource = richTextDocumentSchema.safeParse({
      type: 'doc',
      content: [
        {
          type: 'videoEmbed',
          attrs: {
            provider: 'youtube',
            videoId: 'dQw4w9WgXcQ',
            title: 'عنوان',
            posterMediaId: mediaId,
            src: 'https://evil.example/embed',
          },
        },
      ],
    });
    expect(rawSource.success).toBe(false);

    const nested = richTextDocumentSchema.safeParse({
      type: 'doc',
      content: [
        {
          type: 'blockquote',
          content: [
            {
              type: 'imageBlock',
              attrs: { mediaId, alt: 'وصف', presentation: 'wide' },
            },
          ],
        },
      ],
    });
    expect(nested.success).toBe(false);

    for (const unsafeImage of [
      {
        mediaId,
        alt: 'وصف',
        presentation: 'content',
        alignment: 'stretch',
      },
      {
        mediaId,
        alt: 'وصف',
        presentation: 'content',
        radius: '16px',
      },
      {
        mediaId,
        alt: 'وصف',
        presentation: 'content',
        style: 'position:fixed',
      },
    ]) {
      expect(
        richTextDocumentSchema.safeParse({
          type: 'doc',
          content: [{ type: 'imageBlock', attrs: unsafeImage }],
        }).success,
      ).toBe(false);
    }

    expect(
      richTextDocumentSchema.safeParse({
        type: 'doc',
        content: [
          {
            type: 'videoEmbed',
            attrs: {
              provider: 'youtube',
              videoId: 'dQw4w9WgXcQ',
              title: 'عنوان',
              posterMediaId: mediaId,
              alignment: 'center',
            },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('keeps the email image cap out of wide web placements', () => {
    const html = renderRichText({
      type: 'doc',
      content: [
        {
          type: 'imageBlock',
          attrs: {
            mediaId,
            alt: 'وصف',
            presentation: 'wide',
          },
        },
      ],
    });
    expect(html).toContain('data-presentation="wide"');
    expect(html).toContain('data-alignment="center"');
    expect(html).toContain('data-radius="none"');
    expect(html).toContain('width:100%;max-width:none');
    expect(html).toContain('margin-inline-start:auto;margin-inline-end:auto');
    expect(html).toContain('border-radius:0');
    expect(html).not.toContain('max-width:600px');

    const styled = renderRichText({
      type: 'doc',
      content: [
        {
          type: 'imageBlock',
          attrs: {
            mediaId,
            alt: 'وصف',
            presentation: 'content',
            alignment: 'start',
            radius: 'round',
          },
        },
      ],
    });
    expect(styled).toContain('data-presentation="content"');
    expect(styled).toContain('data-alignment="start"');
    expect(styled).toContain('data-radius="round"');
    expect(styled).toContain('width:100%;max-width:640px');
    expect(styled).toContain('margin-inline-start:0;margin-inline-end:auto');
    expect(styled).toContain('border-radius:28px');
  });

  it('enforces document media-count and provider identifier limits', () => {
    const tooManyImages = richTextDocumentSchema.safeParse({
      type: 'doc',
      content: Array.from({ length: 31 }, () => ({
        type: 'imageBlock',
        attrs: { mediaId, alt: 'وصف', presentation: 'content' },
      })),
    });
    expect(tooManyImages.success).toBe(false);

    const duplicateGalleryAsset = richTextDocumentSchema.safeParse({
      type: 'doc',
      content: [
        {
          type: 'imageGallery',
          attrs: {
            items: [
              { mediaId, alt: 'الأولى' },
              { mediaId, alt: 'الثانية' },
            ],
          },
        },
      ],
    });
    expect(duplicateGalleryAsset.success).toBe(false);

    const invalidProviderId = richTextDocumentSchema.safeParse({
      type: 'doc',
      content: [
        {
          type: 'videoEmbed',
          attrs: {
            provider: 'youtube',
            videoId: 'not-a-youtube-id',
            title: 'عنوان',
            posterMediaId: mediaId,
          },
        },
      ],
    });
    expect(invalidProviderId.success).toBe(false);
  });
});
