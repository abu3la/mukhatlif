import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FormSubmission, PermissionId } from '@mukhtalif/types';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AdminAuthContext,
  FormSubmissionRepositoryContext,
  type AdminAuthContextValue,
} from '@/application';
import { createFixtureAdminRepository } from '@/data';
import { demoData } from '@/lib';
import { FormSubmissionDetailsView } from './form-submission-details-page';
import { FormSubmissionsView } from './form-submissions-page';

function submission(
  id: string,
  type: 'sponsorship' | 'production_service' = 'sponsorship',
): FormSubmission {
  const common = {
    id,
    status: 'new' as const,
    internalNotes: '',
    attachmentRefs: [],
    sourceMetadata: {
      requestId: '2e81d9f9-b8b6-44b0-b31a-7dc02e54f937',
      formVersion: 1 as const,
      privacyAcceptedAt: '2026-09-02T09:00:00.000Z',
      clientSurface: 'web' as const,
      referrerPath: type === 'sponsorship' ? '/sponsor' : '/prodservice',
    },
    notificationStatus: 'failed' as const,
    notificationAttemptCount: 1,
    notificationAttemptedAt: '2026-09-02T09:00:02.000Z',
    notificationError: 'DELIVERY_REJECTED',
    statusUpdatedAt: '2026-09-02T09:00:00.000Z',
    createdAt: '2026-09-02T09:00:00.000Z',
    updatedAt: '2026-09-02T09:00:02.000Z',
  };
  if (type === 'production_service') {
    return {
      ...common,
      type,
      payload: {
        name: 'فهد السالم',
        email: 'fahad@example.com',
        phone: '+966501234568',
        details: 'إنتاج موسم صوتي جديد.',
      },
    };
  }
  return {
    ...common,
    type,
    payload: {
      organizationName: 'شركة مثال',
      contactName: 'نورة السالم',
      email: 'noura@example.com',
      phone: '+966501234567',
      message: 'رعاية موسم كامل.',
    },
  };
}

function authValue(permissions: PermissionId[]): AdminAuthContextValue {
  return {
    status: 'authenticated',
    viewer: { ...demoData.viewer, permissions },
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

const activeClients: QueryClient[] = [];

function renderPage(
  path: string,
  permissions: PermissionId[] = ['forms.view', 'forms.manage'],
  initialFormSubmissions: readonly FormSubmission[] = [
    submission('frm-1'),
    submission('frm-2', 'production_service'),
  ],
) {
  const repository = createFixtureAdminRepository({
    initialFormSubmissions,
    now: () => new Date('2026-09-02T10:00:00.000Z'),
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  activeClients.push(queryClient);
  render(
    <QueryClientProvider client={queryClient}>
      <AdminAuthContext.Provider value={authValue(permissions)}>
        <FormSubmissionRepositoryContext.Provider value={repository}>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="/requests" element={<FormSubmissionsView />} />
              <Route path="/requests/:submissionId" element={<FormSubmissionDetailsView />} />
            </Routes>
          </MemoryRouter>
        </FormSubmissionRepositoryContext.Provider>
      </AdminAuthContext.Provider>
    </QueryClientProvider>,
  );
  return repository;
}

describe('Studio form-submission inbox', () => {
  afterEach(() => {
    cleanup();
    for (const client of activeClients.splice(0)) client.clear();
  });

  it('filters the paged list by submission type with a live control', async () => {
    const user = userEvent.setup();
    renderPage('/requests');

    expect(await screen.findByText('شركة مثال')).toBeInTheDocument();
    expect(screen.getByText('فهد السالم')).toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: 'نوع الطلب' }), 'sponsorship');

    await waitFor(() => expect(screen.queryByText('فهد السالم')).not.toBeInTheDocument());
    expect(screen.getByText('شركة مثال')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'عرض الطلب' })).toHaveAttribute(
      'href',
      '/requests/frm-1',
    );
  });

  it('moves between result pages without losing the inbox route', async () => {
    const user = userEvent.setup();
    const submissions = Array.from({ length: 21 }, (_, index) => {
      const item = submission(`frm-${index + 1}`);
      if (item.type !== 'sponsorship') throw new Error('Expected a sponsorship fixture.');
      return {
        ...item,
        payload: { ...item.payload, organizationName: `شركة ${index + 1}` },
        createdAt: `2026-09-${String(index + 1).padStart(2, '0')}T09:00:00.000Z`,
      };
    });
    renderPage('/requests', ['forms.view', 'forms.manage'], submissions);

    expect(await screen.findByText('شركة 21')).toBeInTheDocument();
    expect(screen.queryByText('شركة 1')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'الصفحة التالية' }));

    expect(await screen.findByText('شركة 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'الصفحة السابقة' })).toBeEnabled();
  });

  it('returns an out-of-range page to the last available result page', async () => {
    renderPage('/requests?page=9');

    expect(await screen.findByText('شركة مثال')).toBeInTheDocument();
    expect(screen.getByText('فهد السالم')).toBeInTheDocument();
  });

  it('saves management fields and retries a failed email notification', async () => {
    const user = userEvent.setup();
    const repository = renderPage('/requests/frm-1');
    const update = vi.spyOn(repository, 'updateFormSubmission');
    const retry = vi.spyOn(repository, 'retryFormSubmissionNotification');

    expect(await screen.findByRole('heading', { name: 'شركة مثال' })).toHaveFocus();
    expect(screen.getByText('رعاية موسم كامل.')).toBeInTheDocument();
    expect(screen.getByText('رفض مزوّد البريد الرسالة.')).toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: 'حالة الطلب' }), 'in_review');
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'مسؤول الطلب' }),
      demoData.viewer.id,
    );
    await user.type(screen.getByRole('textbox', { name: 'ملاحظات داخلية' }), 'تواصل غدًا.');
    await user.click(screen.getByRole('button', { name: 'حفظ التغييرات' }));

    expect(await screen.findByText('حُفظت التغييرات.')).toHaveAttribute('role', 'status');
    expect(update).toHaveBeenCalledWith('frm-1', {
      status: 'in_review',
      assigneeId: demoData.viewer.id,
      internalNotes: 'تواصل غدًا.',
    });

    await user.click(screen.getByRole('button', { name: 'إعادة إرسال البريد' }));
    expect(await screen.findByText('أُرسل')).toBeInTheDocument();
    expect(retry).toHaveBeenCalledWith('frm-1');
    expect(screen.queryByRole('button', { name: 'إعادة إرسال البريد' })).not.toBeInTheDocument();
  });

  it('keeps management controls out of a view-only account', async () => {
    renderPage('/requests/frm-1', ['forms.view']);

    expect(await screen.findByRole('heading', { name: 'شركة مثال' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'حالة الطلب' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'ملاحظات داخلية' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'إعادة إرسال البريد' })).not.toBeInTheDocument();
    const management = screen.getByRole('complementary', { name: 'إدارة الطلب' });
    expect(within(management).getByText('لا ملاحظات.')).toBeInTheDocument();
  });

  it('does not report delivery success when the retry returns an unconfigured state', async () => {
    const user = userEvent.setup();
    const repository = renderPage('/requests/frm-1');
    vi.spyOn(repository, 'retryFormSubmissionNotification').mockResolvedValue({
      ...submission('frm-1'),
      notificationStatus: 'unconfigured',
      notificationAttemptCount: 2,
      notificationError: 'NOTIFICATION_NOT_CONFIGURED',
    });

    await screen.findByRole('heading', { name: 'شركة مثال' });
    await user.click(screen.getByRole('button', { name: 'إعادة إرسال البريد' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'لم يُرسل البريد لأن إعداداته غير مكتملة.',
    );
    expect(screen.queryByText('أُرسل البريد.')).not.toBeInTheDocument();
  });
});
