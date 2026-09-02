import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadAndVerifyMedia, mapConcurrent, normalizePrefix, objectKey } from './core.ts';

describe('WordPress media R2 plan', () => {
  it('builds a deterministic key without stripping Unicode', () => {
    expect(objectKey('/legacy/wordpress/', 763, 'media/originals/763/احمد-عطار.jpg')).toBe(
      'legacy/wordpress/763/احمد-عطار.jpg',
    );
  });

  it('rejects unsafe prefixes and IDs', () => {
    expect(() => normalizePrefix('legacy/../wordpress')).toThrow(/safe/);
    expect(() => objectKey('legacy/wordpress', 0, 'image.jpg')).toThrow(/legacy ID/);
  });

  it('verifies local size and checksum against the source report', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'mukhtalif-r2-core-'));
    const mediaDirectory = path.join(directory, 'media/originals/34');
    await mkdir(mediaDirectory, { recursive: true });
    const bytes = Buffer.from('verified fixture');
    const checksum = createHash('sha256').update(bytes).digest('hex');
    await writeFile(path.join(mediaDirectory, 'fixture.jpg'), bytes);
    const reportPath = path.join(directory, 'media-download-report.json');
    await writeFile(
      reportPath,
      JSON.stringify({
        schemaVersion: 1,
        requested: 1,
        downloaded: 1,
        reused: 0,
        failed: 0,
        results: [
          {
            legacyId: 34,
            sourceUrl: 'https://example.test/source.jpg',
            finalUrl: 'https://example.test/source.jpg',
            relativePath: 'media/originals/34/fixture.jpg',
            mimeType: 'image/jpeg',
            byteSize: bytes.byteLength,
            checksumSha256: checksum,
            disposition: 'downloaded',
            error: null,
          },
        ],
      }),
    );
    const loaded = await loadAndVerifyMedia(reportPath, 'legacy/wordpress');
    expect(loaded.objects).toMatchObject([
      {
        legacyId: 34,
        key: 'legacy/wordpress/34/fixture.jpg',
        byteSize: bytes.byteLength,
        checksumSha256: checksum,
      },
    ]);
  });

  it('preserves input order under bounded concurrency', async () => {
    const active = { value: 0, maximum: 0 };
    const result = await mapConcurrent([3, 2, 1, 0], 2, async (value) => {
      active.value += 1;
      active.maximum = Math.max(active.maximum, active.value);
      await new Promise((resolve) => setTimeout(resolve, value));
      active.value -= 1;
      return value * 2;
    });
    expect(result).toEqual([6, 4, 2, 0]);
    expect(active.maximum).toBeLessThanOrEqual(2);
  });
});
