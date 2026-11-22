/**
 * Course file transfer. When the API offers it, parts go from the browser
 * straight to R2 through short-lived signed links, a few at a time, so the
 * upload is limited only by the uploader's connection. Each part is retried on
 * its own, and the parts that arrived are kept so a stopped upload resumes
 * instead of starting over. Without signing, parts go through the API in order.
 */

export type CourseRequest = <T>(path: string, body?: unknown) => Promise<T>;

export interface CourseUploadSession {
  token: string;
  chunkSize: number;
  direct?: boolean;
}

/** Kept by the caller between attempts; parts already in R2 are not sent again. */
export interface CourseUploadProgress {
  session: CourseUploadSession;
  done: Map<number, string>;
}

/** An API answer with its HTTP status, so callers can tell final refusals from hiccups. */
export class CourseRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'CourseRequestError';
  }
}

/** R2 refused or never answered one part. Status 0 means the network failed. */
export class PartUploadError extends Error {
  constructor(readonly status: number) {
    super(`Part upload failed (${status})`);
    this.name = 'PartUploadError';
  }
}

/** R2 stored the part but the browser could not read its ETag (CORS must expose it). */
export class MissingPartTagError extends Error {
  constructor() {
    super('تعذّر تأكيد رفع جزء من الملف. تواصل مع الدعم التقني.');
    this.name = 'MissingPartTagError';
  }
}

export type PartPut = (
  url: string,
  body: Blob,
  progress: (loaded: number) => void,
  signal: AbortSignal,
) => Promise<string>;

const PART_TIMEOUT_MS = 5 * 60_000;

/** PUTs one part with real byte progress and returns the ETag R2 assigned it. */
export const putPart: PartPut = (url, body, progress, signal) =>
  new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new PartUploadError(0));
    const xhr = new XMLHttpRequest();
    const stop = () => xhr.abort();
    signal.addEventListener('abort', stop, { once: true });
    const settle = (action: () => void) => {
      signal.removeEventListener('abort', stop);
      action();
    };
    xhr.open('PUT', url, true);
    xhr.timeout = PART_TIMEOUT_MS;
    xhr.upload.addEventListener('progress', (event) => progress(event.loaded));
    xhr.addEventListener('load', () =>
      settle(() => {
        if (xhr.status < 200 || xhr.status >= 300) return reject(new PartUploadError(xhr.status));
        const etag = xhr.getResponseHeader('ETag');
        if (etag) resolve(etag);
        else reject(new MissingPartTagError());
      }),
    );
    for (const type of ['error', 'timeout', 'abort'] as const)
      xhr.addEventListener(type, () => settle(() => reject(new PartUploadError(0))));
    xhr.send(body);
  });

/** Waits before each retry of the same part: about a minute in all. */
export const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 15_000, 30_000];
const CONCURRENT_PARTS = 4;
const SIGN_BATCH = 32;
/** Signed links are refreshed this long before they expire. */
const LINK_MARGIN_MS = 60_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** A refusal from the API (other than a busy or failing server) will not change on retry. */
function isFinal(error: unknown) {
  if (error instanceof MissingPartTagError) return true;
  return error instanceof CourseRequestError && error.status >= 400 && error.status < 500;
}

export interface TransferOptions {
  file: Blob;
  courseId: string;
  request: CourseRequest;
  progress: CourseUploadProgress;
  /** Bytes sent so far, from parts confirmed by R2 plus parts in flight. */
  onProgress: (sent: number) => void;
  /** True while waiting to retry after a failed part. */
  onRetrying?: (retrying: boolean) => void;
  signal: AbortSignal;
  put?: PartPut;
  wait?: (ms: number) => Promise<void>;
}

export async function sendDirect({
  file,
  courseId,
  request,
  progress,
  onProgress,
  onRetrying,
  signal,
  put = putPart,
  wait = sleep,
}: TransferOptions): Promise<{ file: string }> {
  const { session, done } = progress;
  const size = session.chunkSize;
  const count = Math.max(1, Math.ceil(file.size / size));
  const bytesOf = (part: number) => Math.min(size, file.size - (part - 1) * size);
  const queue = Array.from({ length: count }, (_, i) => i + 1).filter((part) => !done.has(part));
  const links = new Map<number, { url: string; until: number }>();
  const inFlight = new Map<number, number>();
  let confirmed = [...done.keys()].reduce((sum, part) => sum + bytesOf(part), 0);
  const report = () =>
    onProgress(confirmed + [...inFlight.values()].reduce((sum, loaded) => sum + loaded, 0));
  report();

  let signing: Promise<void> | null = null;
  const sign = async (first: number) => {
    const batch = [first, ...queue.filter((part) => !links.has(part))].slice(0, SIGN_BATCH);
    const answer = await request<{ urls: { part: number; url: string }[]; expiresIn: number }>(
      `/${courseId}/upload-sign`,
      { token: session.token, parts: [...new Set(batch)] },
    );
    const lifetime = answer.expiresIn * 1000;
    const until = Date.now() + Math.max(lifetime - LINK_MARGIN_MS, lifetime / 2);
    for (const { part, url } of answer.urls) links.set(part, { url, until });
  };
  // One signing request at a time; a part missing from another worker's batch signs its own.
  const linkFor = async (part: number): Promise<string> => {
    for (let round = 0; round < 6; round++) {
      const link = links.get(part);
      if (link && link.until > Date.now()) return link.url;
      if (!signing)
        signing = sign(part).finally(() => {
          signing = null;
        });
      await signing;
    }
    throw new CourseRequestError(503, 'تعذّر تجهيز رابط الرفع.');
  };

  const stop = new AbortController();
  const abort = () => stop.abort();
  signal.addEventListener('abort', abort, { once: true });
  let failure: unknown = null;
  let waiting = 0;
  const worker = async () => {
    while (!failure && !stop.signal.aborted && queue.length) {
      const part = queue.shift()!;
      const start = (part - 1) * size;
      for (let attempt = 0; ; attempt++) {
        try {
          const url = await linkFor(part);
          const etag = await put(
            url,
            file.slice(start, start + bytesOf(part)),
            (loaded) => {
              inFlight.set(part, Math.min(loaded, bytesOf(part)));
              report();
            },
            stop.signal,
          );
          inFlight.delete(part);
          done.set(part, etag);
          confirmed += bytesOf(part);
          report();
          break;
        } catch (error) {
          inFlight.delete(part);
          report();
          if (stop.signal.aborted || failure) return;
          if (isFinal(error) || attempt >= RETRY_DELAYS_MS.length) {
            failure = error;
            stop.abort();
            return;
          }
          // An expired or refused link is replaced on the next attempt.
          if (error instanceof PartUploadError && (error.status === 403 || error.status === 400))
            links.delete(part);
          if (waiting++ === 0) onRetrying?.(true);
          await wait(RETRY_DELAYS_MS[attempt]);
          if (--waiting === 0) onRetrying?.(false);
          if (stop.signal.aborted) return;
        }
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(CONCURRENT_PARTS, count) }, worker));
  } finally {
    signal.removeEventListener('abort', abort);
    if (waiting) onRetrying?.(false);
  }
  if (failure) throw failure;
  if (signal.aborted) throw new PartUploadError(0);

  const parts = Array.from({ length: count }, (_, i) => ({ part: i + 1, etag: done.get(i + 1)! }));
  for (let attempt = 0; ; attempt++) {
    try {
      return await request<{ file: string }>(`/${courseId}/upload-finish`, {
        token: session.token,
        parts,
      });
    } catch (error) {
      if (isFinal(error) || attempt >= 2 || signal.aborted) throw error;
      await wait(RETRY_DELAYS_MS[attempt]);
    }
  }
}

/** The older route: base64 pieces through the API, strictly in order, no resume. */
export async function sendThroughApi({
  file,
  courseId,
  request,
  progress,
  onProgress,
  signal,
}: TransferOptions): Promise<{ file: string }> {
  const { session } = progress;
  for (let offset = 0; offset < file.size; offset += session.chunkSize) {
    if (signal.aborted) throw new PartUploadError(0);
    const bytes = new Uint8Array(
      await file.slice(offset, offset + session.chunkSize).arrayBuffer(),
    );
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    await request(`/${courseId}/upload-chunk`, {
      token: session.token,
      offset,
      content: btoa(binary),
    });
    onProgress(Math.min(file.size, offset + session.chunkSize));
  }
  return request<{ file: string }>(`/${courseId}/upload-finish`, { token: session.token });
}
