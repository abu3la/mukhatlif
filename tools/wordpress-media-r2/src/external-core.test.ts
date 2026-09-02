import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  externalKey,
  extractExternalImages,
  inspectImage,
  isPublicIp,
  normalizedMediaPath,
} from './external-core.ts';

function attachment(legacyId: number, sourceUrl: string) {
  return { legacyId, media: { sourceUrl } };
}

describe('external WordPress inline media', () => {
  it('excludes class, exact URL, and normalized WXR mappings', () => {
    const manifest = {
      candidates: {
        attachment: [
          attachment(10, 'https://mukhtalif.net/wp-content/uploads/cover.jpg'),
          attachment(11, 'https://mukhtalif.net/wp-content/uploads/photo-scaled.png'),
        ],
        post: [
          {
            legacyId: 20,
            suggestedTargetSlug: 'fixture',
            contentHtml: [
              '<img class="wp-image-10" src="https://elsewhere.test/a.jpg">',
              '<img src="https://mukhtalif.net/wp-content/uploads/cover.jpg">',
              '<img src="https://mukhtalif.net/wp-content/uploads/photo-300x200.png">',
              '<img src="https://mcusercontent.com/list/images/unique.png">',
            ].join(''),
          },
        ],
      },
    };
    const result = extractExternalImages(manifest);
    expect(result).toMatchObject({
      inlineImageOccurrences: 4,
      wxrMappedOccurrences: 3,
      unresolvedOccurrences: 1,
      uniqueExternalUrls: 1,
      rejected: [],
    });
    expect(result.candidates[0].usages).toEqual([
      { legacyPostId: 20, articleId: 'art-wp-20', slug: 'fixture', order: 3 },
    ]);
  });

  it('creates the required deterministic external key', () => {
    const sourceUrl = 'https://mcusercontent.com/list/images/unique.png';
    const expectedHash = createHash('sha256').update(sourceUrl).digest('hex');
    expect(externalKey(sourceUrl)).toMatchObject({
      urlSha256: expectedHash,
      filename: 'unique.png',
      key: `legacy/wordpress/external/${expectedHash}/unique.png`,
      mimeType: 'image/png',
    });
  });

  it('normalizes WordPress resized and scaled filenames exactly like article dependencies', () => {
    expect(normalizedMediaPath('https://example.test/path/photo-1024x768.jpg')).toBe(
      '/path/photo.jpg',
    );
    expect(normalizedMediaPath('https://example.test/path/photo-scaled.jpg')).toBe(
      '/path/photo.jpg',
    );
  });

  it('reads PNG dimensions from trusted magic bytes', () => {
    const bytes = Buffer.alloc(24);
    Buffer.from('89504e470d0a1a0a', 'hex').copy(bytes);
    bytes.writeUInt32BE(640, 16);
    bytes.writeUInt32BE(360, 20);
    expect(inspectImage(bytes)).toEqual({ mimeType: 'image/png', width: 640, height: 360 });
  });

  it('rejects private and documentation IP ranges', () => {
    expect(isPublicIp('127.0.0.1')).toBe(false);
    expect(isPublicIp('10.1.2.3')).toBe(false);
    expect(isPublicIp('203.0.113.10')).toBe(false);
    expect(isPublicIp('::1')).toBe(false);
    expect(isPublicIp('0:0:0:0:0:0:0:1')).toBe(false);
    expect(isPublicIp('::ffff:127.0.0.1')).toBe(false);
    expect(isPublicIp('2001:db8::1')).toBe(false);
    expect(isPublicIp('1.1.1.1')).toBe(true);
    expect(isPublicIp('2606:4700:4700::1111')).toBe(true);
  });
});
