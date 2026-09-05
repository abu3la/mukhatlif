import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { S3Client } from '@aws-sdk/client-s3';
import { audioObjectKey, type AudioMigrationPlanItem } from './core.ts';
import { digestStream, transferAudio, validAudioMagic } from './transfer.ts';
import { archiveTransferOrder } from './apply-cli.ts';

const body = Buffer.from('ID3-test-audio-fixture');
const sha = createHash('sha256').update(body).digest('hex');
const url = 'https://anchor.fm/example.mp3';
const item = {
  sourceUrl: url,
  sourceUrlSha256: createHash('sha256').update(url).digest('hex'),
  key: audioObjectKey(url, 'mp3'),
  extension: 'mp3',
  mimeType: 'audio/mpeg',
  expectedByteSize: body.length,
} as AudioMigrationPlanItem;

async function stagedFile() {
  const dir = await mkdtemp(path.join(tmpdir(), 'mukhtalif-audio-test-'));
  const file = path.join(dir, 'fixture.download');
  await writeFile(file, body, { mode: 0o600 });
  return { dir, file };
}

function midFrameMp3(prefix = 354, rates = [192, 192, 192]) {
  const indexes = new Map([
    [160, 10],
    [192, 11],
    [224, 12],
  ]);
  const lengths = rates.map((rate) => Math.floor((144000 * rate) / 48000));
  const bytes = Buffer.alloc(prefix + lengths.reduce((a, b) => a + b, 0), 0x20);
  let offset = prefix;
  for (const [i, rate] of rates.entries()) {
    bytes.set([0xff, 0xfb, (indexes.get(rate)! << 4) | 4, 0x64], offset);
    offset += lengths[i]!;
  }
  return bytes;
}

describe('archive transfer safeguards', () => {
  it('recognizes a mid-frame MP3 cut only after three complete consecutive frames', () => {
    expect(validAudioMagic(midFrameMp3(), 'mp3')).toBe(true);
    expect(validAudioMagic(midFrameMp3(354, [160, 192, 224]), 'mp3')).toBe(true);
    expect(validAudioMagic(midFrameMp3(354, [192, 192]), 'mp3')).toBe(false);
    expect(validAudioMagic(midFrameMp3().subarray(0, -1), 'mp3')).toBe(false);
    expect(validAudioMagic(midFrameMp3(), 'm4a')).toBe(false);
  });

  it.each([
    [0xf3, 192],
    [0xe3, 384],
  ])(
    'recognizes lower-sample-rate MPEG header %i with its correct frame length',
    (versionByte, length) => {
      const bytes = Buffer.alloc(100 + length * 3);
      for (let i = 0; i < 3; i++) bytes.set([0xff, versionByte, 0x84, 0x64], 100 + i * length);
      expect(validAudioMagic(bytes, 'mp3')).toBe(true);
    },
  );

  it('includes padding in consecutive MPEG frame offsets', () => {
    const bytes = Buffer.alloc(100 + 627 * 3);
    for (let i = 0; i < 3; i++) bytes.set([0xff, 0xfb, 0xb2, 0x64], 100 + i * 627);
    expect(validAudioMagic(bytes, 'mp3')).toBe(true);
  });

  it('rejects accidental sync words, malformed frames and inconsistent stream parameters', () => {
    for (const [relative, replacement] of [
      [1, 0xfd],
      [2, 0xf4],
      [2, 0xbc],
      [2, 0xb0],
      [3, 0xe4],
    ] as const) {
      const bytes = midFrameMp3();
      bytes[354 + 576 + relative] = replacement;
      expect(validAudioMagic(bytes, 'mp3')).toBe(false);
    }
    const wronglySpaced = midFrameMp3();
    wronglySpaced[354 + 576] = 0;
    wronglySpaced.set([0xff, 0xfb, 0xb4, 0x64], 354 + 577);
    expect(validAudioMagic(wronglySpaced, 'mp3')).toBe(false);
  });

  it('bounds leading-fragment search and rejects text error wrappers containing frame-like bytes', () => {
    expect(validAudioMagic(midFrameMp3(4096), 'mp3')).toBe(true);
    expect(validAudioMagic(midFrameMp3(4097), 'mp3')).toBe(false);
    for (const prefix of [
      '<!DOCTYPE html>',
      '<html>',
      '<?xml version="1.0"?>',
      '{"error":',
      '["error"',
    ]) {
      const bytes = midFrameMp3();
      bytes.write(prefix, 0);
      expect(validAudioMagic(bytes, 'mp3')).toBe(false);
    }
  });

  it('handles MP3-only additions without missing canaries or duplicate uploads', () => {
    const large = { ...item, expectedByteSize: 100, showSlug: 'petroly' };
    const small = { ...item, expectedByteSize: 10, showSlug: 'bokra' };
    expect(archiveTransferOrder([large, small])).toEqual([small, large]);
    expect(archiveTransferOrder([small])).toEqual([small]);
    expect(archiveTransferOrder([])).toEqual([]);
  });
  it('rejects HTML and distinguishes MP3 from MP4', () => {
    expect(validAudioMagic(Buffer.from('<html>error</html>'), 'mp3')).toBe(false);
    expect(validAudioMagic(body, 'mp3')).toBe(true);
    expect(validAudioMagic(body, 'm4a')).toBe(false);
    expect(validAudioMagic(Buffer.from('0000ftypM4A '), 'm4a')).toBe(true);
  });
  it('bounds streamed data and detects short bodies', async () => {
    await expect(
      digestStream(
        (async function* () {
          yield body;
        })(),
        1,
      ),
    ).rejects.toThrow('exceeds');
    await expect(
      digestStream(
        (async function* () {
          yield body;
        })(),
        100,
      ),
    ).rejects.toThrow('shorter');
    expect(
      await digestStream(
        (async function* () {
          yield body;
        })(),
        body.length,
      ),
    ).toBe(sha);
  });
  it('does not overwrite a mismatched existing key', async () => {
    const { dir, file } = await stagedFile();
    const send = vi
      .fn()
      .mockResolvedValue({ ContentLength: body.length, Metadata: { sha256: 'different' } });
    try {
      await expect(
        transferAudio({
          client: { send } as unknown as S3Client,
          item,
          file,
          state: { downloaded: true, sha256: sha },
          save: async () => {},
        }),
      ).rejects.toThrow('will not be overwritten');
      expect(send.mock.calls.map((c) => c[0].constructor.name)).toEqual(['HeadObjectCommand']);
    } finally {
      await rm(dir, { recursive: true });
    }
  });
  it('resumes acknowledged parts, conditionally publishes and verifies every byte', async () => {
    const { dir, file } = await stagedFile();
    const send = vi.fn(async (command) => {
      switch (command.constructor.name) {
        case 'HeadObjectCommand':
          throw Object.assign(new Error('missing'), { $metadata: { httpStatusCode: 404 } });
        case 'ListPartsCommand':
          return { Parts: [{ PartNumber: 1, ETag: 'part', Size: body.length }] };
        case 'CompleteMultipartUploadCommand':
          expect(command.input.IfNoneMatch).toBe('*');
          return {};
        case 'GetObjectCommand':
          return {
            ContentLength: body.length,
            ContentType: item.mimeType,
            Metadata: { sha256: sha, 'source-sha256': item.sourceUrlSha256 },
            ETag: 'final',
            Body: (async function* () {
              yield body;
            })(),
          };
        default:
          throw new Error('Unexpected call');
      }
    });
    const state = { downloaded: true, sha256: sha, uploadId: 'existing-upload' };
    try {
      await transferAudio({
        client: { send } as unknown as S3Client,
        item,
        file,
        state,
        save: async () => {},
      });
      expect(state).toMatchObject({ sha256: sha, etag: 'final', verifiedAt: expect.any(String) });
      expect(send.mock.calls.map((c) => c[0].constructor.name)).not.toContain('UploadPartCommand');
      await expect(access(file)).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true });
    }
  });
  it('does not mark a corrupt R2 object verified or remove the local recovery file', async () => {
    const { dir, file } = await stagedFile();
    const state = { downloaded: true, sha256: sha };
    const send = vi.fn(async (command) =>
      command.constructor.name === 'HeadObjectCommand'
        ? {
            ContentLength: body.length,
            ContentType: item.mimeType,
            Metadata: { sha256: sha, 'source-sha256': item.sourceUrlSha256 },
          }
        : {
            ContentLength: body.length,
            ContentType: item.mimeType,
            Metadata: { sha256: sha, 'source-sha256': item.sourceUrlSha256 },
            Body: (async function* () {
              yield Buffer.alloc(body.length);
            })(),
          },
    );
    try {
      await expect(
        transferAudio({
          client: { send } as unknown as S3Client,
          item,
          file,
          state,
          save: async () => {},
        }),
      ).rejects.toThrow('SHA-256 mismatch');
      expect(state).not.toHaveProperty('verifiedAt');
      await expect(access(file)).resolves.toBeUndefined();
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  it('refuses a previously verified object if its delivery type changed', async () => {
    const { dir, file } = await stagedFile();
    const send = vi.fn().mockResolvedValue({
      ContentLength: body.length,
      ContentType: 'text/html',
      Metadata: { sha256: sha, 'source-sha256': item.sourceUrlSha256 },
      ETag: 'final',
    });
    try {
      await expect(
        transferAudio({
          client: { send } as unknown as S3Client,
          item,
          file,
          state: { sha256: sha, verifiedAt: '2026-09-05T03:00:00Z', etag: 'final' },
          save: async () => {},
        }),
      ).rejects.toThrow('Previously verified R2 object changed');
      await expect(access(file)).resolves.toBeUndefined();
    } finally {
      await rm(dir, { recursive: true });
    }
  });
});
