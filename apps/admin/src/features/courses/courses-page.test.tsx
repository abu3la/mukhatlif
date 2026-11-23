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
let courseFixture: typeof course = course;
let previewFails = false;
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
  courseFixture = course;
  previewFails = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      // Any course id answers like c1, so a new, just-saved course can upload too.
      const path = (String(input).split('/studio/courses')[1] ?? '').replace(
        /^\/[^/]+(?=\/)/,
        '/c1',
      );
      const method = init?.method ?? 'GET';
      if (method === 'POST') calls.push({ path, body: JSON.parse(String(init?.body)) });
      if (method === 'GET' && path === '') return json([summary]);
      if (method === 'GET' && path === '/c1') return json(courseFixture);
      if (path === '/c1/preview')
        return previewFails
          ? json({ error: 'تعذّر تجهيز المعاينة.' }, 503)
          : json({ url: 'http://api.test/courses/media/ticket-1' });
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
      if (method === 'GET' && path === '/c1/learners')
        return json([{ member: 'u1', name: 'متعلم', enrollment: {}, submissions: [] }]);
      if (path === '/c1/delete') return json({ deleted: 'c1' });
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
  await user.click(await screen.findByRole('button', { name: /ورشة الراتب/ }));
  await user.click(await screen.findByText('الدروس'));
  return user;
}
const durationBox = () => document.querySelector<HTMLElement>('[data-lesson-duration="l1"]')!;
const save = () => fireEvent.click(screen.getByRole('button', { name: 'حفظ الدورة' }));

describe('course list', () => {
  it('lists every course as a row and opens one with a click', async () => {
    render(
      <AdminAuthContext.Provider value={authValue()}>
        <CoursesManagement
          authGateway={{ getAccessToken: () => null } as unknown as AdminAuthGateway}
          connection={{ baseUrl: 'http://api.test', devUserId: null }}
        />
      </AdminAuthContext.Provider>,
    );
    const user = userEvent.setup();
    const row = await screen.findByRole('button', { name: /ورشة الراتب/ });
    expect(row).toHaveTextContent('درس واحد');
    expect(row).toHaveTextContent('مجانية');
    expect(row).toHaveTextContent('مسودة');
    expect(screen.queryByRole('combobox', { name: 'الدورة' })).not.toBeInTheDocument();
    await user.click(row);
    await waitFor(() => expect(row).toHaveAttribute('aria-current', 'true'));
    expect(await screen.findByText('الدروس')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'دورة جديدة' })).toBeEnabled();
  });
});

describe('course lesson video', () => {
  it('shows the lesson length read from the video, with nothing to type', async () => {
    await openLesson();
    expect(durationBox()).toHaveTextContent('1:00');
    expect(within(durationBox()).queryAllByRole('spinbutton')).toHaveLength(0);
    expect(within(durationBox()).queryAllByRole('textbox')).toHaveLength(0);
    save();
    await waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0].lessons[0].durationSeconds).toBe(60);
  });

  it('opens the stored lesson video in its player without a click', async () => {
    await openLesson();
    const player = await screen.findByLabelText('معاينة: فيديو الدرس');
    expect(player).toHaveAttribute('src', 'http://api.test/courses/media/ticket-1');
    expect(screen.getByText('معاينة الملف المرفوع')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'معاينة الفيديو' })).not.toBeInTheDocument();
    expect(
      calls.filter(
        ({ path, body }) =>
          path === '/c1/preview' && (body as { file: string }).file === '/private/files/old.mp4',
      ),
    ).not.toHaveLength(0);
  });

  it('keeps the preview button as a retry when the player link fails', async () => {
    previewFails = true;
    const user = await openLesson();
    const retry = await screen.findByRole('button', { name: 'معاينة الفيديو' });
    expect(await screen.findByText('تعذّر تجهيز المعاينة.')).toBeInTheDocument();
    previewFails = false;
    await user.click(retry);
    expect(await screen.findByLabelText('معاينة: فيديو الدرس')).toHaveAttribute(
      'src',
      'http://api.test/courses/media/ticket-1',
    );
  });

  it('measures a lesson video that has no length yet from the stored file', async () => {
    courseFixture = { ...course, lessons: [{ ...course.lessons[0], durationSeconds: 0 }] };
    await openLesson();
    await waitFor(() => expect(durationBox()).toHaveTextContent('1:02:05'));
    expect(calls).toContainEqual({
      path: '/c1/preview',
      body: { file: '/private/files/old.mp4' },
    });
    save();
    await waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0].lessons[0].durationSeconds).toBe(3725);
  });

  it('blocks saving until the length is read, and reads it again on request', async () => {
    courseFixture = { ...course, lessons: [{ ...course.lessons[0], durationSeconds: 0 }] };
    previewFails = true;
    const user = await openLesson();
    expect(await screen.findByText(/تعذّر قراءة مدة الفيديو/)).toBeInTheDocument();
    save();
    expect(await screen.findByText(/لم تُقرأ مدة فيديو «الدرس الأول» بعد/)).toBeInTheDocument();
    expect(saves).toHaveLength(0);
    previewFails = false;
    await user.click(screen.getByRole('button', { name: 'أعد قراءة المدة' }));
    await waitFor(() => expect(durationBox()).toHaveTextContent('1:02:05'));
    save();
    await waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0].lessons[0].durationSeconds).toBe(3725);
  });

  it('measures again when a different stored file is pasted', async () => {
    await openLesson();
    expect(durationBox()).toHaveTextContent('1:00');
    fireEvent.change(screen.getAllByLabelText('مسار الملف').at(-1)!, {
      target: { value: '/private/files/other.mp4' },
    });
    await waitFor(() => expect(durationBox()).toHaveTextContent('1:02:05'));
    expect(calls.at(-1)).toEqual({
      path: '/c1/preview',
      body: { file: '/private/files/other.mp4' },
    });
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
    expect(durationBox()).toHaveTextContent('1:02:05');
    // The new file's length came from the file itself, not from a preview link.
    expect(
      calls.some(
        ({ path, body }) =>
          path === '/c1/preview' && (body as { file: string }).file === '/private/files/new.mp4',
      ),
    ).toBe(false);
    save();
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
    expect(calls.map(({ path }) => path).filter((path) => path.includes('/upload-'))).toEqual([
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

const threeLessons = {
  ...course,
  lessons: [
    course.lessons[0],
    { id: 'l2', title: 'الدرس الثاني', body: '', video: '', durationSeconds: 0, resources: [] },
    {
      id: 'l3',
      title: 'الدرس الثالث',
      body: '',
      video: '/private/files/third.mp4',
      durationSeconds: 3725,
      resources: [],
    },
  ],
};
const lessonItems = () =>
  within(screen.getByRole('navigation', { name: 'قائمة الدروس' }))
    .getAllByRole('button')
    .filter((button) => button.classList.contains('studio-lessons__item'));
const lessonHeading = (name: RegExp) => screen.getByRole('heading', { level: 3, name });

describe('browsing lessons', () => {
  it('lists every lesson and edits one at a time, with previous and next', async () => {
    courseFixture = threeLessons;
    const user = await openLesson();
    const items = lessonItems();
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('الدرس الأول');
    expect(items[0]).toHaveTextContent('1:00');
    expect(items[1]).toHaveTextContent('بلا فيديو');
    expect(items[2]).toHaveTextContent('1:02:05');
    expect(items[0]).toHaveAttribute('aria-current', 'true');
    expect(lessonHeading(/الدرس الأول/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: /الدرس الثاني/ })).toBeNull();

    await user.click(items[1]);
    expect(items[1]).toHaveAttribute('aria-current', 'true');
    await waitFor(() => expect(lessonHeading(/الدرس الثاني/)).toHaveFocus());
    expect(screen.queryByRole('heading', { level: 3, name: /الدرس الأول/ })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'الدرس التالي' }));
    await waitFor(() => expect(lessonHeading(/الدرس الثالث/)).toHaveFocus());
    expect(screen.queryByRole('button', { name: 'الدرس التالي' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'الدرس السابق' }));
    await waitFor(() => expect(lessonHeading(/الدرس الثاني/)).toHaveFocus());
  });

  it('adds a lesson and opens it ready for its name', async () => {
    const user = await openLesson();
    await user.click(screen.getByRole('button', { name: 'إضافة درس' }));
    expect(lessonItems()).toHaveLength(2);
    expect(lessonItems()[1]).toHaveAttribute('aria-current', 'true');
    await waitFor(() => expect(lessonHeading(/درس جديد/)).toBeInTheDocument());
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getAllByLabelText('اسم الدرس').find((input) => !input.closest('[hidden]')),
      ),
    );
  });

  it('opens the lesson that holds a missing field when saving', async () => {
    courseFixture = {
      ...threeLessons,
      lessons: threeLessons.lessons.map((lesson) =>
        lesson.id === 'l3' ? { ...lesson, title: '' } : lesson,
      ),
    };
    await openLesson();
    save();
    await waitFor(() => expect(lessonItems()[2]).toHaveAttribute('aria-current', 'true'));
    await waitFor(() => expect(document.activeElement).toHaveValue(''));
    expect(document.activeElement?.closest('[data-lesson-id]')).toHaveAttribute(
      'data-lesson-id',
      'l3',
    );
    expect(saves).toHaveLength(0);
  });
});

describe('uploading to a course that was never saved', () => {
  async function newCourse() {
    render(
      <AdminAuthContext.Provider value={authValue()}>
        <CoursesManagement
          authGateway={{ getAccessToken: () => null } as unknown as AdminAuthGateway}
          connection={{ baseUrl: 'http://api.test', devUserId: null }}
        />
      </AdminAuthContext.Provider>,
    );
    const user = userEvent.setup();
    await screen.findByRole('button', { name: /ورشة الراتب/ });
    await user.click(screen.getByRole('button', { name: 'دورة جديدة' }));
    return user;
  }

  it('saves the course first, then uploads, with no separate save step', async () => {
    const user = await newCourse();
    await user.type(screen.getByLabelText('اسم الدورة'), 'ورشة جديدة');
    await user.click(screen.getByText('الدروس'));
    await user.click(screen.getByRole('button', { name: 'إضافة درس' }));
    await user.type(
      screen.getAllByLabelText('اسم الدرس').find((input) => !input.closest('[hidden]'))!,
      'المقدمة',
    );
    const file = new File([new Uint8Array(32)], 'intro.mp4', { type: 'video/mp4' });
    fireEvent.change(screen.getByLabelText('اختيار ملف: فيديو الدرس'), {
      target: { files: [file] },
    });
    await user.click(screen.getByRole('button', { name: 'رفع الملف' }));
    expect(await screen.findByText('رُفع الملف. احفظ الدورة لتثبيته.')).toBeInTheDocument();
    const order = calls.map(({ path }) => path);
    expect(order.indexOf('')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('')).toBeLessThan(order.indexOf('/c1/upload-start'));
    expect(saves[0]).toMatchObject({ title: 'ورشة جديدة' });
  });

  it('keeps the chosen file and points to the course name when it is missing', async () => {
    const user = await newCourse();
    await user.click(screen.getByText('المقطع التعريفي', { selector: 'strong' }));
    const file = new File([new Uint8Array(32)], 'trailer.mp4', { type: 'video/mp4' });
    fireEvent.change(screen.getByLabelText('اختيار ملف: المقطع التعريفي'), {
      target: { files: [file] },
    });
    await user.click(screen.getByRole('button', { name: 'رفع الملف' }));
    await waitFor(() => expect(screen.getByLabelText('اسم الدورة')).toHaveFocus());
    expect(saves).toHaveLength(0);
    expect(calls.some(({ path }) => path.endsWith('/upload-start'))).toBe(false);
    expect(screen.getByRole('button', { name: 'رفع الملف' })).toBeEnabled();
  });
});

describe('deleting a course', () => {
  async function openCourse() {
    render(
      <AdminAuthContext.Provider value={authValue()}>
        <CoursesManagement
          authGateway={{ getAccessToken: () => null } as unknown as AdminAuthGateway}
          connection={{ baseUrl: 'http://api.test', devUserId: null }}
        />
      </AdminAuthContext.Provider>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /ورشة الراتب/ }));
    await user.click(await screen.findByRole('button', { name: 'حذف الدورة' }));
    return user;
  }

  it('says how many learners lose their enrollment, then deletes for that count', async () => {
    const user = await openCourse();
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('للدورة مشترك واحد');
    expect(dialog).toHaveTextContent('لا يمكن التراجع عن الحذف.');
    await user.click(within(dialog).getByRole('button', { name: 'حذف نهائي' }));
    expect(await screen.findByText('حُذفت الدورة «ورشة الراتب».')).toBeInTheDocument();
    expect(calls).toContainEqual({ path: '/c1/delete', body: { learners: 1 } });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: 'حفظ الدورة' })).toBeNull();
  });

  it('cancels without deleting anything', async () => {
    const user = await openCourse();
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'إلغاء' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(calls.some(({ path }) => path === '/c1/delete')).toBe(false);
    expect(screen.getByRole('button', { name: 'حفظ الدورة' })).toBeInTheDocument();
  });
});
