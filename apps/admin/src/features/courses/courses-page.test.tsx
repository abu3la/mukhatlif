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
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input).split('/studio/courses')[1] ?? '';
      const method = init?.method ?? 'GET';
      if (method === 'GET' && path === '') return json([summary]);
      if (method === 'GET' && path === '/c1') return json(course);
      if (path === '/c1/upload-start') return json({ token: 't1', chunkSize: 5 * 1024 * 1024 });
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
