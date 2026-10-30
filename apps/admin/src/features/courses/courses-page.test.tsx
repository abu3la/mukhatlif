import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CourseDefinition, PermissionId } from '@mukhtalif/types';
import { useMemo } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminAuthContext, type AdminAuthContextValue } from '@/application';
import type { AdminAuthGateway } from '@/data';
import { demoData } from '@/lib';
import { CoursesManagement } from './courses-page';

const course: CourseDefinition = {
  id: 'course-1',
  title: 'كيف تحكي الصورة قصة؟',
  description: 'وصف الدورة',
  category: 'الإبداع',
  skill: 'السرد البصري',
  level: 'مبتدئ',
  instructor: 'مختلف',
  price: 0,
  durationMinutes: 0,
  lessonCount: 1,
  published: true,
  lessons: [
    {
      id: 'lesson-1',
      title: 'الدرس الأول',
      body: '',
      video: '',
      durationSeconds: 0,
      resources: [],
    },
  ],
  resources: [],
};

const learner = {
  member: 'learner-1',
  name: 'متعلم',
  enrollment: {
    progress: {},
    certificate: null,
    order: { id: 'order-1', amount: 0, createdAt: '2026-10-01T00:00:00.000Z' },
  },
  submissions: [
    {
      name: 'submission-1',
      assignment_title: 'التكليف الأول',
      answer: 'الإجابة',
      status: 'Pending',
      comments: '',
    },
  ],
};

function Providers({ permissions }: { permissions: readonly PermissionId[] }) {
  const auth = useMemo<AdminAuthContextValue>(
    () => ({
      status: 'authenticated',
      viewer: { ...demoData.viewer, permissions: [...permissions] },
      deniedEmail: null,
      error: null,
      isSubmitting: false,
      demoAccounts: [],
      signIn: vi.fn(),
      changePassword: vi.fn(),
      requestPasswordChangeVerification: vi.fn(),
      signOut: vi.fn(),
      retry: vi.fn(),
    }),
    [permissions],
  );
  return (
    <AdminAuthContext.Provider value={auth}>
      <CoursesManagement
        authGateway={{ getAccessToken: () => 'token' } as unknown as AdminAuthGateway}
        connection={{ baseUrl: 'https://api.test', devUserId: null }}
      />
    </AdminAuthContext.Provider>
  );
}

async function openCourse(permissions: readonly PermissionId[]) {
  const user = userEvent.setup();
  render(<Providers permissions={permissions} />);
  await screen.findByRole('option', { name: /كيف تحكي الصورة قصة/ });
  await user.selectOptions(screen.getByRole('combobox', { name: 'الدورة' }), 'course-1');
  await screen.findByRole('button', { name: 'المحتوى' });
  return user;
}

describe('Academy page access levels', () => {
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url.endsWith('/learners')) return Response.json([learner]);
    if (url.endsWith('/course-1')) return Response.json(course);
    return Response.json([{ ...course }]);
  });

  beforeEach(() => {
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('offers editing, uploads and grading to a role that manages the Academy', async () => {
    const user = await openCourse(['courses.view', 'courses.manage']);

    expect(screen.getByRole('button', { name: 'دورة جديدة' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'حفظ الدورة' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'اسم الدورة' })).toBeEnabled();
    expect(screen.getByText('إدارة المحتوى والتسجيلات والتقييم.', { exact: false })).toBeVisible();
    expect(screen.getAllByText('تعديل', { exact: false }).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'المتعلمون والتقييم' }));
    expect(await screen.findByRole('button', { name: 'حفظ التقييم' })).toBeEnabled();
    expect(screen.getByRole('combobox', { name: 'التقييم' })).toBeEnabled();
  });

  it('shows a view-only role the content with nothing it could change', async () => {
    const user = await openCourse(['courses.view']);

    expect(screen.getByText('لديك صلاحية العرض فقط.', { exact: false })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'دورة جديدة' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'حفظ الدورة' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'اسم الدورة' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'اسم الدورة' })).toHaveValue(course.title);
    expect(screen.queryByText('تعديل', { exact: false })).not.toBeInTheDocument();
    expect(screen.getAllByText('عرض', { exact: false }).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'المتعلمون والتقييم' }));
    const answer = await screen.findByText('الإجابة');
    const grading = within(answer.closest('form') as HTMLFormElement);
    expect(grading.queryByRole('button', { name: 'حفظ التقييم' })).not.toBeInTheDocument();
    expect(grading.getByRole('combobox', { name: 'التقييم' })).toBeDisabled();
    expect(grading.getByRole('textbox', { name: 'ملاحظات للمتعلم' })).toBeDisabled();
    expect(fetchMock.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(true);
  });

  it('ignores a file dropped by a view-only role', async () => {
    await openCourse(['courses.view']);

    const file = new File(['video'], 'lesson.mp4', { type: 'video/mp4' });
    fireEvent.drop(screen.getAllByText('لا يوجد ملف')[0], { dataTransfer: { files: [file] } });

    expect(screen.queryByText('lesson.mp4')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'رفع الملف' })).not.toBeInTheDocument();
  });
});
