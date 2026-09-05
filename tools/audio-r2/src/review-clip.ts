import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { inspectAudioHead, publicAddress, safeHttpsUrl } from './network.ts';
import type { AudioMigrationPlanItem } from './core.ts';

export function clipBounds(start: number, seconds: number, episodeDuration: number) {
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(seconds) ||
    !Number.isFinite(episodeDuration) ||
    start < 0 ||
    seconds < 1 ||
    seconds > 90 ||
    start + seconds > episodeDuration
  )
    throw new Error('A review clip must be within the episode and at most 90 seconds');
  return { start, seconds };
}

async function main() {
  const [reportFile, sha, episodeId, offset, length, python, model, output] = process.argv.slice(2);
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  if (
    !reportFile ||
    !sha ||
    !episodeId ||
    !offset ||
    !length ||
    !python ||
    !model ||
    !output ||
    !path.isAbsolute(python) ||
    !path.isAbsolute(model) ||
    !path.isAbsolute(output) ||
    output === root ||
    output.startsWith(`${root}/`)
  )
    throw new Error(
      'Usage: review-clip.ts REPORT SHA EPISODE START SECONDS PYTHON LOCAL_MODEL PRIVATE_OUTPUT',
    );
  const raw = await readFile(reportFile, 'utf8');
  if (!/^[a-f0-9]{64}$/.test(sha) || createHash('sha256').update(raw).digest('hex') !== sha)
    throw new Error('Reviewed source checksum mismatch');
  const report = JSON.parse(raw) as { items: AudioMigrationPlanItem[] };
  const item = report.items.find((i) => i.databaseEpisodeId === episodeId);
  if (!item) throw new Error('Episode is not in the reviewed archive');
  if (typeof item.durationSec !== 'number') throw new Error('Reviewed duration is required');
  const bounds = clipBounds(Number(offset), Number(length), item.durationSec);
  if (!(await stat(model)).isFile() || !(await stat(python)).isFile())
    throw new Error('Existing local Python and model files are required');
  const head = await inspectAudioHead({
    sourceUrl: item.sourceUrl,
    expectedByteSize: item.expectedByteSize,
    expectedMimeType: item.mimeType,
  });
  if (head.status !== 'verified' || !head.finalUrl)
    throw new Error('Source HEAD verification failed');
  const url = safeHttpsUrl(head.finalUrl);
  // Public, previously verified source only. No credentials or local media
  // files enter ffmpeg, and no audio/video file is written by this review.
  if (!['d3ctxlq1ktw2nl.cloudfront.net', 'd3t3ozftmdmh3i.cloudfront.net'].includes(url.hostname))
    throw new Error('Review is restricted to the approved archive CDN');
  await publicAddress(url.hostname);
  const decoder = spawn(
    'ffmpeg',
    [
      '-nostdin',
      '-v',
      'error',
      '-rw_timeout',
      '15000000',
      '-ss',
      String(bounds.start),
      '-i',
      url.href,
      '-t',
      String(bounds.seconds),
      '-vn',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-threads',
      '1',
      '-f',
      'f32le',
      'pipe:1',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const transcriber = spawn(
    'nice',
    [
      '-n',
      '10',
      python,
      path.resolve(root, 'tools/audio-r2/scripts/transcribe_review_clip.py'),
      model,
    ],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  );
  let transcript = '';
  const timer = setTimeout(() => {
    decoder.kill('SIGTERM');
    transcriber.kill('SIGTERM');
  }, 180_000);
  const completed = (child: ChildProcess, label: string) =>
    new Promise<void>((resolve, reject) => {
      child.on('error', reject);
      child.on('close', (code) =>
        code === 0 ? resolve() : reject(new Error(`${label} failed (${code})`)),
      );
    });
  decoder.stderr.resume();
  transcriber.stderr.resume();
  transcriber.stdout.on('data', (chunk: Buffer) => {
    transcript += chunk.toString();
    if (Buffer.byteLength(transcript) > 1024 * 1024) transcriber.kill('SIGTERM');
  });
  try {
    await Promise.all([
      completed(decoder, 'Audio decoder'),
      completed(transcriber, 'Local transcription'),
      pipeline(decoder.stdout, transcriber.stdin),
    ]);
    const record = {
      reviewedAt: new Date().toISOString(),
      episodeId,
      reportSha256: sha,
      originalSourceUrl: item.sourceUrl,
      requestedStartSec: bounds.start,
      requestedDurationSec: bounds.seconds,
      transcription: JSON.parse(transcript),
    };
    await writeFile(output, JSON.stringify(record, null, 2), { mode: 0o600, flag: 'wx' });
    process.stdout.write('Local review transcript saved; no audio file or database change.\n');
  } finally {
    clearTimeout(timer);
    decoder.kill('SIGTERM');
    transcriber.kill('SIGTERM');
  }
}
if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url))
  main().catch((e) => {
    process.stderr.write(`${e instanceof Error ? e.message : 'Review failed'}\n`);
    process.exitCode = 1;
  });
