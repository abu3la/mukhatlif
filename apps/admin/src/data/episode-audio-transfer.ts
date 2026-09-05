import type { EpisodeAudioUploadSession } from '@mukhtalif/types';
import { AdminRepositoryError } from './repository-error';

export type AudioTransferPhase =
  | 'preparing'
  | 'uploading'
  | 'paused'
  | 'error'
  | 'finalizing'
  | 'verification-error'
  | 'cancelling'
  | 'cancel-error'
  | 'cancelled'
  | 'completed'
  | 'failed';
function terminal(error: unknown) {
  return (
    error instanceof AdminRepositoryError &&
    error.status !== undefined &&
    error.status >= 400 &&
    error.status < 500 &&
    ![408, 429].includes(error.status) &&
    error.context?.remoteCode !== 'UPLOAD_STATE_CHANGED'
  );
}
export interface AudioTransferSnapshot {
  phase: AudioTransferPhase;
  loaded: number;
  confirmed: number;
  total: number;
}
export interface AudioTransferTransport<T> {
  create(): Promise<EpisodeAudioUploadSession>;
  part(
    session: EpisodeAudioUploadSession,
    part: number,
    body: Blob,
    hash: string,
    signal: AbortSignal,
    progress: (loaded: number) => void,
  ): Promise<void>;
  complete(session: EpisodeAudioUploadSession): Promise<T>;
  cancel(session: EpisodeAudioUploadSession): Promise<void>;
}
export class AudioTransferCancelled extends Error {
  constructor() {
    super('Audio upload cancelled');
    this.name = 'AudioTransferCancelled';
  }
}

/** One file, one reservation. Pausing discards only the in-flight part; confirmed
 * R2 parts survive network errors and resume. No synthetic progress timers. */
export class EpisodeAudioTransfer {
  snapshot: AudioTransferSnapshot;
  private request?: AbortController;
  private wake?: () => void;
  private cancelled = false;
  private started = false;
  constructor(
    total: number,
    private readonly changed: (snapshot: AudioTransferSnapshot) => void,
  ) {
    this.snapshot = { phase: 'preparing', loaded: 0, confirmed: 0, total };
  }
  private update(patch: Partial<AudioTransferSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.changed(this.snapshot);
  }
  pause() {
    if (this.snapshot.phase !== 'uploading') return;
    this.update({ phase: 'paused', loaded: this.snapshot.confirmed });
    this.request?.abort();
  }
  resume() {
    if (!['paused', 'error', 'verification-error', 'cancel-error'].includes(this.snapshot.phase))
      return;
    this.update({
      phase: this.cancelled
        ? 'cancelling'
        : this.snapshot.phase === 'verification-error'
          ? 'finalizing'
          : 'uploading',
    });
    this.wake?.();
  }
  cancel() {
    if (
      ['preparing', 'finalizing', 'verification-error', 'completed', 'cancelled'].includes(
        this.snapshot.phase,
      )
    )
      return;
    this.cancelled = true;
    this.update({ phase: 'cancelling', loaded: this.snapshot.confirmed });
    this.request?.abort();
    this.wake?.();
  }
  private async gate() {
    while (
      ['paused', 'error', 'verification-error', 'cancel-error'].includes(this.snapshot.phase)
    ) {
      await new Promise<void>((resolve) => {
        this.wake = resolve;
      });
      this.wake = undefined;
    }
  }
  async run<T>(file: Blob, transport: AudioTransferTransport<T>): Promise<T> {
    if (this.started) throw new Error('An upload controller cannot be reused');
    this.started = true;
    this.update({ phase: 'preparing' });
    // Creation failures return to the editor. No file has been sent yet.
    const session = await transport.create();
    this.update({ phase: 'uploading' });
    for (let part = 1; part <= session.partCount;) {
      await this.gate();
      if (this.cancelled) break;
      const offset = (part - 1) * session.partSize;
      const body = file.slice(offset, Math.min(file.size, offset + session.partSize));
      try {
        const digest = await crypto.subtle.digest('SHA-256', await body.arrayBuffer());
        const hash = Array.from(new Uint8Array(digest), (b) =>
          b.toString(16).padStart(2, '0'),
        ).join('');
        await this.gate();
        if (this.cancelled) break;
        this.request = new AbortController();
        await transport.part(session, part, body, hash, this.request.signal, (loaded) => {
          if (this.snapshot.phase === 'uploading')
            this.update({ loaded: offset + Math.min(body.size, loaded) });
        });
        this.update({ confirmed: offset + body.size, loaded: offset + body.size });
        part++;
      } catch (error) {
        if (terminal(error)) {
          this.update({ phase: 'failed' });
          throw error;
        }
        if (!this.cancelled && !this.request?.signal.aborted && this.snapshot.phase !== 'paused')
          this.update({ phase: 'error', loaded: this.snapshot.confirmed });
      } finally {
        this.request = undefined;
      }
    }
    await this.gate();
    if (this.cancelled) {
      while (true) {
        try {
          await transport.cancel(session);
          break;
        } catch (error) {
          if (terminal(error)) {
            this.update({ phase: 'failed' });
            throw error;
          }
          this.update({ phase: 'cancel-error' });
          await this.gate();
        }
      }
      this.update({ phase: 'cancelled', loaded: 0, confirmed: 0 });
      throw new AudioTransferCancelled();
    }
    while (true) {
      this.update({ phase: 'finalizing', loaded: file.size });
      try {
        const result = await transport.complete(session);
        this.update({ phase: 'completed' });
        return result;
      } catch (error) {
        if (terminal(error)) {
          this.update({ phase: 'failed' });
          throw error;
        }
        // Completion may already have happened remotely. Retry reconciliation,
        // never start a duplicate upload or offer a misleading cancel button.
        this.update({ phase: 'verification-error' });
        await this.gate();
      }
    }
  }
}

/** Authenticated XHR exposes browser-to-server byte progress and true abort. */
export function sendAudioPart(
  url: string,
  body: Blob,
  headers: Headers,
  signal: AbortSignal,
  progress: (loaded: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const cleanup = () => signal.removeEventListener('abort', abort);
    const fail = () => {
      cleanup();
      reject(new Error('Audio part upload failed'));
    };
    const abort = () => {
      xhr.abort();
      fail();
    };
    if (signal.aborted) {
      fail();
      return;
    }
    xhr.open('PUT', url, true);
    xhr.timeout = 120_000;
    headers.forEach((value, key) => xhr.setRequestHeader(key, value));
    xhr.setRequestHeader('content-type', 'application/octet-stream');
    xhr.upload.addEventListener('progress', (event) => progress(event.loaded));
    xhr.addEventListener('error', fail);
    xhr.addEventListener('timeout', fail);
    xhr.addEventListener('abort', fail);
    xhr.addEventListener('load', () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else {
        let remoteCode: string | undefined;
        try {
          remoteCode = (JSON.parse(xhr.responseText) as { code?: string }).code;
        } catch {
          /* no server payload */
        }
        reject(
          new AdminRepositoryError({
            code:
              xhr.status === 401
                ? 'UNAUTHENTICATED'
                : xhr.status === 403
                  ? 'FORBIDDEN'
                  : xhr.status === 409
                    ? 'CONFLICT'
                    : 'REMOTE_ERROR',
            operation: 'uploadEpisodeAudio',
            status: xhr.status,
            retryable: xhr.status >= 500 || xhr.status === 429,
            message: 'Audio part upload failed',
            context: { remoteCode },
          }),
        );
      }
    });
    signal.addEventListener('abort', abort, { once: true });
    xhr.send(body);
  });
}
