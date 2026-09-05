import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import {
  AdminAuthContext,
  StudioDataContext,
  SubscriberDirectoryContext,
  type AdminAuthContextValue,
  type StudioDataContextValue,
  type SubscriberDirectoryContextValue,
} from '@/application';
import { AdminRepositoryError } from '@/data';
import { demoData, type PermissionId } from '@/lib';
import { ArticlesView, CreateArticleView } from '@/features/articles/ui/articles-page';
import { OverviewView } from '@/features/overview/ui/overview-page';
import { CreateShowView, ShowsView } from '@/features/shows/ui/shows-page';
import { SubscribersView } from '@/features/subscribers/ui/subscribers-page';
import { EpisodeEditorView } from './episode-editor-page';
import { EpisodesView } from './episodes-page';

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
    viewer: {
      ...demoData.viewer,
      role: 'editor',
      permissions,
    },
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
  overrides: Partial<
    Pick<
      StudioDataContextValue,
      'createShow' | 'createArticle' | 'updateHomepageWeeklyEpisodesSettings'
    >
  > = {},
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
    getMailchimpCapability: vi.fn(async () => ({
      mode: 'simulation' as const,
      configured: true,
      audienceName: 'جمهور العرض المحلي',
      audienceCount: 24,
      recipientTag: 'nlpage',
      recipientCount: 24,
    })),
    previewArticleNewsletter: vi.fn(async () => ({
      subject: 'نشرة تجريبية',
      html: '<p>محتوى</p>',
      text: 'محتوى',
    })),
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
    listArticleAuthors: vi.fn(async () => [
      { studioMemberId: demoData.viewer.id, displayName: demoData.viewer.name },
    ]),
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
    ...overrides,
  };
}

function createSubscriberValue(): SubscriberDirectoryContextValue {
  return {
    data: {
      plusPlan: { ...demoData.plusPlan },
      users: demoData.users.map((user) => ({ ...user })),
      subscriptions: demoData.subscriptions.map((subscription) => ({ ...subscription })),
    },
    isMutating: false,
    transitionSubscriptionStatus: vi.fn(async () => undefined),
    activatePlus: vi.fn(async () => undefined),
  };
}

function renderPage(
  children: ReactNode,
  permissions: PermissionId[],
  overrides: Partial<Pick<StudioDataContextValue, 'updateHomepageWeeklyEpisodesSettings'>> = {},
) {
  return render(
    <MemoryRouter>
      <AdminAuthContext.Provider value={createAuthValue(permissions)}>
        <StudioDataContext.Provider value={createStudioValue(overrides)}>
          <SubscriberDirectoryContext.Provider value={createSubscriberValue()}>
            {children}
          </SubscriberDirectoryContext.Provider>
        </StudioDataContext.Provider>
      </AdminAuthContext.Provider>
    </MemoryRouter>,
  );
}

function renderEpisodeEditor(
  permissions: PermissionId[],
  path = '/episodes/episode_9',
  studio = createStudioValue(),
) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AdminAuthContext.Provider value={createAuthValue(permissions)}>
        <StudioDataContext.Provider value={studio}>
          <Routes>
            <Route path="/episodes/new" element={<EpisodeEditorView />} />
            <Route path="/episodes/:episodeId" element={<EpisodeEditorView />} />
            <Route path="/episodes" element={<LocationProbe />} />
          </Routes>
        </StudioDataContext.Provider>
      </AdminAuthContext.Provider>
    </MemoryRouter>,
  );
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function renderContentCreator(
  path: '/shows/new' | '/articles/new',
  overrides: Partial<Pick<StudioDataContextValue, 'createShow' | 'createArticle'>>,
) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AdminAuthContext.Provider value={createAuthValue(MANAGE_PERMISSIONS)}>
        <StudioDataContext.Provider value={createStudioValue(overrides)}>
          <Routes>
            <Route path="/shows/new" element={<CreateShowView />} />
            <Route path="/shows" element={<LocationProbe />} />
            <Route path="/articles/new" element={<CreateArticleView />} />
            <Route path="/articles" element={<LocationProbe />} />
            <Route path="/articles/:articleId" element={<LocationProbe />} />
          </Routes>
        </StudioDataContext.Provider>
      </AdminAuthContext.Provider>
    </MemoryRouter>,
  );
}

const VIEW_ONLY_PERMISSIONS: PermissionId[] = [
  'overview.view',
  'episodes.view',
  'shows.view',
  'articles.view',
  'subscribers.view',
];

const MANAGE_PERMISSIONS: PermissionId[] = [
  ...VIEW_ONLY_PERMISSIONS,
  'episodes.manage',
  'shows.manage',
  'articles.manage',
  'subscribers.manage',
];

describe('episode YouTube editor controls', () => {
  afterEach(cleanup);

  function videoStudio(videoId: string | null = null) {
    const studio = createStudioValue();
    return {
      ...studio,
      data: {
        ...studio.data,
        episodes: studio.data.episodes.map((episode) =>
          episode.id === 'episode_9'
            ? { ...episode, status: 'published' as const, youtubeVideoId: videoId }
            : episode,
        ),
      },
    };
  }

  it('previews and saves a normalized video ID without replacing audio or publication status', async () => {
    const user = userEvent.setup();
    const studio = videoStudio();
    renderEpisodeEditor(MANAGE_PERMISSIONS, '/episodes/episode_9', studio);

    const input = screen.getByRole('textbox', { name: /^رابط الحلقة في YouTube/ });
    await user.type(input, 'https://youtu.be/Ioch353mcfc?t=12');
    expect(screen.getByRole('img', { name: 'معاينة صورة فيديو الحلقة' })).toHaveAttribute(
      'src',
      'https://i.ytimg.com/vi/Ioch353mcfc/hqdefault.jpg',
    );
    expect(document.querySelector('iframe')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'حفظ التغييرات' }));

    expect(studio.saveEpisode).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        id: 'episode_9',
        youtubeVideoId: 'Ioch353mcfc',
      }),
      'published',
    );
    expect(await screen.findByTestId('location')).toHaveTextContent('/episodes?status=published');
  });

  it('clears an existing link explicitly and removes its preview without touching audio', async () => {
    const user = userEvent.setup();
    const studio = videoStudio('Ioch353mcfc');
    renderEpisodeEditor(MANAGE_PERMISSIONS, '/episodes/episode_9', studio);

    const input = screen.getByRole('textbox', { name: /^رابط الحلقة في YouTube/ });
    expect(input).toHaveValue('https://www.youtube.com/watch?v=Ioch353mcfc');
    await user.clear(input);
    expect(screen.queryByRole('img', { name: 'معاينة صورة فيديو الحلقة' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'حفظ التغييرات' }));
    expect(studio.saveEpisode).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: 'episode_9', youtubeVideoId: null }),
      'published',
    );
  });

  it('blocks lookalike-host URLs and clears the validation error when corrected', async () => {
    const user = userEvent.setup();
    const studio = videoStudio();
    renderEpisodeEditor(MANAGE_PERMISSIONS, '/episodes/episode_9', studio);
    const input = screen.getByRole('textbox', { name: /^رابط الحلقة في YouTube/ });
    await user.type(input, 'https://youtube.com.example.test/watch?v=Ioch353mcfc');
    await user.click(screen.getByRole('button', { name: 'حفظ التغييرات' }));
    expect(studio.saveEpisode).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('أدخل رابط حلقة صالحًا من YouTube.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('img', { name: 'معاينة صورة فيديو الحلقة' })).not.toBeInTheDocument();

    await user.clear(input);
    await user.type(input, 'https://www.youtube.com/watch?v=Ioch353mcfc');
    expect(input).toHaveAttribute('aria-invalid', 'false');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'حفظ التغييرات' }));
    expect(studio.saveEpisode).toHaveBeenCalledOnce();
  });

  it('keeps the chosen link and preview after a failed save so it can be retried', async () => {
    const user = userEvent.setup();
    const studio = videoStudio('Ioch353mcfc');
    vi.mocked(studio.saveEpisode).mockRejectedValueOnce(
      new AdminRepositoryError({
        code: 'NETWORK',
        operation: 'saveEpisode',
        message: 'Temporary test outage',
        retryable: true,
      }),
    );
    renderEpisodeEditor(MANAGE_PERMISSIONS, '/episodes/episode_9', studio);
    await user.click(screen.getByRole('button', { name: 'حفظ التغييرات' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /^رابط الحلقة في YouTube/ })).toHaveValue(
      'https://www.youtube.com/watch?v=Ioch353mcfc',
    );
    expect(screen.getByRole('img', { name: 'معاينة صورة فيديو الحلقة' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'حفظ التغييرات' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'حفظ التغييرات' }));
    expect(studio.saveEpisode).toHaveBeenCalledTimes(2);
    expect(await screen.findByTestId('location')).toHaveTextContent('/episodes?status=published');
  });

  it('keeps the video field read-only for an operator without episode management permission', () => {
    const studio = videoStudio('Ioch353mcfc');
    renderEpisodeEditor(VIEW_ONLY_PERMISSIONS, '/episodes/episode_9', studio);
    expect(screen.getByRole('textbox', { name: /^رابط الحلقة في YouTube/ })).toHaveAttribute(
      'readonly',
    );
    expect(screen.queryByRole('button', { name: 'حفظ التغييرات' })).not.toBeInTheDocument();
    expect(studio.saveEpisode).not.toHaveBeenCalled();
  });
});

describe('page mutation controls', () => {
  afterEach(cleanup);

  it('keeps selection pending after saving metadata and uploads only from its own button', async () => {
    const user = userEvent.setup();
    const studio = createStudioValue();
    const current = studio.data.episodes.find((e) => e.id === 'episode_9')!;
    current.status = 'published';
    vi.mocked(studio.saveEpisode).mockResolvedValue(current.id);
    vi.mocked(studio.uploadEpisodeAudio).mockImplementation(async (draft) => {
      draft.onAudioUploaded?.();
      return current.id;
    });
    renderEpisodeEditor(MANAGE_PERMISSIONS, '/episodes/episode_9', studio);
    const file = new File(['audio'], 'اختبار.wav', { type: 'audio/wav' });
    await user.upload(screen.getByLabelText('اختيار ملف الصوت'), file);
    expect(studio.uploadEpisodeAudio).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'حفظ التغييرات' }));
    expect(studio.saveEpisode).toHaveBeenCalledOnce();
    expect(studio.uploadEpisodeAudio).not.toHaveBeenCalled();
    expect(vi.mocked(studio.saveEpisode).mock.calls[0]?.[0]).not.toHaveProperty('audioFile');
    expect(
      screen.getByText('حُفظت بيانات الحلقة. الملف المختار لم يُرفع بعد.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'رفع الملف' }));
    expect(studio.uploadEpisodeAudio).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: current.id, audioFile: file }),
    );
    expect(studio.saveEpisode).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'رفع الملف' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'حفظ التغييرات' }));
    expect(studio.uploadEpisodeAudio).toHaveBeenCalledOnce();
    expect(studio.saveEpisode).toHaveBeenCalledTimes(2);
  });

  it('keeps view-only pages readable with detail links but no mutation controls', () => {
    const episodeRender = renderPage(<EpisodesView />, VIEW_ONLY_PERMISSIONS);
    expect(screen.getByRole('heading', { name: 'الحلقات' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'حلقة جديدة' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'طبيبة غيّرت مسارها إلى التقنية' })).toHaveAttribute(
      'href',
      '/episodes/episode_9',
    );
    expect(screen.queryByRole('button', { name: 'نشر' })).not.toBeInTheDocument();
    episodeRender.unmount();

    const showRender = renderPage(<ShowsView />, VIEW_ONLY_PERMISSIONS);
    expect(screen.getByText('بترولي')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'برنامج جديد' })).not.toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'قسم حلقات آخر أسبوع' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'عنوان القسم' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'عرض القسم في الصفحة الرئيسية' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'حفظ إعدادات القسم' })).not.toBeInTheDocument();
    showRender.unmount();

    const articleRender = renderPage(<ArticlesView />, VIEW_ONLY_PERMISSIONS);
    expect(screen.getByText('دليل الضيف: قبل أن تصل إلى الاستوديو')).toBeInTheDocument();
    expect(screen.getAllByText('فريق مختلف')[0]).toMatchObject({
      tagName: 'BDI',
      dir: 'auto',
    });
    expect(screen.queryByRole('link', { name: 'مقال جديد' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'تنزيل سكيل المقالات' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'سكيل المقالات في محادثتك' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'نشر' })).not.toBeInTheDocument();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    articleRender.unmount();

    renderPage(<SubscribersView />, VIEW_ONLY_PERMISSIONS);
    expect(screen.getByRole('heading', { name: 'المشتركون' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'حسابات التطبيق واشتراكات مختلف بلس. مشتركو البريد في صفحة «النشرة البريدية».',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'تفعيل بلس يدويًا' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'إعادة التفعيل يدويًا' })).not.toBeInTheDocument();
  });

  it('shows page-specific mutation controls only with manage permission', () => {
    const episodeRender = renderPage(<EpisodesView />, MANAGE_PERMISSIONS);
    expect(screen.getByRole('link', { name: 'حلقة جديدة' })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'طبيبة غيّرت مسارها إلى التقنية' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'نشر' }).length).toBeGreaterThan(0);
    episodeRender.unmount();

    const showRender = renderPage(<ShowsView />, MANAGE_PERMISSIONS);
    expect(screen.getByRole('link', { name: 'برنامج جديد' })).toHaveAttribute('href', '/shows/new');
    expect(screen.getByRole('form', { name: 'قسم حلقات آخر أسبوع' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'حفظ إعدادات القسم' })).toBeDisabled();
    showRender.unmount();

    const articleRender = renderPage(<ArticlesView />, MANAGE_PERMISSIONS);
    expect(screen.getByRole('link', { name: 'مقال جديد' })).toHaveAttribute(
      'href',
      '/articles/new',
    );
    expect(screen.queryByRole('link', { name: 'تنزيل سكيل المقالات' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'سكيل المقالات في محادثتك' }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'نشر' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    articleRender.unmount();

    renderPage(<SubscribersView />, MANAGE_PERMISSIONS);
    expect(screen.getAllByRole('button', { name: 'تفعيل بلس يدويًا' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'إعادة التفعيل يدويًا' })).toBeInTheDocument();
  });

  it('يحفظ إعدادات قسم حلقات آخر أسبوع برقم النسخة', async () => {
    const user = userEvent.setup();
    const update = vi.fn(async () => ({
      ...demoData.homepageWeeklyEpisodesSettings,
      enabled: false,
      title: 'حصاد مختلف',
      version: 2,
    }));
    renderPage(<ShowsView />, MANAGE_PERMISSIONS, {
      updateHomepageWeeklyEpisodesSettings: update,
    });

    const title = screen.getByRole('textbox', { name: 'عنوان القسم' });
    await user.clear(title);
    await user.type(title, 'حصاد مختلف');
    await user.click(screen.getByRole('switch', { name: 'عرض القسم في الصفحة الرئيسية' }));
    await user.click(screen.getByRole('button', { name: 'حفظ إعدادات القسم' }));

    expect(update).toHaveBeenCalledWith({
      enabled: false,
      title: 'حصاد مختلف',
      expectedVersion: 1,
    });
    expect(await screen.findByText('حُفظت إعدادات القسم.')).toHaveAttribute('role', 'status');
  });

  it('يوضح تعارض النسخة ويطلب المراجعة', async () => {
    const user = userEvent.setup();
    const update = vi.fn(async () => {
      throw new AdminRepositoryError({
        code: 'CONFLICT',
        operation: 'updateHomepageWeeklyEpisodesSettings',
        message: 'Homepage settings changed.',
        retryable: false,
      });
    });
    renderPage(<ShowsView />, MANAGE_PERMISSIONS, {
      updateHomepageWeeklyEpisodesSettings: update,
    });

    await user.click(screen.getByRole('switch', { name: 'عرض القسم في الصفحة الرئيسية' }));
    await user.click(screen.getByRole('button', { name: 'حفظ إعدادات القسم' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'تغيّرت إعدادات القسم في جلسة أخرى. راجعها وحاول مجددًا.',
    );
  });

  it('creates a show from its dedicated breadcrumb page, then returns to the list', async () => {
    const user = userEvent.setup();
    const createShow = vi.fn(async () => demoData.shows[0]!.id);
    renderContentCreator('/shows/new', { createShow });

    expect(screen.getByRole('heading', { name: 'برنامج جديد' })).toHaveFocus();
    const breadcrumb = screen.getByRole('navigation', { name: 'مسار الصفحة' });
    expect(within(breadcrumb).getByRole('link', { name: 'البرامج' })).toHaveAttribute(
      'href',
      '/shows',
    );
    expect(within(breadcrumb).getByText('برنامج جديد')).toHaveAttribute('aria-current', 'page');

    await user.type(screen.getByRole('textbox', { name: 'اسم البرنامج' }), ' خارج الإطار ');
    await user.type(
      screen.getByRole('textbox', { name: /^المعرّف في الرابط/ }),
      'outside-the-frame',
    );
    await user.type(screen.getByRole('textbox', { name: 'المضيف' }), ' نور الهدى ');
    await user.type(screen.getByRole('textbox', { name: 'التصنيف' }), ' ثقافة ');
    await user.type(
      screen.getByRole('textbox', { name: 'وصف البرنامج' }),
      ' حوارات تتجاوز المألوف. ',
    );
    await user.click(screen.getByRole('switch', { name: 'برنامج حصري' }));
    await user.click(screen.getByRole('button', { name: 'حفظ البرنامج' }));

    expect(createShow).toHaveBeenCalledWith({
      slug: 'outside-the-frame',
      name: 'خارج الإطار',
      description: 'حوارات تتجاوز المألوف.',
      host: 'نور الهدى',
      category: 'ثقافة',
      premium: true,
    });
    expect(await screen.findByTestId('location')).toHaveTextContent('/shows');
  });

  it('creates an article and newsletter draft from one canonical editor document', async () => {
    const user = userEvent.setup();
    const createArticle = vi.fn(async () => demoData.articles[0]!.id);
    renderContentCreator('/articles/new', { createArticle });

    expect(screen.getByRole('heading', { name: 'مقال ونشرة جديدان' })).toHaveFocus();
    const breadcrumb = screen.getByRole('navigation', { name: 'مسار الصفحة' });
    expect(within(breadcrumb).getByRole('link', { name: 'المقالات' })).toHaveAttribute(
      'href',
      '/articles',
    );
    expect(within(breadcrumb).getByText('مقال جديد')).toHaveAttribute('aria-current', 'page');

    await user.type(screen.getByRole('textbox', { name: 'عنوان المقال' }), ' مستقبل العمل ');
    await user.type(screen.getByRole('textbox', { name: /^المعرّف في الرابط/ }), 'future-of-work');
    await user.type(screen.getByRole('textbox', { name: 'محتوى المقال' }), 'نص المقال التجريبي.');
    await user.click(screen.getByRole('checkbox', { name: /إعداد نشرة لهذا المقال/ }));
    await user.type(screen.getByRole('textbox', { name: 'عنوان الرسالة' }), 'رسالة الأسبوع');
    await user.click(screen.getByRole('button', { name: 'حفظ المسودة' }));

    expect(createArticle).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'future-of-work',
        title: 'مستقبل العمل',
        author: { type: 'studio_member', studioMemberId: demoData.viewer.id },
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'نص المقال التجريبي.' }],
            },
          ],
        },
        newsletter: expect.objectContaining({ enabled: true, subject: 'رسالة الأسبوع' }),
      }),
    );
    expect(await screen.findByTestId('location')).toHaveTextContent('/articles/article_1');
  });

  it('links from overview only to permitted destinations', () => {
    const overviewOnly = renderPage(<OverviewView />, ['overview.view']);
    expect(screen.queryByRole('link', { name: 'كل الحلقات' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'اجتماعات بلا نهاية: من يقتل الإنتاجية؟' }),
    ).not.toBeInTheDocument();
    overviewOnly.unmount();

    const episodeViewer = renderPage(<OverviewView />, ['overview.view', 'episodes.view']);
    expect(screen.getByRole('link', { name: 'كل الحلقات' })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'اجتماعات بلا نهاية: من يقتل الإنتاجية؟' }),
    ).toHaveAttribute('href', '/episodes/episode_1');
    episodeViewer.unmount();

    renderPage(<OverviewView />, ['overview.view', 'episodes.view', 'episodes.manage']);
    expect(
      screen.getByRole('link', { name: 'اجتماعات بلا نهاية: من يقتل الإنتاجية؟' }),
    ).toBeInTheDocument();
  });

  it('keeps an existing episode readable while reserving editor controls for manage mode', () => {
    const readOnlyEditor = renderEpisodeEditor(['episodes.view']);
    expect(screen.getByRole('heading', { name: 'تفاصيل الحلقة' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'عنوان الحلقة' })).toHaveAttribute('readonly');
    expect(screen.queryByRole('button', { name: 'حفظ كمسودة' })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByText('تصفح الملفات')).not.toBeInTheDocument();
    readOnlyEditor.unmount();

    const managedEditor = renderEpisodeEditor(['episodes.view', 'episodes.manage']);
    expect(screen.getByRole('heading', { name: 'تحرير حلقة' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'حفظ كمسودة' })).toBeInTheDocument();
    expect(screen.getByRole('switch')).toBeInTheDocument();
    expect(screen.getByText('تصفح الملفات')).toBeInTheDocument();
    managedEditor.unmount();

    renderEpisodeEditor(['episodes.view'], '/episodes/new');
    expect(
      screen.getByText('لا تملك صلاحية إنشاء حلقة.').closest('[role="status"]'),
    ).not.toBeNull();
    expect(screen.queryByRole('textbox', { name: 'عنوان الحلقة' })).not.toBeInTheDocument();
  });

  it('labels the new-episode route as a breadcrumb step', () => {
    renderEpisodeEditor(['episodes.view', 'episodes.manage'], '/episodes/new');

    const breadcrumb = screen.getByRole('navigation', { name: 'مسار الصفحة' });
    expect(within(breadcrumb).getByRole('link', { name: 'الحلقات' })).toHaveAttribute(
      'href',
      '/episodes',
    );
    expect(within(breadcrumb).getByText('حلقة جديدة')).toHaveAttribute('aria-current', 'page');
  });
});
