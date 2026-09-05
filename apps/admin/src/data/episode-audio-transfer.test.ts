import { Blob as NodeBlob } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AudioTransferCancelled,
  EpisodeAudioTransfer,
  type AudioTransferTransport,
} from './episode-audio-transfer';
import { AdminRepositoryError } from './repository-error';

beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => vi.unstubAllGlobals());
const file = () => new NodeBlob(['abcdef']) as unknown as Blob;
const session = {
  id: 'upload',
  size: 6,
  partSize: 3,
  partCount: 2,
  fileName: 'test.wav',
  status: 'active' as const,
  expiresAt: Date.now() + 10000,
  uploadedParts: [],
};
function transport(
  overrides: Partial<AudioTransferTransport<string>> = {},
): AudioTransferTransport<string> {
  return {
    create: vi.fn(async () => session),
    part: vi.fn(async () => undefined),
    complete: vi.fn(async () => 'linked'),
    cancel: vi.fn(async () => undefined),
    ...overrides,
  };
}
const until = async (condition: () => boolean) => {
  await vi.waitFor(() => expect(condition()).toBe(true), { interval: 1, timeout: 2000 });
};

describe('episode audio transfer controller', () => {
  it('uses real byte progress, verifies all parts, then reports completion', async () => {
    const phases: string[] = [];
    const task = new EpisodeAudioTransfer(6, (state) => phases.push(state.phase));
    const tx = transport({
      part: vi.fn(async (_session, _part, body, hash, _signal, progress) => {
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
        progress(body.size);
        expect(task.snapshot.phase).toBe('uploading');
      }),
    });
    expect(await task.run(file(), tx)).toBe('linked');
    expect(tx.part).toHaveBeenCalledTimes(2);
    expect(task.snapshot).toMatchObject({ phase: 'completed', confirmed: 6, loaded: 6 });
    expect(phases.indexOf('finalizing')).toBeLessThan(phases.indexOf('completed'));
  });

  it('aborts the current part on pause and resumes without resending confirmed parts', async () => {
    const task = new EpisodeAudioTransfer(6, () => undefined);
    const calls: number[] = [];
    const tx = transport({
      part: vi.fn(async (_session, part, _body, _hash, signal, progress) => {
        calls.push(part);
        if (part === 2 && calls.length === 2) {
          progress(2);
          await new Promise<void>((_resolve, reject) =>
            signal.addEventListener('abort', () => reject(new Error('aborted'))),
          );
        }
      }),
    });
    const result = task.run(file(), tx);
    await until(() => calls.length === 2);
    task.pause();
    expect(task.snapshot).toMatchObject({ phase: 'paused', loaded: 3, confirmed: 3 });
    expect(tx.complete).not.toHaveBeenCalled();
    task.resume();
    expect(await result).toBe('linked');
    expect(calls).toEqual([1, 2, 2]);
    expect(tx.create).toHaveBeenCalledOnce();
  });

  it('retains the session on a network failure and retries the failed part only', async () => {
    const task = new EpisodeAudioTransfer(6, () => undefined);
    const part = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    const tx = transport({ part });
    const result = task.run(file(), tx);
    await until(() => task.snapshot.phase === 'error');
    expect(task.snapshot.confirmed).toBe(3);
    task.resume();
    expect(await result).toBe('linked');
    expect(part.mock.calls.map((call) => call[1])).toEqual([1, 2, 2]);
  });

  it('cancels a paused upload only after the server confirms abort, never completes it', async () => {
    const task = new EpisodeAudioTransfer(6, () => undefined);
    const tx = transport({
      part: vi.fn(async () => {
        task.pause();
      }),
    });
    const result = task.run(file(), tx).catch((error: unknown) => error);
    await until(() => task.snapshot.phase === 'paused');
    task.cancel();
    expect(await result).toBeInstanceOf(AudioTransferCancelled);
    expect(tx.cancel).toHaveBeenCalledOnce();
    expect(tx.complete).not.toHaveBeenCalled();
    expect(task.snapshot.phase).toBe('cancelled');
  });

  it('does not claim cancellation while offline and lets the user retry cleanup', async () => {
    const task = new EpisodeAudioTransfer(6, () => undefined);
    const tx = transport({
      part: vi.fn(async () => {
        task.pause();
      }),
      cancel: vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined),
    });
    const result = task.run(file(), tx).catch((error: unknown) => error);
    await until(() => task.snapshot.phase === 'paused');
    task.cancel();
    await until(() => task.snapshot.phase === 'cancel-error');
    task.resume();
    expect(await result).toBeInstanceOf(AudioTransferCancelled);
    expect(tx.cancel).toHaveBeenCalledTimes(2);
  });

  it('reconciles an uncertain completion, without another upload or unsafe cancellation', async () => {
    const task = new EpisodeAudioTransfer(6, () => undefined);
    const tx = transport({
      complete: vi
        .fn()
        .mockRejectedValueOnce(new Error('response lost'))
        .mockResolvedValue('linked'),
    });
    const result = task.run(file(), tx);
    await until(() => task.snapshot.phase === 'verification-error');
    task.cancel();
    expect(task.snapshot.phase).toBe('verification-error');
    task.resume();
    expect(await result).toBe('linked');
    expect(tx.part).toHaveBeenCalledTimes(2);
    expect(tx.complete).toHaveBeenCalledTimes(2);
    expect(tx.cancel).not.toHaveBeenCalled();
  });

  it('exits on a permanent conflict instead of trapping the editor in endless retries', async () => {
    const task = new EpisodeAudioTransfer(6, () => undefined);
    const error = new AdminRepositoryError({
      code: 'CONFLICT',
      operation: 'uploadEpisodeAudio',
      message: 'changed',
      status: 409,
      retryable: false,
    });
    await expect(
      task.run(
        file(),
        transport({
          complete: vi.fn(async () => {
            throw error;
          }),
        }),
      ),
    ).rejects.toBe(error);
    expect(task.snapshot.phase).toBe('failed');
  });
});
