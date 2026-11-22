import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminAuthContext, type AdminAuthContextValue } from '@/application';
import type { AdminAuthGateway } from '@/data';
import { demoData } from '@/lib';
import { CoursesManagement } from './courses-page';

const summary = {
  id: 'c1',
  title: 'ورشة الراتب',
  description: '',
  category: '',
  skill: '',
  level: 'مبتدئ',
  instructor: '',
  price: 0,
  durationMinutes: 1,
  lessonCount: 1,
  published: false,
};
const course = {
  ...summary,
  resources: [],
  lessons: [
    {
      id: 'l1',
      title: 'الدرس الأول',
      body: '',
      video: '/private/files/old.mp4',
      durationSeconds: 60,
      resources: [],
    },
  ],
};
const saves: { lessons: { video: string; durationSeconds: number }[] }[] = [];
const calls: { path: string; body: unknown }[] = [];
let direct = false;
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

function authValue(): AdminAuthContextValue {
  return {
    status: 'authenticated',
    viewer: { ...demoData.viewer, role: 'admin' },
    deniedEmail: null,
    error: null,
    isSubmitting: false,
    demoAccounts: [],
    signIn: vi.fn(async () => undefined),
    changePassword: vi.fn(async () => undefined),
    requestPasswordChangeVerification: vi.fn(async () => undefined),
    signOut: vi.fn(async () => undefined),
    retry: vi.fn(async () => undefined),
  };
}

const mediaSrc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
const mediaDuration = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'duration');

beforeEach(() => {
  saves.length = 0;
  calls.length = 0;
  direct = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input).split('/studio/courses')[1] ?? '';
      const method = init?.method ?? 'GET';
      if (method === 'POST') calls.push({ path, body: JSON.parse(String(init?.body)) });
      if (method === 'GET' && path === '') return json([summary]);
      if (method === 'GET' && path === '/c1') return json(course);
      if (path === '/c1/upload-start')
        return json({ token: 't1', chunkSize: 5 * 1024 * 1024, ...(direct ? { direct } : {}) });
      if (path === '/c1/upload-sign') {
        const { parts } = JSON.parse(String(init?.body)) as { parts: number[] };
        return json({
          urls: parts.map((part) => ({ part, url: `https://r2.test/part-${part}` })),
          expiresIn: 3600,
        });
      }
      if (path === '/c1/upload-chunk') return json({ received: 1 });
      if (path === '/c1/upload-finish') return json({ file: '/private/files/new.mp4' });
      if (method === 'POST' && path === '') {
        const body = JSON.parse(String(init?.body));
        saves.push(body);
        return json(body);
      }
      return json({ error: 'غير متوقع' }, 404);
    }),
  );
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
  // jsdom never loads media: report a 1 h 2 min 5 s video as soon as a source is set.
  Object.defineProperty(HTMLMediaElement.prototype, 'duration', {
    configurable: true,
    get: () => 3725,
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'src', {
    configurable: true,
    get() {
      return (this as HTMLMediaElement).getAttribute('src') ?? '';
    },
    set(value: string) {
      const media = this as HTMLMediaElement;
      media.setAttribute('src', value);
      queueMicrotask(() => media.onloadedmetadata?.(new Event('loadedmetadata')));
    },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  if (mediaSrc) Object.defineProperty(HTMLMediaElement.prototype, 'src', mediaSrc);
  if (mediaDuration) Object.defineProperty(HTMLMediaElement.prototype, 'duration', mediaDuration);
});

async function openLesson() {
  render(
    <AdminAuthContext.Provider value={authValue()}>
      <CoursesManagement
        authGateway={{ getAccessToken: () => null } as unknown as AdminAuthGateway}
        connection={{ baseUrl: 'http://api.test', devUserId: null }}
      />
    </AdminAuthContext.Provider>,
  );
  const user = userEvent.setup();
  await screen.findByRole('option', { name: /ورشة الراتب/ });
  await user.selectOptions(screen.getByRole('combobox', { name: 'الدورة' }), 'c1');
  await user.click(await screen.findByText('الدروس'));
  return user;
}

describe('course lesson video', () => {
  it('shows the lesson length as hours, minutes and seconds and stores seconds', async () => {
    await openLesson();
    const group = screen.getByRole('group', { name: 'مدة الفيديو' });
    const [hours, minutes, seconds] = within(group).getAllByRole('spinbutton');
    expect([hours, minutes, seconds].map((input) => (input as HTMLInputElement).value)).toEqual([
      '0',
      '1',
      '0',
    ]);
    fireEvent.change(hours, { target: { value: '2' } });
    fireEvent.change(seconds, { target: { value: '99' } });
    expect((seconds as HTMLInputElement).value).toBe('59');
    fireEvent.click(screen.getByRole('button', { name: 'حفظ الدورة' }));
    await waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0].lessons[0].durationSeconds).toBe(2 * 3600 + 60 + 59);
  });

  it('keeps the new video and its length together after an upload, and previews it', async () => {
    const user = await openLesson();
    const file = new File([new Uint8Array(32)], 'workshop.mp4', { type: 'video/mp4' });
    fireEvent.change(screen.getByLabelText('اختيار ملف: فيديو الدرس'), {
      target: { files: [file] },
    });
    expect(await screen.findByText('معاينة قبل الرفع')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'رفع الملف' }));
    expect(await screen.findByText('رُفع الملف. احفظ الدورة لتثبيته.')).toBeInTheDocument();
    expect(screen.getByText('معاينة الملف المرفوع')).toBeInTheDocument();
    expect(screen.getByLabelText('معاينة: فيديو الدرس')).toHaveAttribute('src', 'blob:preview');
    const group = screen.getByRole('group', { name: 'مدة الفيديو' });
    expect(
      within(group)
        .getAllByRole('spinbutton')
        .map((input) => (input as HTMLInputElement).value),
    ).toEqual(['1', '2', '5']);
    fireEvent.click(screen.getByRole('button', { name: 'حفظ الدورة' }));
    await waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0].lessons[0]).toMatchObject({
      video: '/private/files/new.mp4',
      durationSeconds: 3725,
    });
  });
});

/** Stands in for R2 answering a signed PUT. */
class FakeR2Request {
  static succeed = true;
  static puts: { url: string; size: number }[] = [];
  readonly upload = new EventTarget();
  status = 0;
  timeout = 0;
  private url = '';
  private readonly listeners: Record<string, (() => void)[]> = {};
  open(_method: string, url: string) {
    this.url = url;
  }
  addEventListener(type: string, listener: () => void) {
    (this.listeners[type] ??= []).push(listener);
  }
  getResponseHeader(name: string) {
    return name === 'ETag' ? `"etag-${this.url.split('-').pop()}"` : null;
  }
  send(body: Blob) {
    FakeR2Request.puts.push({ url: this.url, size: body.size });
    queueMicrotask(() => {
      if (!FakeR2Request.succeed) return this.fire('error');
      this.upload.dispatchEvent(new ProgressEvent('progress', { loaded: body.size }));
      this.status = 200;
      this.fire('load');
    });
  }
  abort() {
    this.fire('abort');
  }
  private fire(type: string) {
    for (const listener of this.listeners[type] ?? []) listener();
  }
}

describe('direct course upload', () => {
  beforeEach(() => {
    direct = true;
    FakeR2Request.succeed = true;
    FakeR2Request.puts = [];
    vi.stubGlobal('XMLHttpRequest', FakeR2Request);
  });
  afterEach(() => vi.useRealTimers());

  it('sends the file straight to R2 and finishes with the part ETags', async () => {
    const user = await openLesson();
    const file = new File([new Uint8Array(32)], 'workshop.mp4', { type: 'video/mp4' });
    fireEvent.change(screen.getByLabelText('اختيار ملف: فيديو الدرس'), {
      target: { files: [file] },
    });
    await user.click(screen.getByRole('button', { name: 'رفع الملف' }));
    expect(await screen.findByText('رُفع الملف. احفظ الدورة لتثبيته.')).toBeInTheDocument();
    expect(FakeR2Request.puts).toEqual([{ url: 'https://r2.test/part-1', size: 32 }]);
    expect(calls.map(({ path }) => path)).toEqual([
      '/c1/upload-start',
      '/c1/upload-sign',
      '/c1/upload-finish',
    ]);
    expect(calls[2].body).toEqual({ token: 't1', parts: [{ part: 1, etag: '"etag-1"' }] });
    expect(calls.some(({ path }) => path === '/c1/upload-chunk')).toBe(false);
  });

  it('retries on its own, then offers to resume the same upload without starting over', async () => {
    const user = await openLesson();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    FakeR2Request.succeed = false;
    const file = new File([new Uint8Array(32)], 'workshop.mp4', { type: 'video/mp4' });
    fireEvent.change(screen.getByLabelText('اختيار ملف: فيديو الدرس'), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'رفع الملف' }));
    expect(
      await screen.findByText('تعثّر الاتصال، جار إعادة المحاولة تلقائيًا'),
    ).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(61_000);
    expect(
      await screen.findByText('توقف الرفع قبل اكتماله. اضغط «استئناف الرفع» لإكماله من حيث توقف.'),
    ).toBeInTheDocument();
    expect(FakeR2Request.puts).toHaveLength(7);
    FakeR2Request.succeed = true;
    vi.useRealTimers();
    await user.click(screen.getByRole('button', { name: 'استئناف الرفع' }));
    expect(await screen.findByText('رُفع الملف. احفظ الدورة لتثبيته.')).toBeInTheDocument();
    expect(calls.filter(({ path }) => path === '/c1/upload-start')).toHaveLength(1);
    expect(calls.at(-1)).toEqual({
      path: '/c1/upload-finish',
      body: { token: 't1', parts: [{ part: 1, etag: '"etag-1"' }] },
    });
  });

  it('shows a refusal from the API and starts fresh next time', async () => {
    const user = await openLesson();
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, init) =>
      String(input).endsWith('/upload-sign')
        ? json({ error: 'انتهت صلاحية الرفع. ارفع الملف مجددًا.' }, 422)
        : original(input, init),
    );
    const file = new File([new Uint8Array(32)], 'workshop.mp4', { type: 'video/mp4' });
    fireEvent.change(screen.getByLabelText('اختيار ملف: فيديو الدرس'), {
      target: { files: [file] },
    });
    await user.click(screen.getByRole('button', { name: 'رفع الملف' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'انتهت صلاحية الرفع. ارفع الملف مجددًا.',
    );
    expect(screen.getByRole('button', { name: 'رفع الملف' })).toBeEnabled();
    expect(FakeR2Request.puts).toHaveLength(0);
  });
});
