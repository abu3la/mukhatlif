import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import {
  AdminAuthContext,
  StudioDataContext,
  type AdminAuthContextValue,
  type StudioDataContextValue,
} from '@/application';
import { AdminRepositoryError, type ArticleMediaAsset } from '@/data';
import { demoData, type Article, type PermissionId } from '@/lib';
import { AI_ARTICLE_SKILL_DOWNLOAD_URL, AI_ARTICLE_SKILL_FILENAME } from './article-ai-skill';
import { ArticleEditorRouteView, ArticleEditorView } from './article-editor-page';

const ARTICLE_PERMISSIONS: PermissionId[] = ['articles.view', 'articles.manage'];

function createAuthValue(): AdminAuthContextValue {
  return {
    status: 'authenticated',
    viewer: {
      ...demoData.viewer,
      role: 'editor',
      permissions: ARTICLE_PERMISSIONS,
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
  articles: Article[],
  overrides: Partial<StudioDataContextValue> = {},
): StudioDataContextValue {
  const firstArticle = articles[0] ?? demoData.articles[0]!;
  return {
    data: {
      asOf: demoData.asOf,
      shows: [],
      episodes: [],
      articles,
      homepageWeeklyEpisodesSettings: { ...demoData.homepageWeeklyEpisodesSettings },
      guestDirectory: null,
    },
    repositoryKind: 'fixture',
    capabilities: {
      'core-dashboard': true,
      'content-mutations': true,
      'subscription-mutations': true,
      'episode-audio-upload': true,
      'guest-management': true,
      'admin-analytics': true,
      'access-management': true,
    },
    isMutating: false,
    lastError: null,
    clearLastError: vi.fn(),
    createShow: vi.fn(async () => demoData.shows[0]!.id),
    updateHomepageWeeklyEpisodesSettings: vi.fn(
      async () => demoData.homepageWeeklyEpisodesSettings,
    ),
    createArticle: vi.fn(async () => firstArticle.id),
    updateArticle: vi.fn(async () => firstArticle),
    transitionEpisodeStatus: vi.fn(async () => undefined),
    saveEpisode: vi.fn(async () => demoData.episodes[0]!.id),
    uploadEpisodeAudio: vi.fn(async () => demoData.episodes[0]!.id),
    transitionArticleStatus: vi.fn(async () => firstArticle),
    getMailchimpCapability: vi.fn(async () => ({
      mode: 'simulation' as const,
      configured: true,
      fromName: 'مختلف',
      replyTo: 'hello@mukhtalif.local',
      audienceName: 'جمهور العرض المحلي',
      audienceCount: 24,
      recipientTag: 'nlpage',
      recipientCount: 24,
      audienceConfirmationToken: 'fixture-audience-confirmation-v1',
    })),
    previewArticleNewsletter: vi.fn(async () => ({
      subject: firstArticle.newsletter.subject ?? firstArticle.title,
      html: '<p>معاينة محلية</p>',
      text: 'معاينة محلية',
    })),
    syncArticleNewsletterCampaign: vi.fn(async () => ({
      article: firstArticle,
      operation: 'created' as const,
    })),
    sendArticleNewsletter: vi.fn(async () => ({
      article: firstArticle,
      operation: 'sent' as const,
    })),
    reconcileArticleNewsletter: vi.fn(async () => ({
      article: firstArticle,
      operation: 'sent' as const,
    })),
    listArticleMedia: vi.fn(async () => []),
    listArticleAuthors: vi.fn(async () => [
      {
        studioMemberId: demoData.viewer.id,
        displayName: demoData.viewer.name,
      },
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

function renderEditor(
  articles: Article[],
  overrides: Partial<StudioDataContextValue> = {},
  route = `/articles/${articles[0]!.id}`,
) {
  const studioValue = createStudioValue(articles, overrides);
  const authValue = createAuthValue();
  const renderTree = (value: StudioDataContextValue) => (
    <MemoryRouter initialEntries={[route]}>
      <AdminAuthContext.Provider value={authValue}>
        <StudioDataContext.Provider value={value}>
          <Routes>
            <Route path="/articles/:articleId" element={<ArticleEditorView />} />
          </Routes>
        </StudioDataContext.Provider>
      </AdminAuthContext.Provider>
    </MemoryRouter>
  );
  const result = render(renderTree(studioValue));
  return {
    ...result,
    studioValue,
    rerenderStudio(nextArticles: Article[], nextOverrides: Partial<StudioDataContextValue> = {}) {
      const nextValue = createStudioValue(nextArticles, { ...overrides, ...nextOverrides });
      result.rerender(renderTree(nextValue));
      return nextValue;
    },
  };
}

function renderNewEditor(overrides: Partial<StudioDataContextValue> = {}) {
  const studioValue = createStudioValue(structuredClone(demoData.articles), overrides);
  const authValue = createAuthValue();
  return {
    ...render(
      <MemoryRouter initialEntries={['/articles/new']}>
        <AdminAuthContext.Provider value={authValue}>
          <StudioDataContext.Provider value={studioValue}>
            <Routes>
              <Route path="/articles/new" element={<ArticleEditorView />} />
              <Route path="/articles/:articleId" element={<div>المقال محفوظ</div>} />
            </Routes>
          </StudioDataContext.Provider>
        </AdminAuthContext.Provider>
      </MemoryRouter>,
    ),
    studioValue,
  };
}

function stubImageDimensions(width = 1600, height = 900) {
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:cover'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  });

  class LoadedImage extends EventTarget {
    naturalWidth = width;
    naturalHeight = height;
    set src(_value: string) {
      queueMicrotask(() => this.dispatchEvent(new Event('load')));
    }
  }
  vi.stubGlobal('Image', LoadedImage);
}

function stubCoverCanvas() {
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage,
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
    callback(new Blob(['cropped-cover'], { type: 'image/png' }));
  });
  return drawImage;
}

function replaceClipboard(writeText: ReturnType<typeof vi.fn>): () => void {
  const previous = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  return () => {
    if (previous) Object.defineProperty(navigator, 'clipboard', previous);
    else Reflect.deleteProperty(navigator, 'clipboard');
  };
}

async function applyInitialCoverCrop(
  user: ReturnType<typeof userEvent.setup>,
  width = 1_600,
  height = 900,
) {
  const dialog = await screen.findByRole('dialog', { name: 'قص صورة الغلاف' });
  const cropImage = within(dialog).getByAltText('الصورة الأصلية لتحديد قص الغلاف');
  Object.defineProperties(cropImage, {
    naturalWidth: { configurable: true, value: width },
    naturalHeight: { configurable: true, value: height },
    width: { configurable: true, value: width / 2 },
    height: { configurable: true, value: height / 2 },
  });
  fireEvent.load(cropImage);
  const applyButton = within(dialog).getByRole('button', { name: 'اعتماد القص' });
  await waitFor(() => expect(applyButton).toBeEnabled());
  stubCoverCanvas();
  await user.click(applyButton);
  await waitFor(() => expect(dialog).not.toHaveAttribute('open'));
}

function RouteSwitcher() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate('/articles/article_2')}>
        فتح المقال الثاني
      </button>
      <Routes>
        <Route path="/articles/:articleId" element={<ArticleEditorRouteView />} />
      </Routes>
    </>
  );
}

describe('ArticleEditorView', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('marks the title and content as required and the summary as optional', () => {
    const { container } = renderEditor([structuredClone(demoData.articles[0]!)]);

    expect(screen.getByText('عنوان المقال (مطلوب)')).toBeVisible();
    expect(screen.getByText('ملخص المقال (اختياري)')).toBeVisible();
    expect(screen.getByText('محتوى المقال (مطلوب)')).toBeVisible();
    expect(screen.getByText('موضع اسم الكاتب (مطلوب)')).toBeVisible();
    expect(screen.getByText('يُطبّق على المقال والنشرة الأسبوعية.')).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'عنوان المقال' })).toBeRequired();
    expect(screen.getByRole('combobox', { name: /^موضع اسم الكاتب/ })).toBeRequired();
    expect(screen.getByRole('textbox', { name: 'محتوى المقال' })).toHaveAttribute(
      'aria-required',
      'true',
    );
    expect(container.querySelector('.article-web-preview__excerpt')).toBeInTheDocument();
  });

  it('does not invent an under-title summary when the optional summary is empty', () => {
    const article = {
      ...structuredClone(demoData.articles[0]!),
      excerpt: '',
    };
    const { container } = renderEditor([article]);

    expect(container.querySelector('.article-web-preview__excerpt')).not.toBeInTheDocument();
    expect(screen.getByText(/اتركه فارغًا إذا لم تحتج إليه/)).toBeVisible();
  });

  it('lets editors collapse supporting sections while keeping the article open', async () => {
    const user = userEvent.setup();
    renderEditor([structuredClone(demoData.articles[0]!)]);

    const sections = [
      ['صورة الغلاف', 'article-media-title-panel'],
      ['المعاينة', 'article-preview-title-panel'],
      ['إعدادات البحث', 'article-seo-title-panel'],
      ['النشرة الأسبوعية', 'newsletter-settings-title-panel'],
    ] as const;

    for (const [label, panelId] of sections) {
      const toggle = screen.getByRole('button', { name: `إغلاق قسم ${label}` });
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(toggle).toHaveAttribute('aria-controls', panelId);
      expect(toggle.textContent).toBe('');
      expect(toggle.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    }
    expect(screen.queryByRole('button', { name: /قسم المقال/ })).not.toBeInTheDocument();

    const seoToggle = screen.getByRole('button', { name: 'إغلاق قسم إعدادات البحث' });
    const seoPanel = document.getElementById('article-seo-title-panel');
    expect(seoPanel).not.toHaveAttribute('hidden');
    await user.click(seoToggle);
    expect(seoPanel).toHaveAttribute('hidden');
    expect(screen.getByRole('button', { name: 'فتح قسم إعدادات البحث' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );

    await user.click(screen.getByRole('button', { name: 'فتح قسم إعدادات البحث' }));
    expect(seoPanel).not.toHaveAttribute('hidden');
    expect(screen.getByRole('textbox', { name: 'عنوان نتائج البحث' })).toHaveValue(
      demoData.articles[0]!.seo.title,
    );
  });

  it('copies the AI template and imports its draft into the editable article without publishing', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => undefined);
    const restoreClipboard = replaceClipboard(writeText);
    const createArticle = vi.fn(async () => demoData.articles[0]!.id);
    const transitionArticleStatus = vi.fn(async () => demoData.articles[0]!);
    const syncArticleNewsletterCampaign = vi.fn(async () => ({
      article: demoData.articles[0]!,
      operation: 'created' as const,
    }));
    const sendArticleNewsletter = vi.fn(async () => ({
      article: demoData.articles[0]!,
      operation: 'sent' as const,
    }));
    renderNewEditor({
      createArticle,
      transitionArticleStatus,
      syncArticleNewsletterCampaign,
      sendArticleNewsletter,
    });

    expect(screen.getByRole('button', { name: 'إغلاق قسم مقال بمساعدة AI' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByRole('button', { name: 'نسخ القالب' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'سكيل المقالات في محادثتك' })).toBeVisible();
    expect(
      screen.getByText(/ويسألك سؤالًا واحدًا في كل مرة قبل تجهيز مسودة قابلة للاستيراد/),
    ).toBeVisible();
    const skillDownload = screen.getByRole('link', { name: 'تنزيل سكيل المقالات' });
    expect(skillDownload).toHaveAttribute('href', AI_ARTICLE_SKILL_DOWNLOAD_URL);
    expect(skillDownload).toHaveAttribute('download', AI_ARTICLE_SKILL_FILENAME);
    expect(
      screen.getByText('هذه الأدوات تنشئ مسودة فقط. لا تنشر المقال ولا ترسل بريدًا.'),
    ).toBeVisible();

    const installSummary = screen
      .getByRole('region', { name: 'سكيل المقالات في محادثتك' })
      .querySelector('summary');
    expect(installSummary).toHaveTextContent(/طريقة التثبيت على ChatGPT Desktop\s+و\s+Claude/);
    await user.click(installSummary!);
    expect(screen.getByText('Asking a question')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'نسخ القالب' }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('mukhtalif.article-ai/v1'));

    const payload = JSON.stringify({
      schema: 'mukhtalif.article-ai/v1',
      title: 'كيف نعد مقابلة أفضل',
      slug: 'prepare-a-better-interview',
      excerpt: 'مسودة عملية لتحضير مقابلة مفيدة.',
      seo: {
        title: 'تحضير مقابلة أفضل',
        description: 'خطوات عملية قبل إجراء المقابلة.',
      },
      blocks: [
        { type: 'paragraph', text: 'ابدأ بهدف واضح للمقابلة.' },
        { type: 'heading', level: 2, text: 'قبل التسجيل' },
        { type: 'bullets', items: ['راجع البحث', 'رتّب الأسئلة'] },
      ],
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'ناتج AI بصيغة JSON' }), {
      target: { value: payload },
    });
    await user.click(screen.getByRole('button', { name: 'استيراد إلى المسودة' }));

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'عنوان المقال' })).toHaveValue(
        'كيف نعد مقابلة أفضل',
      ),
    );
    expect(screen.getByRole('textbox', { name: /^المعرّف في الرابط/ })).toHaveValue(
      'prepare-a-better-interview',
    );
    expect(screen.getByRole('textbox', { name: 'ملخص المقال' })).toHaveValue(
      'مسودة عملية لتحضير مقابلة مفيدة.',
    );
    expect(screen.getByRole('textbox', { name: 'محتوى المقال' })).toHaveTextContent(
      'ابدأ بهدف واضح للمقابلة.',
    );
    expect(screen.getByText('أُضيفت المسودة. لم يُنشر المقال ولم يُرسل أي بريد.')).toBeVisible();
    expect(createArticle).not.toHaveBeenCalled();
    expect(transitionArticleStatus).not.toHaveBeenCalled();
    expect(syncArticleNewsletterCampaign).not.toHaveBeenCalled();
    expect(sendArticleNewsletter).not.toHaveBeenCalled();
    restoreClipboard();
  });

  it('keeps the Skill download on the new-article route only', async () => {
    const user = userEvent.setup();
    renderEditor([structuredClone(demoData.articles[0]!)]);

    await user.click(screen.getByRole('button', { name: 'فتح قسم مقال بمساعدة AI' }));
    expect(screen.queryByRole('link', { name: 'تنزيل سكيل المقالات' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'سكيل المقالات في محادثتك' }),
    ).not.toBeInTheDocument();
  });

  it('leaves the article unchanged when the AI result is not the approved contract', async () => {
    const user = userEvent.setup();
    const article = structuredClone(demoData.articles[0]!);
    renderEditor([article]);

    await user.click(screen.getByRole('button', { name: 'فتح قسم مقال بمساعدة AI' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'ناتج AI بصيغة JSON' }), {
      target: { value: JSON.stringify({ title: 'مقال غير موثوق', blocks: [] }) },
    });
    await user.click(screen.getByRole('button', { name: 'استيراد إلى المسودة' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('استخدم قالب مختلف الرسمي');
    expect(screen.getByRole('textbox', { name: 'عنوان المقال' })).toHaveValue(article.title);
    expect(screen.getByRole('textbox', { name: 'محتوى المقال' })).toHaveTextContent(article.body);
  });

  it('saves a custom author and shows the byline with automatic text direction', async () => {
    const user = userEvent.setup();
    const createArticle = vi.fn(
      async (_command: Parameters<StudioDataContextValue['createArticle']>[0]) =>
        demoData.articles[0]!.id,
    );
    const { container } = renderNewEditor({ createArticle });

    await user.selectOptions(screen.getByRole('combobox', { name: /^نوع الكاتب/ }), 'custom');
    await user.selectOptions(screen.getByRole('combobox', { name: /^موضع اسم الكاتب/ }), 'end');
    const authorName = screen.getByRole('textbox', { name: /^اسم الكاتب/ });
    expect(authorName).toHaveAttribute('dir', 'auto');
    await user.type(authorName, 'Jane Doe');
    await user.type(screen.getByRole('textbox', { name: 'عنوان المقال' }), 'مقال جديد');
    await user.type(screen.getByRole('textbox', { name: /^المعرّف في الرابط/ }), 'new-article');
    await user.type(screen.getByRole('textbox', { name: 'محتوى المقال' }), 'محتوى المقال.');

    const bylineName = container.querySelector('.article-web-preview__byline bdi');
    expect(bylineName).toHaveTextContent('Jane Doe');
    expect(bylineName).toHaveAttribute('dir', 'auto');
    await user.click(screen.getByRole('button', { name: 'حفظ المسودة' }));

    await waitFor(() => expect(createArticle).toHaveBeenCalledTimes(1));
    expect(createArticle).toHaveBeenCalledWith(
      expect.objectContaining({
        author: { type: 'custom', displayName: 'Jane Doe' },
        authorPlacement: 'end',
      }),
    );
  });

  it('moves the byline in both previews and persists the selected placement', async () => {
    const user = userEvent.setup();
    const article = structuredClone(demoData.articles[0]!);
    const updateArticle = vi.fn(async (_id, command) => ({
      ...article,
      authorPlacement: command.authorPlacement ?? article.authorPlacement,
      version: article.version + 1,
    }));
    const { container } = renderEditor([article], { updateArticle });
    const placement = screen.getByRole('combobox', {
      name: /^موضع اسم الكاتب/,
    });

    expect(placement).toHaveValue('after_title');
    const initialWebPreview = container.querySelector('.article-web-preview')!;
    expect(
      [...initialWebPreview.children].indexOf(
        initialWebPreview.querySelector('.article-web-preview__byline')!,
      ),
    ).toBeLessThan(
      [...initialWebPreview.children].indexOf(
        initialWebPreview.querySelector('.article-rendered-content')!,
      ),
    );

    await user.selectOptions(placement, 'end');
    const endWebPreview = container.querySelector('.article-web-preview')!;
    expect(
      [...endWebPreview.children].indexOf(
        endWebPreview.querySelector('.article-web-preview__byline')!,
      ),
    ).toBeGreaterThan(
      [...endWebPreview.children].indexOf(
        endWebPreview.querySelector('.article-rendered-content')!,
      ),
    );

    await user.click(screen.getByRole('button', { name: 'النشرة الأسبوعية' }));
    const newsletterPreview = container.querySelector('.article-newsletter-preview')!;
    const newsletterMessage = newsletterPreview.querySelector(
      '.article-newsletter-preview__message',
    )!;
    expect(newsletterMessage.parentElement).toBe(newsletterPreview);
    expect(
      [...newsletterMessage.children].indexOf(
        newsletterMessage.querySelector('.article-web-preview__byline')!,
      ),
    ).toBeGreaterThan(
      [...newsletterMessage.children].indexOf(
        newsletterMessage.querySelector('.article-rendered-content')!,
      ),
    );

    await user.click(screen.getByRole('button', { name: 'حفظ المسودة' }));
    await waitFor(() => expect(updateArticle).toHaveBeenCalledTimes(1));
    expect(updateArticle).toHaveBeenCalledWith(
      article.id,
      expect.objectContaining({ authorPlacement: 'end' }),
    );
    expect(updateArticle.mock.calls[0]?.[1]).not.toHaveProperty('author');
  });

  it('sends only the selected Studio member id for a team author', async () => {
    const user = userEvent.setup();
    const createArticle = vi.fn(
      async (_command: Parameters<StudioDataContextValue['createArticle']>[0]) =>
        demoData.articles[0]!.id,
    );
    const listArticleAuthors = vi.fn(async () => [
      { studioMemberId: 'member-editor', displayName: 'نورة الشمري' },
      { studioMemberId: 'member-producer', displayName: 'ريم الحربي' },
    ]);
    renderNewEditor({ createArticle, listArticleAuthors });

    const memberSelect = await screen.findByRole('combobox', { name: /^عضو الفريق/ });
    await waitFor(() => expect(memberSelect).toBeEnabled());
    expect(screen.getByText(/وليسوا من المشتركين أو المستمعين/)).toBeVisible();
    await user.selectOptions(memberSelect, 'member-producer');
    await user.type(screen.getByRole('textbox', { name: 'عنوان المقال' }), 'مقال الفريق');
    await user.type(screen.getByRole('textbox', { name: /^المعرّف في الرابط/ }), 'team-article');
    await user.type(screen.getByRole('textbox', { name: 'محتوى المقال' }), 'محتوى من الفريق.');
    await user.click(screen.getByRole('button', { name: 'حفظ المسودة' }));

    await waitFor(() => expect(createArticle).toHaveBeenCalledTimes(1));
    expect(createArticle).toHaveBeenCalledWith(
      expect.objectContaining({
        author: { type: 'studio_member', studioMemberId: 'member-producer' },
      }),
    );
    expect(createArticle.mock.calls[0]?.[0].author).not.toHaveProperty('displayName');
  });

  it('keeps a snapshotted Studio author available when the member is absent from the latest list', async () => {
    const article: Article = {
      ...structuredClone(demoData.articles[0]!),
      author: {
        type: 'studio_member',
        studioMemberId: 'member-former',
        displayName: 'كاتب من الأرشيف',
      },
    };
    renderEditor([article], {
      listArticleAuthors: vi.fn(async () => [
        { studioMemberId: 'member-current', displayName: 'كاتب حالي' },
      ]),
    });

    const memberSelect = await screen.findByRole('combobox', { name: /^عضو الفريق/ });
    expect(memberSelect).toHaveValue('member-former');
    expect(
      within(memberSelect).getByRole('option', { name: 'كاتب من الأرشيف' }),
    ).toBeInTheDocument();
  });

  it('preserves the stored author snapshot on an unrelated article update', async () => {
    const user = userEvent.setup();
    const article: Article = {
      ...structuredClone(demoData.articles[0]!),
      author: {
        type: 'studio_member',
        studioMemberId: demoData.viewer.id,
        displayName: 'الاسم المحفوظ',
      },
    };
    const updateArticle = vi.fn(
      async (
        _id: Article['id'],
        command: Parameters<StudioDataContextValue['updateArticle']>[1],
      ) => ({
        ...article,
        title: command.title ?? article.title,
        version: article.version + 1,
      }),
    );
    const { container } = renderEditor([article], {
      updateArticle,
      listArticleAuthors: vi.fn(async () => [
        {
          studioMemberId: demoData.viewer.id,
          displayName: 'الاسم الحالي في الدليل',
        },
      ]),
    });

    await screen.findByRole('option', { name: 'الاسم الحالي في الدليل' });
    expect(container.querySelector('.article-web-preview__byline bdi')).toHaveTextContent(
      'الاسم المحفوظ',
    );

    await user.type(screen.getByRole('textbox', { name: 'عنوان المقال' }), ' محدّث');
    await user.click(screen.getByRole('button', { name: 'حفظ المسودة' }));

    await waitFor(() => expect(updateArticle).toHaveBeenCalledTimes(1));
    expect(updateArticle.mock.calls[0]?.[1]).not.toHaveProperty('author');
    expect(container.querySelector('.article-web-preview__byline bdi')).toHaveTextContent(
      'الاسم المحفوظ',
    );
  });

  it('keeps custom attribution available when the Studio author list cannot load', async () => {
    const user = userEvent.setup();
    renderNewEditor({
      listArticleAuthors: vi.fn(async () => {
        throw new Error('Unavailable');
      }),
    });

    expect(
      await screen.findByText(
        'تعذّر تحميل أعضاء فريق الاستوديو. اختر كاتبًا آخر وأدخل اسمه، أو أعد تحميل الصفحة.',
      ),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'اختيار كاتب آخر' }));
    expect(screen.getByRole('textbox', { name: /^اسم الكاتب/ })).toBeEnabled();
    expect(screen.queryByText(/تعذّر تحميل أعضاء فريق الاستوديو/)).not.toBeInTheDocument();
  });

  it('shows a clear loading state without blocking the custom-author choice', async () => {
    const user = userEvent.setup();
    renderNewEditor({
      listArticleAuthors: vi.fn(() => new Promise<never>(() => undefined)),
    });

    const memberSelect = screen.getByRole('combobox', { name: /^عضو الفريق/ });
    expect(memberSelect).toBeDisabled();
    expect(
      within(memberSelect).getByRole('option', { name: 'جارٍ تحميل أعضاء الفريق…' }),
    ).toBeVisible();
    const loadingStatus = screen.getByText('جارٍ تحميل أعضاء فريق الاستوديو…');
    expect(loadingStatus.parentElement).toHaveAttribute('role', 'status');

    await user.selectOptions(screen.getByRole('combobox', { name: /^نوع الكاتب/ }), 'custom');
    expect(screen.getByRole('textbox', { name: /^اسم الكاتب/ })).toBeEnabled();
  });

  it('offers a direct custom-author path when the Studio author directory is empty', async () => {
    const user = userEvent.setup();
    renderNewEditor({ listArticleAuthors: vi.fn(async () => []) });

    const emptyMessage = await screen.findByText(
      'لا يوجد أعضاء متاحون للاختيار. اختر كاتبًا آخر وأدخل اسمه.',
    );
    expect(emptyMessage.parentElement).toHaveAttribute('role', 'status');

    await user.click(screen.getByRole('button', { name: 'اختيار كاتب آخر' }));
    expect(screen.getByRole('combobox', { name: /^نوع الكاتب/ })).toHaveValue('custom');
    expect(screen.getByRole('textbox', { name: /^اسم الكاتب/ })).toBeEnabled();
  });

  it('shows a recoverable error next to an empty required content editor', async () => {
    const user = userEvent.setup();
    const createArticle = vi.fn();
    renderNewEditor({ createArticle });

    await user.type(screen.getByRole('textbox', { name: 'عنوان المقال' }), 'مقال بلا محتوى');
    await user.type(screen.getByRole('textbox', { name: /^المعرّف في الرابط/ }), 'empty-content');
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /^عضو الفريق/ })).toBeEnabled(),
    );
    await user.click(screen.getByRole('button', { name: 'حفظ المسودة' }));

    expect(screen.getByText('أضف نصًا أو صورة أو فيديو إلى محتوى المقال.')).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'محتوى المقال' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(createArticle).not.toHaveBeenCalled();
  });

  it('accepts an image block as required article content without body text', async () => {
    const user = userEvent.setup();
    const article: Article = {
      ...structuredClone(demoData.articles[0]!),
      content: {
        type: 'doc',
        content: [
          {
            type: 'imageBlock',
            attrs: {
              mediaId: 'med-00000000000000000000000000000001',
              alt: 'صورة توضيحية',
              presentation: 'content',
              alignment: 'center',
              radius: 'none',
            },
          },
        ],
      },
      contentHtml: '<figure><img alt="صورة توضيحية"></figure>',
      body: '',
    };
    const updateArticle = vi.fn(async () => ({ ...article, version: article.version + 1 }));
    renderEditor([article], { updateArticle });

    await user.type(screen.getByRole('textbox', { name: 'عنوان المقال' }), ' محدّث');
    await user.click(screen.getByRole('button', { name: 'حفظ المسودة' }));

    await waitFor(() => expect(updateArticle).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByText(/أضف نصًا أو صورة أو فيديو إلى محتوى المقال/),
    ).not.toBeInTheDocument();
  });

  it('requires alternative text before enabling a cover upload', async () => {
    stubImageDimensions();
    const user = userEvent.setup();
    const article: Article = {
      ...structuredClone(demoData.articles[0]!),
      coverUrl: undefined,
      coverAlt: undefined,
    };
    const uploadArticleImage = vi.fn();
    renderEditor([article], { uploadArticleImage });

    expect(screen.getByText(/غلاف لا يقل عن 1200 × 675 بكسل/)).toBeVisible();
    expect(screen.getByText(/نوصي بـ\s*1600 × 900/)).toBeVisible();

    await user.upload(
      screen.getByLabelText('ملف صورة الغلاف'),
      new File(['cover'], 'cover.png', { type: 'image/png' }),
    );
    await applyInitialCoverCrop(user);

    const uploadButton = await screen.findByRole('button', { name: 'رفع صورة الغلاف' });
    expect(uploadButton).toBeDisabled();
    expect(uploadButton).toHaveClass('button--primary');
    const coverPreview = await screen.findByAltText('معاينة صورة الغلاف قبل الرفع');
    const alternativeTextInput = screen.getByRole('textbox', { name: /^الوصف البديل/ });
    expect(coverPreview).toHaveAttribute('src', 'blob:cover');
    expect(
      coverPreview.compareDocumentPosition(alternativeTextInput) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    const validStatus = screen.getByText(/صورة مطابقة لمتطلبات الغلاف/);
    expect(validStatus).toHaveAttribute('role', 'status');
    expect(validStatus).toHaveTextContent('1,600 × 900');
    expect(screen.queryByText('أضف وصفًا بديلًا لتتمكن من رفع الغلاف.')).not.toBeInTheDocument();
    expect(screen.queryByText(/الغلاف جاهز/)).not.toBeInTheDocument();
    expect(uploadArticleImage).not.toHaveBeenCalled();

    await user.type(alternativeTextInput, 'صورة غلاف المقال');
    expect(uploadButton).toBeEnabled();
  });

  it.each([
    ['أضيق من الحد الأدنى', 1_199, 675, 'أبعاد الصورة 1199 × 675 بكسل'],
    ['أقصر من الحد الأدنى', 1_200, 674, 'أبعاد الصورة 1200 × 674 بكسل'],
  ])('rejects a %s cover before upload', async (_case, width, height, message) => {
    stubImageDimensions(width, height);
    const user = userEvent.setup();
    const uploadArticleImage = vi.fn();
    renderNewEditor({ uploadArticleImage });

    await user.upload(
      screen.getByLabelText('ملف صورة الغلاف'),
      new File(['cover'], 'invalid-cover.png', { type: 'image/png' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByRole('button', { name: 'رفع صورة الغلاف' })).not.toBeInTheDocument();
    expect(uploadArticleImage).not.toHaveBeenCalled();
  });

  it.each([
    ['الطولية', 1_200, 1_600],
    ['المربعة', 1_200, 1_200],
    ['الأفقية ذات النسبة المختلفة', 1_200, 800],
  ])(
    'opens the cropper for a %s source and produces a 16:9 cover',
    async (_case, width, height) => {
      stubImageDimensions(width, height);
      const user = userEvent.setup();
      renderNewEditor();

      await user.upload(
        screen.getByLabelText('ملف صورة الغلاف'),
        new File(['cover'], 'crop-source.png', { type: 'image/png' }),
      );
      await applyInitialCoverCrop(user, width, height);

      expect(screen.getByText(/صورة مطابقة لمتطلبات الغلاف/)).toHaveTextContent('1,200 × 675');
      expect(screen.getByRole('button', { name: 'رفع صورة الغلاف' })).toBeDisabled();
    },
  );

  it('keeps the previous crop when Escape closes a replacement and returns focus', async () => {
    stubImageDimensions();
    const user = userEvent.setup();
    renderNewEditor();
    const input = screen.getByLabelText('ملف صورة الغلاف');
    const picker = screen.getByRole('button', { name: 'اختيار صورة غلاف' });

    await user.upload(input, new File(['first'], 'first.png', { type: 'image/png' }));
    await applyInitialCoverCrop(user);
    expect(screen.getByText('first-cover.png')).toBeVisible();

    await user.upload(input, new File(['second'], 'second.png', { type: 'image/png' }));
    const dialog = await screen.findByRole('dialog', { name: 'قص صورة الغلاف' });
    fireEvent.keyDown(dialog, { key: 'Escape' });

    await waitFor(() => expect(dialog).not.toHaveAttribute('open'));
    expect(screen.getByText('first-cover.png')).toBeVisible();
    expect(screen.queryByText('second-cover.png')).not.toBeInTheDocument();
    await waitFor(() => expect(picker).toHaveFocus());
  });

  it('shows a recoverable cover-file error before calling the repository', async () => {
    const user = userEvent.setup();
    const article: Article = {
      ...structuredClone(demoData.articles[0]!),
      coverUrl: undefined,
      coverAlt: undefined,
    };
    const uploadArticleImage = vi.fn();
    renderEditor([article], { uploadArticleImage });

    await user.upload(
      screen.getByLabelText('ملف صورة الغلاف'),
      new File([], 'empty.png', { type: 'image/png' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('ملف الصورة فارغ.');
    expect(uploadArticleImage).not.toHaveBeenCalled();
  });

  it('uploads a fixture cover, previews it, and saves its trusted data URL', async () => {
    stubImageDimensions();
    const user = userEvent.setup();
    const coverAlt = 'ميكروفون مختلف في غرفة التسجيل';
    const uploaded: ArticleMediaAsset = {
      id: 'med-00000000000000000000000000000009',
      kind: 'image',
      mimeType: 'image/png',
      fileName: 'weekly-cover.png',
      byteSize: 5,
      width: 1600,
      height: 900,
      defaultAlt: coverAlt,
      status: 'ready',
      publicUrl: 'data:image/png;base64,Q09WRVI=',
      createdAt: '2026-08-17T12:00:00.000Z',
    };
    let resolveUpload: ((asset: ArticleMediaAsset) => void) | undefined;
    const uploadArticleImage = vi.fn(
      (command) =>
        new Promise<ArticleMediaAsset>((resolve) => {
          command.onProgress?.(42);
          resolveUpload = resolve;
        }),
    );
    const createArticle = vi.fn(async () => demoData.articles[0]!.id);
    const { container } = renderNewEditor({ uploadArticleImage, createArticle });

    await user.type(screen.getByRole('textbox', { name: 'عنوان المقال' }), 'غلاف الأسبوع');
    await user.type(screen.getByRole('textbox', { name: /^المعرّف في الرابط/ }), 'weekly-cover');
    await user.type(screen.getByRole('textbox', { name: 'محتوى المقال' }), 'محتوى تجريبي للغلاف.');
    await user.type(screen.getByRole('textbox', { name: /^الوصف البديل/ }), coverAlt);
    const originalCoverFile = new File(['cover'], 'weekly-cover.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('ملف صورة الغلاف'), originalCoverFile);
    await applyInitialCoverCrop(user);
    await user.click(await screen.findByRole('button', { name: 'رفع صورة الغلاف' }));

    expect(await screen.findByRole('progressbar', { name: 'تقدم رفع الغلاف' })).toHaveValue(42);
    expect(screen.getByRole('button', { name: 'حفظ المسودة' })).toBeDisabled();
    await act(async () => resolveUpload?.(uploaded));
    await waitFor(() =>
      expect(
        screen.queryByRole('progressbar', { name: 'تقدم رفع الغلاف' }),
      ).not.toBeInTheDocument(),
    );

    expect(uploadArticleImage).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: 'weekly-cover-cover.png',
        mimeType: 'image/png',
        width: 1600,
        height: 900,
        alt: coverAlt,
      }),
    );
    expect(uploadArticleImage.mock.calls[0]?.[0].body).not.toBe(originalCoverFile);
    const coverPreviews = screen.getAllByAltText(coverAlt);
    expect(coverPreviews).toHaveLength(2);
    expect(
      coverPreviews.filter((image) => image.classList.contains('article-web-preview__cover')),
    ).toHaveLength(1);
    expect(screen.getByText('رُفعت صورة الغلاف وأضيفت إلى المقال.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'النشرة الأسبوعية' }));
    expect(container.querySelector('.article-newsletter-preview__cover')).toHaveAttribute(
      'src',
      uploaded.publicUrl,
    );
    await user.click(screen.getByText('استخدام رابط خارجي بدل الرفع'));
    expect(screen.getByText(/راجع المعاينة، فالأبعاد لا تُفحص تلقائيًا/)).toBeVisible();
    expect(screen.getByRole('textbox', { name: /^رابط صورة الغلاف/ })).toHaveValue(
      uploaded.publicUrl,
    );
    expect(screen.getByRole('textbox', { name: /^رابط صورة الغلاف/ })).toHaveAttribute(
      'inputmode',
      'url',
    );

    await user.click(screen.getByRole('button', { name: 'حفظ المسودة' }));
    await waitFor(() => expect(createArticle).toHaveBeenCalledTimes(1));
    expect(createArticle).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'غلاف الأسبوع',
        slug: 'weekly-cover',
        coverUrl: uploaded.publicUrl,
        coverAlt,
      }),
    );
  });

  it('does not create a needless article revision when saving or syncing a clean article', async () => {
    const user = userEvent.setup();
    const article = structuredClone(demoData.articles[0]!);
    const updateArticle = vi.fn(async () => article);
    const syncArticleNewsletterCampaign = vi.fn(async () => ({
      article: {
        ...article,
        newsletter: {
          ...article.newsletter,
          status: 'campaign_created' as const,
          campaignId: 'fixture-clean-sync',
          syncedVersion: article.version,
          needsSync: false,
        },
      },
      operation: 'created' as const,
    }));
    renderEditor([article], { updateArticle, syncArticleNewsletterCampaign });

    await user.click(screen.getByRole('button', { name: 'حفظ المسودة' }));
    expect(updateArticle).not.toHaveBeenCalled();

    const syncButton = screen.getByRole('button', { name: 'إنشاء مسودة Mailchimp' });
    await waitFor(() => expect(syncButton).toBeEnabled());
    await user.click(syncButton);

    expect(syncArticleNewsletterCampaign).toHaveBeenCalledWith(article.id, article.version);
    expect(updateArticle).not.toHaveBeenCalled();
  });

  it('exports the exact server preview manually without creating a Mailchimp campaign', async () => {
    const user = userEvent.setup();
    const html = '<p>قالب الخادم النهائي</p>';
    const text = 'قالب الخادم النهائي';
    const previewArticleNewsletter = vi.fn(async () => ({
      subject: 'عنوان النشرة',
      html,
      text,
    }));
    const syncArticleNewsletterCampaign = vi.fn(async () => ({
      article: demoData.articles[0]!,
      operation: 'created' as const,
    }));
    const sendArticleNewsletter = vi.fn(async () => ({
      article: demoData.articles[0]!,
      operation: 'sent' as const,
    }));
    const writeText = vi.fn(async () => undefined);
    const restoreClipboard = replaceClipboard(writeText);

    renderEditor([structuredClone(demoData.articles[0]!)], {
      previewArticleNewsletter,
      syncArticleNewsletterCampaign,
      sendArticleNewsletter,
    });

    await user.click(screen.getByRole('button', { name: 'النشرة الأسبوعية' }));
    expect(screen.queryByRole('button', { name: 'نسخ HTML' })).not.toBeInTheDocument();

    const exportTrigger = screen.getByRole('button', { name: 'تصدير البريد للإرسال' });
    expect(exportTrigger).toHaveClass('button--primary');
    expect(exportTrigger).toHaveAttribute('aria-haspopup', 'menu');
    await user.click(exportTrigger);
    await waitFor(() => expect(previewArticleNewsletter).toHaveBeenCalledTimes(1));
    expect(screen.getByTitle('معاينة قالب النشرة')).toBeInTheDocument();
    expect(screen.getByRole('menu', { name: 'خيارات تصدير البريد' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: /تنزيل ملف HTML/ })).toBeEnabled();
    expect(screen.getByRole('menuitem', { name: /نسخ النص/ })).toBeEnabled();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu', { name: 'خيارات تصدير البريد' })).not.toBeInTheDocument();
    expect(exportTrigger).toHaveFocus();

    await user.click(exportTrigger);
    await user.click(screen.getByRole('menuitem', { name: /نسخ HTML/ }));

    expect(writeText).toHaveBeenCalledWith(html);
    expect(screen.getByText('نُسخ HTML للنشرة. الصقه يدويًا في محرر Mailchimp.')).toBeVisible();
    expect(syncArticleNewsletterCampaign).not.toHaveBeenCalled();
    expect(sendArticleNewsletter).not.toHaveBeenCalled();
    restoreClipboard();
  });

  it('rechecks Mailchimp safely without creating a campaign or sending a message', async () => {
    const user = userEvent.setup();
    const getMailchimpCapability = vi
      .fn()
      .mockRejectedValueOnce(new Error('Mailchimp is temporarily unavailable.'))
      .mockResolvedValueOnce({
        mode: 'live' as const,
        configured: true,
        fromName: 'مختلف',
        replyTo: 'newsletter@mukhtalif.net',
        audienceName: 'نشرة مختلف',
        audienceCount: 436,
        recipientTag: 'nlpage',
        recipientCount: 389,
        audienceConfirmationToken: 'verified-audience-v2',
      });
    const syncArticleNewsletterCampaign = vi.fn(async () => ({
      article: demoData.articles[0]!,
      operation: 'created' as const,
    }));
    const sendArticleNewsletter = vi.fn(async () => ({
      article: demoData.articles[0]!,
      operation: 'sent' as const,
    }));

    renderEditor([structuredClone(demoData.articles[0]!)], {
      getMailchimpCapability,
      syncArticleNewsletterCampaign,
      sendArticleNewsletter,
    });

    expect(await screen.findByText('تعذّر التحقق من إعداد Mailchimp. أعد المحاولة.')).toBeVisible();
    expect(
      screen.getByText(
        'يقرأ حالة الحساب والجمهور وشريحة الإرسال فقط، ولا ينشئ حملة أو يرسل رسالة.',
      ),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'إعادة التحقق' }));

    await waitFor(() => expect(getMailchimpCapability).toHaveBeenCalledTimes(2));
    const capabilitySummary = (await screen.findByText(/إعداد Mailchimp محفوظ باسم مختلف/)).closest(
      '.article-mailchimp-state',
    );
    expect(capabilitySummary).toHaveTextContent('الجمهور: نشرة مختلف. إجمالي أعضاء الجمهور: 436.');
    expect(capabilitySummary).toHaveTextContent('شريحة الإرسال: nlpage. المستلمون المؤهلون: 389.');
    expect(syncArticleNewsletterCampaign).not.toHaveBeenCalled();
    expect(sendArticleNewsletter).not.toHaveBeenCalled();
  });

  it('does not offer campaign sync until the configured Mailchimp target is verified', async () => {
    const syncArticleNewsletterCampaign = vi.fn(async () => ({
      article: demoData.articles[0]!,
      operation: 'created' as const,
    }));

    renderEditor([structuredClone(demoData.articles[0]!)], {
      getMailchimpCapability: vi.fn(async () => ({
        mode: 'live' as const,
        configured: true,
      })),
      syncArticleNewsletterCampaign,
    });

    expect(
      await screen.findByText('تعذّر التحقق من الحساب والجمهور. الإرسال معطّل حتى يتاح الاتصال.'),
    ).toBeVisible();
    const syncButton = screen.getByRole('button', { name: 'إنشاء مسودة Mailchimp' });
    expect(syncButton).toBeDisabled();
    expect(syncArticleNewsletterCampaign).not.toHaveBeenCalled();
  });

  it('keeps the native send dialog closed until requested and restores focus after Escape', async () => {
    const user = userEvent.setup();
    const article: Article = {
      ...structuredClone(demoData.articles[0]!),
      newsletter: {
        ...demoData.articles[0]!.newsletter,
        status: 'campaign_created',
        campaignId: 'fixture-ready',
        syncedVersion: demoData.articles[0]!.version,
        needsSync: false,
      },
    };
    const sendArticleNewsletter = vi.fn(async () => ({
      article: {
        ...article,
        newsletter: { ...article.newsletter, status: 'sending' as const },
      },
      operation: 'accepted' as const,
    }));
    const rendered = renderEditor([article], { sendArticleNewsletter });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const sendButton = screen.getByRole('button', { name: 'إرسال النشرة' });
    await waitFor(() => expect(sendButton).toBeEnabled());
    await user.click(sendButton);

    const dialog = screen.getByRole('dialog', { name: 'إرسال النشرة؟' });
    expect(dialog).toHaveAttribute('open');
    expect(within(dialog).getAllByText(/جمهور العرض المحلي/)).not.toHaveLength(0);
    expect(within(dialog).getByText(/المستلمون المؤهلون: 24/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تأكيد الإرسال' })).toHaveFocus();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(sendButton).toHaveFocus();

    await user.click(sendButton);
    rendered.rerenderStudio(
      [
        {
          ...article,
          version: article.version + 1,
          newsletter: {
            ...article.newsletter,
            campaignId: 'fixture-replaced-after-confirmation',
            syncedVersion: article.version + 1,
          },
        },
      ],
      { sendArticleNewsletter },
    );
    await user.click(screen.getByRole('button', { name: 'تأكيد الإرسال' }));
    expect(sendArticleNewsletter).toHaveBeenCalledWith(
      article.id,
      'fixture-audience-confirmation-v1',
      article.version,
      'fixture-ready',
    );
    expect(await screen.findByText(/محاكاة الإرسال محليًا/)).toBeInTheDocument();
  });

  it('fails closed when refreshed article data is newer than the local editor revision', async () => {
    const article: Article = {
      ...structuredClone(demoData.articles[0]!),
      newsletter: {
        ...demoData.articles[0]!.newsletter,
        status: 'campaign_created',
        campaignId: 'fixture-ready',
        syncedVersion: demoData.articles[0]!.version,
        needsSync: false,
      },
    };
    const rendered = renderEditor([article]);
    const sendButton = screen.getByRole('button', { name: 'إرسال النشرة' });
    await waitFor(() => expect(sendButton).toBeEnabled());

    rendered.rerenderStudio([
      {
        ...article,
        version: article.version + 1,
        newsletter: {
          ...article.newsletter,
          syncedVersion: article.version + 1,
        },
      },
    ]);

    await waitFor(() => expect(sendButton).toBeDisabled());
    expect(screen.getByRole('button', { name: 'تحديث مسودة Mailchimp' })).toBeDisabled();
    expect(screen.getByText(/تغيّر المقال في جلسة أخرى/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not invite a retry when campaign synchronization has an ambiguous result', async () => {
    const user = userEvent.setup();
    const article = structuredClone(demoData.articles[0]!);
    const syncArticleNewsletterCampaign = vi.fn(async () => {
      throw new AdminRepositoryError({
        code: 'REMOTE_UNAVAILABLE',
        operation: 'syncArticleNewsletterCampaign',
        message: 'Ambiguous campaign result.',
        retryable: false,
        context: { remoteCode: 'NEWSLETTER_SYNC_STATE_UNKNOWN' },
      });
    });
    renderEditor([article], { syncArticleNewsletterCampaign });
    const syncButton = screen.getByRole('button', { name: 'إنشاء مسودة Mailchimp' });
    await waitFor(() => expect(syncButton).toBeEnabled());
    await user.click(syncButton);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('لا تُنشئ مسودة أخرى');
    expect(alert).not.toHaveTextContent('حاول مرة أخرى');
  });

  it.each([
    [
      'NEWSLETTER_SEND_STATE_UNKNOWN',
      'حالة الإرسال غير مؤكدة. لا ترسل النشرة مجددًا. استخدم التحقق من حالة الإرسال.',
    ],
    [
      'NEWSLETTER_CONFIRMATION_STALE',
      'تغيّرت نسخة المقال أو مسودة Mailchimp بعد فتح التأكيد. حدّث الصفحة وراجع آخر حالة قبل المحاولة.',
    ],
  ] as const)('shows safe recovery copy for %s', async (remoteCode, expectedMessage) => {
    const user = userEvent.setup();
    const article: Article = {
      ...structuredClone(demoData.articles[0]!),
      newsletter: {
        ...demoData.articles[0]!.newsletter,
        status: 'campaign_created',
        campaignId: 'fixture-ready',
        syncedVersion: demoData.articles[0]!.version,
        needsSync: false,
      },
    };
    const sendArticleNewsletter = vi.fn(async () => {
      throw new AdminRepositoryError({
        code: 'REMOTE_UNAVAILABLE',
        operation: 'sendArticleNewsletter',
        message: 'Unsafe send result.',
        retryable: false,
        context: { remoteCode },
      });
    });
    renderEditor([article], { sendArticleNewsletter });
    const sendButton = screen.getByRole('button', { name: 'إرسال النشرة' });
    await waitFor(() => expect(sendButton).toBeEnabled());
    await user.click(sendButton);
    await user.click(screen.getByRole('button', { name: 'تأكيد الإرسال' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(expectedMessage);
    expect(alert).not.toHaveTextContent('حاول مرة أخرى');
  });

  it('omits immutable newsletter fields while saving web changes after sending', async () => {
    const user = userEvent.setup();
    const article = structuredClone(demoData.articles[2]!);
    const updateArticle = vi.fn(async (_id, command) => ({
      ...article,
      title: command.title ?? article.title,
      authorPlacement: command.authorPlacement ?? article.authorPlacement,
      version: article.version + 1,
    }));
    renderEditor([article], { updateArticle });

    const title = screen.getByRole('textbox', { name: 'عنوان المقال' });
    await user.clear(title);
    await user.type(title, 'قائمة قراءة محدّثة');
    await user.selectOptions(screen.getByRole('combobox', { name: /^موضع اسم الكاتب/ }), 'end');
    await user.click(screen.getByRole('button', { name: 'حفظ المسودة' }));

    expect(updateArticle).toHaveBeenCalledWith(
      article.id,
      expect.not.objectContaining({ newsletter: expect.anything() }),
    );
    expect(updateArticle.mock.calls[0]?.[1]).toMatchObject({ authorPlacement: 'end' });
  });

  it('locks unresolved newsletter fields while keeping web edits savable', async () => {
    const user = userEvent.setup();
    const article: Article = {
      ...structuredClone(demoData.articles[0]!),
      newsletter: {
        ...demoData.articles[0]!.newsletter,
        status: 'sync_unknown',
        campaignId: 'fixture-unknown',
        needsSync: true,
      },
    };
    const updateArticle = vi.fn(async (_id, command) => ({
      ...article,
      title: command.title ?? article.title,
      authorPlacement: command.authorPlacement ?? article.authorPlacement,
      version: article.version + 1,
    }));
    renderEditor([article], { updateArticle });

    expect(screen.getByRole('textbox', { name: 'عنوان الرسالة' })).toBeDisabled();
    expect(screen.getByText(/راجع الحملة في Mailchimp قبل أي محاولة أخرى/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تحديث مسودة Mailchimp' })).toBeDisabled();
    const title = screen.getByRole('textbox', { name: 'عنوان المقال' });
    await user.clear(title);
    await user.type(title, 'دليل الضيف المحدّث');
    await user.click(screen.getByRole('button', { name: 'حفظ المسودة' }));

    expect(updateArticle).toHaveBeenCalledWith(
      article.id,
      expect.not.objectContaining({ newsletter: expect.anything() }),
    );
  });

  it('omits newsletter fields from web saves while Mailchimp is sending', async () => {
    const user = userEvent.setup();
    const article: Article = {
      ...structuredClone(demoData.articles[0]!),
      newsletter: {
        ...demoData.articles[0]!.newsletter,
        status: 'sending',
        campaignId: 'fixture-sending',
        syncedVersion: demoData.articles[0]!.version,
        needsSync: false,
      },
    };
    const updateArticle = vi.fn(async (_id, command) => ({
      ...article,
      title: command.title ?? article.title,
      authorPlacement: command.authorPlacement ?? article.authorPlacement,
      version: article.version + 1,
    }));
    renderEditor([article], { updateArticle });

    expect(screen.getByRole('textbox', { name: 'عنوان الرسالة' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'إرسال النشرة' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'التحقق من حالة الإرسال' })).toBeInTheDocument();
    const title = screen.getByRole('textbox', { name: 'عنوان المقال' });
    await user.clear(title);
    await user.type(title, 'دليل الضيف أثناء الإرسال');
    await user.selectOptions(screen.getByRole('combobox', { name: /^موضع اسم الكاتب/ }), 'end');
    await user.click(screen.getByRole('button', { name: 'حفظ المسودة' }));

    expect(updateArticle).toHaveBeenCalledWith(
      article.id,
      expect.not.objectContaining({ newsletter: expect.anything() }),
    );
    expect(updateArticle.mock.calls[0]?.[1]).toMatchObject({ authorPlacement: 'end' });
  });

  it('resets every editor field when the detail route changes article id', async () => {
    const user = userEvent.setup();
    const articles = [
      structuredClone(demoData.articles[0]!),
      structuredClone(demoData.articles[1]!),
    ];
    const studioValue = createStudioValue(articles);
    render(
      <MemoryRouter initialEntries={['/articles/article_1']}>
        <AdminAuthContext.Provider value={createAuthValue()}>
          <StudioDataContext.Provider value={studioValue}>
            <RouteSwitcher />
          </StudioDataContext.Provider>
        </AdminAuthContext.Provider>
      </MemoryRouter>,
    );

    expect(screen.getByRole('textbox', { name: 'عنوان المقال' })).toHaveValue(articles[0]!.title);
    await user.click(screen.getByRole('button', { name: 'فتح المقال الثاني' }));
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'عنوان المقال' })).toHaveValue(articles[1]!.title),
    );
  });
});
