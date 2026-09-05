import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AdminAuthContext,
  StudioDataContext,
  type AdminAuthContextValue,
  type StudioDataContextValue,
} from '@/application';
import type { CreateGuestCommand } from '@/data';
import { demoData, type GuestId, type PermissionId } from '@/lib';
import { GuestNewView } from './guest-new-page';
import { GuestsView } from './guests-page';

const CAPABILITIES = {
  'core-dashboard': true,
  'content-mutations': true,
  'subscription-mutations': true,
  'episode-audio-upload': true,
  'guest-management': true,
  'admin-analytics': true,
  'access-management': true,
} as const;

function createAuthValue(permissions: PermissionId[]): AdminAuthContextValue {
  return {
    status: 'authenticated',
    viewer: { ...demoData.viewer, role: 'editor', permissions },
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

function createStudioValue(
  createGuest: StudioDataContextValue['createGuest'] = vi.fn(async () => demoData.guests[0]!.id),
): StudioDataContextValue {
  return {
    data: {
      asOf: demoData.asOf,
      shows: demoData.shows.map((show) => ({ ...show })),
      episodes: demoData.episodes.map((episode) => ({ ...episode })),
      articles: demoData.articles.map((article) => ({ ...article })),
      homepageWeeklyEpisodesSettings: { ...demoData.homepageWeeklyEpisodesSettings },
      guestDirectory: {
        guests: demoData.guests.map((guest) => ({ ...guest })),
        guestSocials: demoData.guestSocials.map((social) => ({ ...social })),
        guestAppearances: demoData.guestAppearances.map((appearance) => ({ ...appearance })),
      },
    },
    repositoryKind: 'fixture',
    capabilities: CAPABILITIES,
    isMutating: false,
    lastError: null,
    clearLastError: vi.fn(),
    createShow: vi.fn(async () => demoData.shows[0]!.id),
    updateHomepageWeeklyEpisodesSettings: vi.fn(
      async () => demoData.homepageWeeklyEpisodesSettings,
    ),
    createArticle: vi.fn(async () => demoData.articles[0]!.id),
    updateArticle: vi.fn(async () => demoData.articles[0]!),
    transitionEpisodeStatus: vi.fn(async () => undefined),
    saveEpisode: vi.fn(async () => demoData.episodes[0]!.id),
    uploadEpisodeAudio: vi.fn(async () => demoData.episodes[0]!.id),
    transitionArticleStatus: vi.fn(async () => demoData.articles[0]!),
    getMailchimpCapability: vi.fn(async () => ({ mode: 'simulation' as const, configured: true })),
    previewArticleNewsletter: vi.fn(async () => ({ subject: 'نشرة', html: '', text: '' })),
    syncArticleNewsletterCampaign: vi.fn(async () => ({
      article: demoData.articles[0]!,
      operation: 'created' as const,
    })),
    sendArticleNewsletter: vi.fn(async () => ({
      article: demoData.articles[0]!,
      operation: 'sent' as const,
    })),
    reconcileArticleNewsletter: vi.fn(async () => ({
      article: demoData.articles[0]!,
      operation: 'sent' as const,
    })),
    listArticleMedia: vi.fn(async () => []),
    listArticleAuthors: vi.fn(async () => []),
    uploadArticleImage: vi.fn(async () => {
      throw new Error('No media upload configured for this test.');
    }),
    createGuest,
    updateGuest: vi.fn(async () => undefined),
    addGuestSocial: vi.fn(async () => demoData.guestSocials[0]!.id),
    updateGuestSocial: vi.fn(async () => undefined),
    removeGuestSocial: vi.fn(async () => undefined),
    addGuestAppearance: vi.fn(async () => undefined),
    removeGuestAppearance: vi.fn(async () => undefined),
  };
}

function renderGuests(
  createGuest: StudioDataContextValue['createGuest'],
  permissions: PermissionId[] = ['guests.view', 'guests.manage'],
) {
  return render(
    <MemoryRouter initialEntries={['/guests']}>
      <AdminAuthContext.Provider value={createAuthValue(permissions)}>
        <StudioDataContext.Provider value={createStudioValue(createGuest)}>
          <GuestsView />
        </StudioDataContext.Provider>
      </AdminAuthContext.Provider>
    </MemoryRouter>,
  );
}

function renderGuestNew(createGuest: StudioDataContextValue['createGuest']) {
  return render(
    <MemoryRouter initialEntries={['/guests/new']}>
      <StudioDataContext.Provider value={createStudioValue(createGuest)}>
        <Routes>
          <Route path="/guests/new" element={<GuestNewView />} />
          <Route path="/guests/:guestId" element={<h1>ملف الضيف المنشأ</h1>} />
        </Routes>
      </StudioDataContext.Provider>
    </MemoryRouter>,
  );
}

describe('guest creation flow', () => {
  afterEach(cleanup);

  it('shows a link to the separate page without creating a guest from the directory', async () => {
    const user = userEvent.setup();
    const createGuest = vi.fn(async () => demoData.guests[0]!.id);
    renderGuests(createGuest);

    const link = screen.getByRole('link', { name: 'ضيف جديد' });
    expect(link).toHaveAttribute('href', '/guests/new');
    expect(screen.queryByRole('form', { name: 'بيانات الضيف الجديد' })).not.toBeInTheDocument();
    expect(createGuest).not.toHaveBeenCalled();

    await user.click(link);
    expect(createGuest).not.toHaveBeenCalled();
  });

  it('hides the new-guest link from a viewer without manage permission', () => {
    renderGuests(
      vi.fn(async () => demoData.guests[0]!.id),
      ['guests.view'],
    );

    expect(screen.queryByRole('link', { name: 'ضيف جديد' })).not.toBeInTheDocument();
  });

  it('renders a focused heading, breadcrumb, and complete form on the separate page', () => {
    const createGuest = vi.fn(async () => demoData.guests[0]!.id);
    const { container } = renderGuestNew(createGuest);

    expect(screen.getByRole('heading', { name: 'ضيف جديد' })).toHaveFocus();
    const breadcrumb = screen.getByRole('navigation', { name: 'مسار الصفحة' });
    expect(within(breadcrumb).getByRole('link', { name: 'الضيوف' })).toHaveAttribute(
      'href',
      '/guests',
    );
    expect(within(breadcrumb).getByText('ضيف جديد')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('textbox', { name: 'اسم الضيف' })).toBeRequired();
    expect(screen.getByRole('textbox', { name: 'المسمى' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'المدينة' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'البريد الإلكتروني' })).toHaveAttribute(
      'dir',
      'ltr',
    );
    expect(screen.getByRole('textbox', { name: 'نبذة' })).toBeInTheDocument();
    expect(createGuest).not.toHaveBeenCalled();
    expect(container.textContent).not.toMatch(/[٠-٩۰-۹]/);
  });

  it('validates the required name and optional email before creating a guest', async () => {
    const user = userEvent.setup();
    const createGuest = vi.fn(async () => demoData.guests[0]!.id);
    renderGuestNew(createGuest);

    await user.type(screen.getByRole('textbox', { name: 'البريد الإلكتروني' }), 'a b@example.com');
    await user.click(screen.getByRole('button', { name: 'إضافة الضيف' }));

    expect(screen.getByText('أدخل اسم الضيف بحرفين على الأقل.')).toBeInTheDocument();
    expect(screen.getByText('أدخل بريدًا إلكترونيًا صحيحًا.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('راجع الحقول الموضحة.');
    expect(createGuest).not.toHaveBeenCalled();

    await user.type(screen.getByRole('textbox', { name: 'اسم الضيف' }), 'ندى');
    expect(screen.queryByText('راجع الحقول الموضحة.')).not.toBeInTheDocument();
  });

  it('submits normalized data once and opens the created profile', async () => {
    const user = userEvent.setup();
    let resolveCreate: ((id: GuestId) => void) | undefined;
    const createGuest = vi.fn(
      (_command: CreateGuestCommand) =>
        new Promise<GuestId>((resolve) => {
          resolveCreate = resolve;
        }),
    );
    renderGuestNew(createGuest);

    await user.type(screen.getByRole('textbox', { name: 'اسم الضيف' }), '  ندى السالم  ');
    await user.type(screen.getByRole('textbox', { name: 'المسمى' }), '  باحثة اقتصادية  ');
    await user.type(screen.getByRole('textbox', { name: 'المدينة' }), '  الرياض  ');
    await user.type(
      screen.getByRole('textbox', { name: 'البريد الإلكتروني' }),
      '  NADA@EXAMPLE.COM  ',
    );
    await user.type(screen.getByRole('textbox', { name: 'نبذة' }), '  متخصصة في الأسواق.  ');
    await user.click(screen.getByRole('button', { name: 'إضافة الضيف' }));

    expect(createGuest).toHaveBeenCalledTimes(1);
    expect(createGuest).toHaveBeenCalledWith({
      name: 'ندى السالم',
      role: 'باحثة اقتصادية',
      city: 'الرياض',
      email: 'nada@example.com',
      bio: 'متخصصة في الأسواق.',
    });
    expect(screen.getByRole('button', { name: 'جارٍ الإضافة…' })).toBeDisabled();

    resolveCreate?.('guest_created');
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'ملف الضيف المنشأ' })).toBeInTheDocument();
    });
  });

  it('keeps the form available and explains an operation failure', async () => {
    const user = userEvent.setup();
    const createGuest = vi.fn(async () => {
      throw new Error('offline');
    });
    renderGuestNew(createGuest);

    await user.type(screen.getByRole('textbox', { name: 'اسم الضيف' }), 'ندى السالم');
    await user.click(screen.getByRole('button', { name: 'إضافة الضيف' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'تعذّرت إضافة الضيف. حاول مرة أخرى.',
    );
    expect(screen.getByRole('form', { name: 'بيانات الضيف الجديد' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إضافة الضيف' })).toBeEnabled();
  });
});
