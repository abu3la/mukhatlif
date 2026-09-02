import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { NewsletterSubscriberListItem, PermissionId } from '@mukhtalif/types';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AdminAuthContext,
  NewsletterRepositoryContext,
  type AdminAuthContextValue,
} from '@/application';
import { createFixtureAdminRepository, type AdminRepository } from '@/data';
import { demoData } from '@/lib';
import { NewsletterView } from './newsletter-page';

function authValue(permissions: PermissionId[] = ['subscribers.view']): AdminAuthContextValue {
  return {
    status: 'authenticated',
    viewer: { ...demoData.viewer, permissions },
    deniedEmail: null,
    error: null,
    isSubmitting: false,
    demoAccounts: [],
    signIn: vi.fn(async () => undefined),
    signOut: vi.fn(async () => undefined),
    retry: vi.fn(async () => undefined),
  };
}

const subscribers: NewsletterSubscriberListItem[] = [
  {
    email: 'noura@example.com',
    firstName: 'نورة',
    localStatus: 'explicit_consent',
    mailchimpSyncStatus: 'unconfigured',
    requestedAt: '2026-09-01T09:00:00.000Z',
    updatedAt: '2026-09-01T09:00:01.000Z',
  },
  {
    email: 'legacy@example.com',
    localStatus: 'legacy_request',
    mailchimpSyncStatus: 'legacy_unverified',
    requestedAt: '2024-03-10T12:00:00.000Z',
    updatedAt: '2024-03-10T12:00:00.000Z',
  },
  {
    email: 'failed@example.com',
    firstName: 'ليان',
    localStatus: 'explicit_consent',
    mailchimpSyncStatus: 'failed',
    requestedAt: '2026-08-30T15:00:00.000Z',
    updatedAt: '2026-08-30T15:00:02.000Z',
  },
];

const activeClients: QueryClient[] = [];

function CurrentLocation() {
  const location = useLocation();
  return (
    <output aria-label="عنوان الصفحة الحالي">{`${location.pathname}${location.search}`}</output>
  );
}

function renderPage(
  initialNewsletterSubscribers: readonly NewsletterSubscriberListItem[] = subscribers,
  prepare?: (repository: AdminRepository) => void,
) {
  const repository = createFixtureAdminRepository({ initialNewsletterSubscribers });
  prepare?.(repository);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  activeClients.push(queryClient);
  render(
    <QueryClientProvider client={queryClient}>
      <AdminAuthContext.Provider value={authValue()}>
        <NewsletterRepositoryContext.Provider value={repository}>
          <MemoryRouter initialEntries={['/newsletter']}>
            <NewsletterView />
            <CurrentLocation />
          </MemoryRouter>
        </NewsletterRepositoryContext.Provider>
      </AdminAuthContext.Provider>
    </QueryClientProvider>,
  );
  return repository;
}

describe('Studio newsletter directory', () => {
  afterEach(() => {
    cleanup();
    for (const client of activeClients.splice(0)) client.clear();
  });

  it('shows the local subscriber data and explains the paused Mailchimp snapshot', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'النشرة البريدية' })).toBeInTheDocument();
    expect(
      screen.getByText(/آخر حالة مسجلة محليًا، وليست الحالة الحية داخل Mailchimp/),
    ).toBeInTheDocument();
    const email = await screen.findByText('noura@example.com');
    const row = email.closest<HTMLElement>('[role="row"]');
    expect(row).not.toBeNull();
    if (!row) throw new Error('Newsletter subscriber row is missing.');
    expect(within(row).getByText('نورة')).toBeInTheDocument();
    expect(within(row).getByText('موافقة مسجلة')).toBeInTheDocument();
    expect(within(row).getByText('الربط غير مهيأ')).toBeInTheDocument();
    expect(screen.getAllByText('سجل قديم غير متحقق')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /مزامنة|إرسال/ })).not.toBeInTheDocument();
  });

  it('searches and filters the read-only directory', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('noura@example.com');

    await user.type(screen.getByRole('searchbox', { name: 'البحث' }), 'legacy@');
    await user.click(screen.getByRole('button', { name: 'بحث' }));
    await waitFor(() => expect(screen.queryByText('noura@example.com')).not.toBeInTheDocument());
    expect(screen.getByText('legacy@example.com')).toBeInTheDocument();
    expect(screen.getByLabelText('عنوان الصفحة الحالي')).toHaveTextContent('/newsletter');
    expect(screen.getByLabelText('عنوان الصفحة الحالي')).not.toHaveTextContent('legacy@');

    await user.clear(screen.getByRole('searchbox', { name: 'البحث' }));
    await user.click(screen.getByRole('button', { name: 'بحث' }));
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'حالة الربط مع Mailchimp' }),
      'failed',
    );
    expect(await screen.findByText('failed@example.com')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('legacy@example.com')).not.toBeInTheDocument());
  });

  it('makes the horizontally scrolling directory keyboard-focusable', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('noura@example.com');

    const tableScroller = screen.getByRole('region', {
      name: 'مشتركو النشرة البريدية، جدول قابل للتمرير أفقيًا',
    });
    tableScroller.focus();
    expect(tableScroller).toHaveFocus();

    await user.tab();
    expect(tableScroller).not.toHaveFocus();
  });

  it('paginates without adding write controls', async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 26 }, (_, index): NewsletterSubscriberListItem => ({
      email: `person-${String(index + 1).padStart(2, '0')}@example.com`,
      localStatus: 'explicit_consent',
      mailchimpSyncStatus: 'pending',
      requestedAt: `2026-08-${String((index % 25) + 1).padStart(2, '0')}T09:00:00.000Z`,
      updatedAt: `2026-08-${String((index % 25) + 1).padStart(2, '0')}T09:00:00.000Z`,
    }));
    renderPage(many);

    await screen.findByText('person-25@example.com');
    await user.click(screen.getByRole('button', { name: 'الصفحة التالية' }));

    expect(await screen.findByText('person-26@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'الصفحة السابقة' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /مزامنة|إرسال/ })).not.toBeInTheDocument();
  });

  it('retries the local directory read without offering a provider action', async () => {
    const failure = vi.fn().mockRejectedValue(new Error('offline'));
    renderPage(subscribers, (repository) => {
      vi.spyOn(repository, 'listNewsletterSubscribers').mockImplementation(failure);
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('تعذّر تحميل المشتركين');
    expect(screen.getByRole('button', { name: 'إعادة المحاولة' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /مزامنة|إرسال/ })).not.toBeInTheDocument();
  });
});
