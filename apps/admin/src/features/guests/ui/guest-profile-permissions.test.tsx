import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AdminAuthContext,
  StudioDataContext,
  type AdminAuthContextValue,
  type StudioDataContextValue,
} from '@/application';
import { demoData, type PermissionId } from '@/lib';
import { GuestProfileView } from './guest-profile-page';

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

function createStudioValue(): StudioDataContextValue {
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
    createGuest: vi.fn(async () => demoData.guests[0]!.id),
    updateGuest: vi.fn(async () => undefined),
    addGuestSocial: vi.fn(async () => demoData.guestSocials[0]!.id),
    updateGuestSocial: vi.fn(async () => undefined),
    removeGuestSocial: vi.fn(async () => undefined),
    addGuestAppearance: vi.fn(async () => undefined),
    removeGuestAppearance: vi.fn(async () => undefined),
  };
}

function renderProfile(permissions: PermissionId[]) {
  return render(
    <MemoryRouter initialEntries={['/guests/guest_raed']}>
      <AdminAuthContext.Provider value={createAuthValue(permissions)}>
        <StudioDataContext.Provider value={createStudioValue()}>
          <Routes>
            <Route path="/guests/:guestId" element={<GuestProfileView />} />
          </Routes>
        </StudioDataContext.Provider>
      </AdminAuthContext.Provider>
    </MemoryRouter>,
  );
}

describe('guest profile permissions', () => {
  afterEach(cleanup);

  it('renders guest information without editable or linking controls in view-only mode', () => {
    renderProfile(['guests.view', 'episodes.view']);

    expect(screen.getByText('رائد الشهري')).toBeInTheDocument();
    expect(screen.getByText('raed@example.com')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'اسم الضيف' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'إضافة ظهور' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'إضافة حساب' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'إزالة الظهور' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'أسعار النفط: من يحرك السوق فعلًا؟' }),
    ).not.toBeInTheDocument();
  });

  it('exposes guest and linked-episode editing only in manage mode', () => {
    renderProfile(['guests.view', 'guests.manage', 'episodes.view', 'episodes.manage']);

    expect(screen.getByRole('textbox', { name: 'اسم الضيف' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إضافة ظهور' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إضافة حساب' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'إزالة الظهور' }).length).toBeGreaterThan(0);
    expect(
      screen.getByRole('link', { name: 'أسعار النفط: من يحرك السوق فعلًا؟' }),
    ).toBeInTheDocument();
  });
});
