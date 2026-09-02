import { describe, expect, it } from 'vitest';
import { sha256 } from './hash.ts';
import {
  validateMediaPublicOrigin,
  verifyExternalR2MediaStorage,
  wordpressExternalMediaAssetId,
} from './r2-media.ts';

describe('R2 media import verification', () => {
  it('separates development and production media origins', () => {
    expect(
      validateMediaPublicOrigin(
        'https://mukhtalif-api.mukhtalif-development.workers.dev',
        'development',
      ),
    ).toBe('https://mukhtalif-api.mukhtalif-development.workers.dev');
    expect(() =>
      validateMediaPublicOrigin(
        'https://mukhtalif-api.mukhtalif-development.workers.dev',
        'production',
      ),
    ).toThrow(/real production delivery origin/i);
    expect(validateMediaPublicOrigin('https://media.mukhtalif.net', 'production')).toBe(
      'https://media.mukhtalif.net',
    );
    expect(validateMediaPublicOrigin('https://fcdn.example.com', 'production')).toBe(
      'https://fcdn.example.com',
    );
    expect(() => validateMediaPublicOrigin('https://[fd00::1]', 'production')).toThrow(
      /real production delivery origin/i,
    );
    expect(() => validateMediaPublicOrigin('https://[::ffff:127.0.0.1]', 'production')).toThrow(
      /real production delivery origin/i,
    );
  });

  it('verifies an external URL-to-R2 mapping and derives a stable media ID', () => {
    const manifestRaw = '{"schemaVersion":1}\n';
    const sourceUrl =
      'https://mcusercontent.com/example/images/001bfe7c-ce48-d713-e35a-6535a622ce99.png';
    const urlSha256 = sha256(sourceUrl);
    const checksumSha256 = 'a'.repeat(64);
    const key = `legacy/wordpress/external/${urlSha256}/image.png`;
    const mapped = {
      key,
      mimeType: 'image/png',
      byteSize: 1234,
      checksumSha256,
      width: 700,
      height: 520,
    };
    const report = {
      schemaVersion: 1,
      manifestChecksumSha256: sha256(manifestRaw),
      bucket: 'mukhtalif-media',
      prefix: 'legacy/wordpress/external',
      verification: 'direct-r2-download-size-and-sha256',
      extraction: { uniqueExternalUrls: 1, rejected: [] },
      counts: { total: 1, verified: 1, errors: 0 },
      mapping: { [sourceUrl]: mapped },
      items: [
        {
          sourceUrl,
          urlSha256,
          key,
          local: { status: 'verified', ...mapped },
          remote: { status: 'verified', byteSize: 1234, checksumSha256 },
          error: null,
        },
      ],
    };
    const reportRaw = JSON.stringify(report);

    const verified = verifyExternalR2MediaStorage({
      manifestRaw,
      r2Report: report,
      r2ReportRaw: reportRaw,
    });

    expect(verified.items).toEqual([
      expect.objectContaining({ sourceUrl, key, checksumSha256, width: 700, height: 520 }),
    ]);
    expect(wordpressExternalMediaAssetId(sourceUrl)).toMatch(/^med-[0-9a-f]{32}$/);
    expect(wordpressExternalMediaAssetId(sourceUrl)).toBe(wordpressExternalMediaAssetId(sourceUrl));
  });

  it('rejects an external mapping that was not verified byte-for-byte', () => {
    const manifestRaw = '{}';
    const sourceUrl = 'https://mcusercontent.com/example/image.png';
    const urlSha256 = sha256(sourceUrl);
    const key = `legacy/wordpress/external/${urlSha256}/image.png`;
    const report = {
      schemaVersion: 1,
      manifestChecksumSha256: sha256(manifestRaw),
      bucket: 'mukhtalif-media',
      prefix: 'legacy/wordpress/external',
      verification: 'direct-r2-download-size-and-sha256',
      extraction: { uniqueExternalUrls: 1, rejected: [] },
      counts: { total: 1, verified: 1, errors: 0 },
      mapping: {
        [sourceUrl]: {
          key,
          mimeType: 'image/png',
          byteSize: 10,
          checksumSha256: 'a'.repeat(64),
          width: 10,
          height: 10,
        },
      },
      items: [
        {
          sourceUrl,
          urlSha256,
          key,
          local: {
            status: 'verified',
            mimeType: 'image/png',
            byteSize: 10,
            checksumSha256: 'a'.repeat(64),
            width: 10,
            height: 10,
          },
          remote: { status: 'verified', byteSize: 11, checksumSha256: 'a'.repeat(64) },
          error: null,
        },
      ],
    };

    expect(() =>
      verifyExternalR2MediaStorage({
        manifestRaw,
        r2Report: report,
        r2ReportRaw: JSON.stringify(report),
      }),
    ).toThrow(/not verified/i);
  });
});
