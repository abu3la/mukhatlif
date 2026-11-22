import { describe, expect, it, vi } from 'vitest';
import {
  CourseRequestError,
  MissingPartTagError,
  PartUploadError,
  RETRY_DELAYS_MS,
  sendDirect,
  type CourseUploadProgress,
  type PartPut,
} from './course-upload';

const CHUNK = 10;
const file = new Blob([new Uint8Array(45)]); // five parts: 4 x 10 bytes + 5 bytes

function api(overrides: { sign?: (parts: number[]) => unknown; finish?: () => unknown } = {}) {
  const signed: number[][] = [];
  const finished: unknown[] = [];
  const request = vi.fn(async (path: string, body?: unknown) => {
    const payload = body as { parts: unknown[] };
    if (path === '/c1/upload-sign') {
      const parts = payload.parts as number[];
      signed.push(parts);
      if (overrides.sign) return overrides.sign(parts);
      return {
        urls: parts.map((part) => ({ part, url: `https://r2.test/${part}` })),
        expiresIn: 3600,
      };
    }
    if (path === '/c1/upload-finish') {
      finished.push(payload);
      if (overrides.finish) return overrides.finish();
      return { file: '/private/files/abc.mp4' };
    }
    throw new Error(`unexpected ${path}`);
  }) as unknown as (<T>(path: string, body?: unknown) => Promise<T>) & ReturnType<typeof vi.fn>;
  return { request, signed, finished };
}

const fresh = (): CourseUploadProgress => ({
  session: { token: 't1', chunkSize: CHUNK, direct: true },
  done: new Map(),
});

function run(
  put: PartPut,
  options: Partial<Parameters<typeof sendDirect>[0]> & {
    request: ReturnType<typeof api>['request'];
  },
) {
  return sendDirect({
    file,
    courseId: 'c1',
    progress: fresh(),
    onProgress: () => undefined,
    signal: new AbortController().signal,
    put,
    wait: async () => undefined,
    ...options,
  });
}

describe('direct course upload', () => {
  it('sends every part to its signed link, four at a time, then finishes with ordered ETags', async () => {
    const { request, signed, finished } = api();
    let active = 0;
    let peak = 0;
    const sizes: Record<number, number> = {};
    const put: PartPut = async (url, body, progress) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      progress(body.size);
      active--;
      const part = Number(url.split('/').pop());
      sizes[part] = body.size;
      return `"etag${part}"`;
    };
    const progress: number[] = [];
    expect(await run(put, { request, onProgress: (sent) => progress.push(sent) })).toEqual({
      file: '/private/files/abc.mp4',
    });
    expect(peak).toBe(4);
    expect(sizes).toEqual({ 1: 10, 2: 10, 3: 10, 4: 10, 5: 5 });
    expect(signed[0]).toEqual([1, 2, 3, 4, 5]);
    expect(signed).toHaveLength(1);
    expect(finished[0]).toEqual({
      token: 't1',
      parts: [1, 2, 3, 4, 5].map((part) => ({ part, etag: `"etag${part}"` })),
    });
    expect(progress.at(-1)).toBe(45);
    expect(Math.max(...progress)).toBe(45);
  });

  it('retries a failed part on its own, waiting longer each time, and says so', async () => {
    const { request } = api();
    const attempts: Record<number, number> = {};
    const put: PartPut = async (url) => {
      const part = Number(url.split('/').pop());
      attempts[part] = (attempts[part] ?? 0) + 1;
      if (part === 3 && attempts[part] <= 2) throw new PartUploadError(0);
      return `"e${part}"`;
    };
    const wait = vi.fn(async (_ms: number) => undefined);
    const retrying: boolean[] = [];
    await run(put, { request, wait, onRetrying: (value) => retrying.push(value) });
    expect(attempts).toEqual({ 1: 1, 2: 1, 3: 3, 4: 1, 5: 1 });
    expect(wait.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000]);
    expect(retrying).toEqual([true, false, true, false]);
  });

  it('signs a part again when R2 refuses its link', async () => {
    const { request, signed } = api();
    let refused = false;
    const put: PartPut = async (url) => {
      const part = Number(url.split('/').pop());
      if (part === 2 && !refused) {
        refused = true;
        throw new PartUploadError(403);
      }
      return `"e${part}"`;
    };
    await run(put, { request });
    expect(signed.slice(1)).toContainEqual(expect.arrayContaining([2]));
  });

  it('stops at once on a final refusal from the API or an unreadable ETag', async () => {
    const refusing = api({
      sign: () => {
        throw new CourseRequestError(422, 'انتهت صلاحية الرفع. ارفع الملف مجددًا.');
      },
    });
    const wait = vi.fn(async () => undefined);
    await expect(run(async () => '"e"', { request: refusing.request, wait })).rejects.toMatchObject(
      {
        status: 422,
      },
    );
    expect(wait).not.toHaveBeenCalled();
    await expect(
      run(
        async () => {
          throw new MissingPartTagError();
        },
        { request: api().request, wait },
      ),
    ).rejects.toBeInstanceOf(MissingPartTagError);
    expect(wait).not.toHaveBeenCalled();
  });

  it('gives up after about a minute on a part, keeping the parts that arrived', async () => {
    const { request, finished } = api();
    const progress = fresh();
    const put: PartPut = async (url) => {
      const part = Number(url.split('/').pop());
      if (part === 5) throw new PartUploadError(0);
      return `"e${part}"`;
    };
    const wait = vi.fn(async () => undefined);
    await expect(run(put, { request, progress, wait })).rejects.toBeInstanceOf(PartUploadError);
    expect(wait).toHaveBeenCalledTimes(RETRY_DELAYS_MS.length);
    expect([...progress.done.keys()].sort()).toEqual([1, 2, 3, 4]);
    expect(finished).toHaveLength(0);
  });

  it('resumes from the parts already in R2', async () => {
    const { request, signed, finished } = api();
    const progress = fresh();
    progress.done.set(1, '"e1"').set(2, '"e2"');
    const sent: number[] = [];
    const reported: number[] = [];
    await run(
      async (url) => {
        const part = Number(url.split('/').pop());
        sent.push(part);
        return `"e${part}"`;
      },
      { request, progress, onProgress: (bytes) => reported.push(bytes) },
    );
    expect(sent.sort()).toEqual([3, 4, 5]);
    expect(signed[0]).toEqual([3, 4, 5]);
    expect(reported[0]).toBe(20);
    expect((finished[0] as { parts: unknown[] }).parts).toHaveLength(5);
  });

  it('asks again to finish when the server is briefly unavailable', async () => {
    let calls = 0;
    const { request } = api({
      finish: () => {
        if (++calls === 1)
          throw new CourseRequestError(503, 'تعذّر تجميع أجزاء الملف. حاول مجددًا.');
        return { file: '/private/files/abc.mp4' };
      },
    });
    expect(await run(async (url) => `"${url}"`, { request })).toEqual({
      file: '/private/files/abc.mp4',
    });
    expect(calls).toBe(2);
  });
});
