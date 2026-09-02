import {
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { JSONContent } from '@tiptap/react';
import { ChevronDown, ClipboardCopy, FileDown, FileText, Sparkles } from 'lucide-react';
import { adminPaths, canManagePage, useAdminAuth, useStudioData } from '@/application';
import {
  type CreateArticleCommand,
  type ArticleMediaAsset,
  isAdminRepositoryError,
  type UpdateArticleCommand,
} from '@/data';
import {
  formatArabicInteger,
  type Article,
  type ArticleAuthorCandidate,
  type ArticleAuthorPlacement,
  type ArticleId,
  DEFAULT_ARTICLE_AUTHOR_PLACEMENT,
  type MailchimpCapability,
  type NewsletterPreview,
  type RichTextDocument,
} from '@/lib';
import { Button, Field, Input, PageBreadcrumb, Select, Textarea } from '@/shared/ui/primitives';
import {
  EMPTY_ARTICLE_DOCUMENT,
  RichTextEditor,
  type RichTextValue,
} from './rich-text-editor';
import {
  copyAiArticleTemplate,
  parseAiArticleDraft,
  AiArticleImportError,
} from './article-ai-import';
import { ArticleAiSkillGuide } from './article-ai-skill-guide';
import { ArticleContentPreview } from './article-media';
import { ArticleCoverCropDialog } from './article-cover-crop-dialog';
import {
  copyNewsletterExport,
  downloadNewsletterExport,
  type NewsletterExportFormat,
} from './article-newsletter-export';
import {
  articleImageErrorMessage,
  prepareArticleCoverImage,
  type PreparedArticleImage,
} from './article-image-file';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type PreviewChannel = 'web' | 'newsletter';
type EditorOperation = 'save' | 'publish' | 'preview' | 'campaign' | 'send' | 'reconcile' | null;
type CollapsibleEditorSection = 'ai' | 'cover' | 'preview' | 'seo' | 'newsletter';

interface EditorFields {
  readonly title: string;
  readonly authorPlacement: ArticleAuthorPlacement;
  readonly slug: string;
  readonly excerpt: string;
  readonly coverUrl: string;
  readonly coverAlt: string;
  readonly seoTitle: string;
  readonly seoDescription: string;
  readonly canonicalUrl: string;
  readonly socialTitle: string;
  readonly socialDescription: string;
  readonly socialImageUrl: string;
  readonly noIndex: boolean;
  readonly newsletterEnabled: boolean;
  readonly newsletterSubject: string;
  readonly newsletterPreheader: string;
}

interface ArticleAuthorFields {
  readonly type: Article['author']['type'];
  readonly studioMemberId: string;
  readonly customDisplayName: string;
}

interface EditorValidationErrors {
  readonly title?: string;
  readonly author?: string;
  readonly content?: string;
}

interface NewsletterSendConfirmation {
  readonly articleId: ArticleId;
  readonly audienceConfirmationToken: string;
  readonly expectedVersion: number;
  readonly expectedCampaignId: string;
  readonly audienceName: string;
  readonly audienceCount: number;
  readonly recipientTag: string;
  readonly recipientCount: number;
  readonly fromName?: string;
  readonly replyTo?: string;
  readonly mode: MailchimpCapability['mode'];
  readonly subject: string;
}

const DATE_FORMATTER = new Intl.DateTimeFormat('ar-SA-u-nu-latn', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function initialFields(article?: Article): EditorFields {
  return {
    title: article?.title ?? '',
    authorPlacement: article?.authorPlacement ?? DEFAULT_ARTICLE_AUTHOR_PLACEMENT,
    slug: article?.slug ?? '',
    excerpt: article?.excerpt ?? '',
    coverUrl: article?.coverUrl ?? '',
    coverAlt: article?.coverAlt ?? '',
    seoTitle: article?.seo.title ?? '',
    seoDescription: article?.seo.description ?? '',
    canonicalUrl: article?.seo.canonicalUrl ?? '',
    socialTitle: article?.seo.socialTitle ?? '',
    socialDescription: article?.seo.socialDescription ?? '',
    socialImageUrl: article?.seo.socialImageUrl ?? '',
    noIndex: article?.seo.noIndex ?? false,
    newsletterEnabled: article?.newsletter.enabled ?? false,
    newsletterSubject: article?.newsletter.subject ?? '',
    newsletterPreheader: article?.newsletter.preheader ?? '',
  };
}

function initialAuthorFields(article?: Article): ArticleAuthorFields {
  if (article?.author.type === 'studio_member') {
    return {
      type: 'studio_member',
      studioMemberId: article.author.studioMemberId,
      customDisplayName: '',
    };
  }
  return {
    type: article?.author.type ?? 'studio_member',
    studioMemberId: '',
    customDisplayName: article?.author.displayName ?? '',
  };
}

function hasArticleContent(document: JSONContent): boolean {
  if (document.type === 'text' && document.text?.trim()) return true;
  if (
    document.type === 'imageBlock' ||
    document.type === 'imageGallery' ||
    document.type === 'videoEmbed'
  ) {
    return true;
  }
  return document.content?.some((node) => hasArticleContent(node)) ?? false;
}

function isHttpUrl(value: string): boolean {
  if (!value.trim()) return true;
  try {
    const parsed = new URL(value.trim());
    return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

function isAllowedCoverUrl(value: string, mediaAssets: readonly ArticleMediaAsset[]): boolean {
  const normalized = value.trim();
  if (isHttpUrl(normalized)) return true;
  return (
    normalized.startsWith('data:image/') &&
    mediaAssets.some((asset) => asset.status === 'ready' && asset.publicUrl === normalized)
  );
}

function mergeMediaAssets(
  current: readonly ArticleMediaAsset[],
  incoming: readonly ArticleMediaAsset[],
): ArticleMediaAsset[] {
  const incomingIds = new Set(incoming.map((asset) => asset.id));
  return [...incoming, ...current.filter((asset) => !incomingIds.has(asset.id))];
}

function editorErrorMessage(error: unknown, operation: Exclude<EditorOperation, null>): string {
  if (!isAdminRepositoryError(error)) {
    return operation === 'send'
      ? 'تعذّر إرسال النشرة. حاول مرة أخرى.'
      : 'تعذّر إكمال الإجراء. حاول مرة أخرى.';
  }

  const remoteCode = error.context?.remoteCode ?? error.context?.reason;
  if (remoteCode === 'NEWSLETTER_SYNC_REQUIRED') {
    return 'تحتاج مسودة Mailchimp إلى تحديث قبل الإرسال.';
  }
  if (remoteCode === 'NEWSLETTER_SYNC_IN_PROGRESS') {
    return 'تُحدّث مسودة Mailchimp الآن. انتظر قليلًا ثم تحقق من الحالة.';
  }
  if (remoteCode === 'NEWSLETTER_SENT') return 'أُرسلت هذه النشرة من قبل.';
  if (remoteCode === 'CAMPAIGN_EXISTS') {
    return 'لا يمكن إيقاف النشرة بعد إنشاء حملة Mailchimp.';
  }
  if (remoteCode === 'MAILCHIMP_AUDIENCE_CONFIRMATION_MISMATCH') {
    return 'تغيّر جمهور Mailchimp منذ فتح التأكيد. حدّث الصفحة وراجع بيانات الجمهور قبل المحاولة.';
  }
  if (remoteCode === 'NEWSLETTER_CONFIRMATION_STALE') {
    return 'تغيّرت نسخة المقال أو مسودة Mailchimp بعد فتح التأكيد. حدّث الصفحة وراجع آخر حالة قبل المحاولة.';
  }
  if (remoteCode === 'ARTICLE_CHANGED_DURING_SYNC') {
    return 'تغيّر المقال أثناء تحديث Mailchimp. احفظ آخر نسخة ثم أعد تحديث المسودة.';
  }
  if (
    remoteCode === 'NEWSLETTER_SYNC_UNKNOWN' ||
    remoteCode === 'NEWSLETTER_CAMPAIGN_PARTIAL_FAILURE' ||
    remoteCode === 'NEWSLETTER_SYNC_STATE_UNKNOWN'
  ) {
    return 'حالة مسودة Mailchimp غير مؤكدة. لا تُنشئ مسودة أخرى. راجع الحملة في Mailchimp واطلب معالجة الحالة.';
  }
  if (remoteCode === 'NEWSLETTER_SEND_STATE_UNKNOWN') {
    return 'حالة الإرسال غير مؤكدة. لا ترسل النشرة مجددًا. استخدم التحقق من حالة الإرسال.';
  }
  if (
    error.code === 'CONFLICT' &&
    (remoteCode === 'ARTICLE_VERSION_CONFLICT' || remoteCode === 'ARTICLE_WRITE_CONFLICT')
  ) {
    return 'تغيّر المقال في جلسة أخرى. أعد تحميل الصفحة قبل متابعة التحرير.';
  }
  switch (error.code) {
    case 'CONFLICT':
      return operation === 'save'
        ? 'تعذّر الحفظ بسبب تعارض في نسخة المقال أو معرّف الرابط.'
        : 'تعذّر إكمال الإجراء بسبب تعارض في حالة المقال.';
    case 'UNAUTHENTICATED':
      return 'انتهت جلسة الدخول. سجّل الدخول ثم حاول مرة أخرى.';
    case 'FORBIDDEN':
      return 'ليس لديك صلاحية لإكمال هذا الإجراء.';
    case 'VALIDATION':
      return operation === 'campaign'
        ? 'أضف عنوان النشرة ومحتواها قبل إنشاء مسودة Mailchimp.'
        : 'راجع الحقول المطلوبة ثم حاول مرة أخرى.';
    case 'CONFIGURATION':
    case 'UNSUPPORTED_CAPABILITY':
      return 'Mailchimp غير مهيأ في الخادم.';
    case 'NETWORK':
    case 'REMOTE_UNAVAILABLE':
      return 'تعذّر الاتصال بالخادم. تحقق من اتصالك ثم حاول مرة أخرى.';
    default:
      return 'تعذّر إكمال الإجراء. حاول مرة أخرى.';
  }
}

function newsletterStatusLabel(article?: Article, dirty = false): string {
  if (!article || !article.newsletter.enabled) return 'غير مفعّلة';
  if (article.newsletter.status === 'sent') return 'أُرسلت';
  if (article.newsletter.status === 'sending') return 'جارٍ الإرسال';
  if (article.newsletter.status === 'syncing') return 'جارٍ تحديث مسودة Mailchimp';
  if (article.newsletter.status === 'sync_unknown') return 'نتيجة إنشاء المسودة غير مؤكدة';
  if (dirty || article.newsletter.needsSync) return 'تحتاج المسودة إلى تحديث';
  if (article.newsletter.status === 'campaign_created') return 'مسودة Mailchimp جاهزة';
  return 'مسودة داخل الاستوديو';
}

function SeoCounter({ value, maximum }: { readonly value: string; readonly maximum: number }) {
  return (
    <span className="article-publisher__counter" aria-hidden="true">
      {formatArabicInteger(value.length)} من {formatArabicInteger(maximum)}
    </span>
  );
}

function CollapsibleArticleSection({
  id,
  title,
  description,
  open,
  onToggle,
  className = '',
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const panelId = `${id}-panel`;
  return (
    <section
      className={`card article-publisher__section article-publisher__section--collapsible ${className}`.trim()}
      aria-labelledby={id}
    >
      <div className="article-publisher__section-heading">
        <div>
          <h2 id={id}>{title}</h2>
          <p>{description}</p>
        </div>
        <button
          type="button"
          className="article-publisher__section-toggle"
          aria-label={`${open ? 'إغلاق' : 'فتح'} قسم ${title}`}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
        >
          <span>{open ? 'إغلاق' : 'فتح'}</span>
          <ChevronDown aria-hidden="true" focusable="false" size={17} strokeWidth={2} />
        </button>
      </div>
      <div id={panelId} hidden={!open}>
        {children}
      </div>
    </section>
  );
}

function NewsletterExportMenu({
  disabled,
  preparing,
  previewReady,
  onPrepare,
  onCopy,
  onDownload,
}: {
  readonly disabled: boolean;
  readonly preparing: boolean;
  readonly previewReady: boolean;
  readonly onPrepare: () => Promise<boolean>;
  readonly onCopy: (format: NewsletterExportFormat) => Promise<boolean>;
  readonly onDownload: (format: NewsletterExportFormat) => boolean;
}) {
  const menuId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const closeMenu = useCallback((restoreFocus = false) => {
    if (restoreFocus) triggerRef.current?.focus();
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const focusFrame = requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    });
    const closeFromOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !wrapperRef.current?.contains(event.target)) {
        closeMenu();
      }
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeMenu(true);
    };
    document.addEventListener('pointerdown', closeFromOutside);
    document.addEventListener('keydown', closeWithEscape);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener('pointerdown', closeFromOutside);
      document.removeEventListener('keydown', closeWithEscape);
    };
  }, [closeMenu, open]);

  useEffect(() => {
    if (disabled || !previewReady) closeMenu();
  }, [closeMenu, disabled, previewReady]);

  async function toggleMenu() {
    if (open) {
      closeMenu(true);
      return;
    }
    if (!previewReady && !(await onPrepare())) return;
    setOpen(true);
  }

  function moveMenuFocus(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
    );
    if (!items.length) return;
    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : event.key === 'ArrowDown'
            ? (Math.max(currentIndex, -1) + 1) % items.length
            : (currentIndex <= 0 ? items.length : currentIndex) - 1;
    items[nextIndex]?.focus();
  }

  return (
    <div
      ref={wrapperRef}
      className="article-publisher__export-menu"
      onBlur={(event) => {
        if (
          open &&
          (!event.relatedTarget ||
            (event.relatedTarget instanceof Node &&
              !event.currentTarget.contains(event.relatedTarget)))
        ) {
          closeMenu();
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="button button--primary article-publisher__export-trigger"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => void toggleMenu()}
      >
        <FileDown aria-hidden="true" focusable="false" size={18} strokeWidth={1.9} />
        <span>{preparing ? 'جارٍ تجهيز خيارات التصدير…' : 'تصدير البريد للإرسال'}</span>
        <ChevronDown aria-hidden="true" focusable="false" size={16} strokeWidth={1.9} />
      </button>
      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          className="article-publisher__export-options"
          role="menu"
          aria-label="خيارات تصدير البريد"
          onKeyDown={moveMenuFocus}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => void onCopy('html').then((copied) => copied && closeMenu(true))}
          >
            <ClipboardCopy aria-hidden="true" focusable="false" size={18} strokeWidth={1.9} />
            <span>
              <b>نسخ HTML</b>
              <small>الصقه في حملة Mailchimp</small>
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              if (onDownload('html')) closeMenu(true);
            }}
          >
            <FileDown aria-hidden="true" focusable="false" size={18} strokeWidth={1.9} />
            <span>
              <b>تنزيل ملف HTML</b>
              <small>للحفظ أو الاستيراد</small>
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => void onCopy('text').then((copied) => copied && closeMenu(true))}
          >
            <FileText aria-hidden="true" focusable="false" size={18} strokeWidth={1.9} />
            <span>
              <b>نسخ النص</b>
              <small>نسخة بديلة بلا تنسيق</small>
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              if (onDownload('text')) closeMenu(true);
            }}
          >
            <FileText aria-hidden="true" focusable="false" size={18} strokeWidth={1.9} />
            <span>
              <b>تنزيل ملف النص</b>
              <small>نسخة بديلة بلا تنسيق</small>
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function ArticleEditorView() {
  const { articleId: routeArticleId } = useParams<{ articleId: string }>();
  const navigate = useNavigate();
  const { viewer } = useAdminAuth();
  const {
    data,
    createArticle,
    updateArticle,
    transitionArticleStatus,
    getMailchimpCapability,
    previewArticleNewsletter,
    syncArticleNewsletterCampaign,
    sendArticleNewsletter,
    reconcileArticleNewsletter,
    listArticleMedia,
    listArticleAuthors,
    uploadArticleImage,
  } = useStudioData();
  const canManage = viewer ? canManagePage(viewer, 'articles') : false;
  const loadedArticle = routeArticleId
    ? data.articles.find((candidate) => candidate.id === routeArticleId)
    : undefined;
  const isNewRoute = !routeArticleId;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const coverFileInputId = useId();
  const titleErrorId = useId();
  const authorErrorId = useId();
  const contentHelpId = useId();
  const contentErrorId = useId();
  const coverFileInputRef = useRef<HTMLInputElement>(null);
  const coverPickerButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const sendTriggerRef = useRef<HTMLButtonElement>(null);
  const sendDialogRef = useRef<HTMLDialogElement>(null);
  const mailchimpRequestRef = useRef(0);
  const [workingArticleId, setWorkingArticleId] = useState<ArticleId | undefined>(
    loadedArticle?.id,
  );
  const [workingVersion, setWorkingVersion] = useState(loadedArticle?.version ?? 0);
  const [fields, setFields] = useState<EditorFields>(() => initialFields(loadedArticle));
  const [authorFields, setAuthorFields] = useState<ArticleAuthorFields>(() =>
    initialAuthorFields(loadedArticle),
  );
  const [authorChanged, setAuthorChanged] = useState(false);
  const [storedAuthorDisplayName, setStoredAuthorDisplayName] = useState(
    loadedArticle?.author.displayName ?? '',
  );
  const [authorCandidates, setAuthorCandidates] = useState<ArticleAuthorCandidate[]>([]);
  const [authorDirectoryLoading, setAuthorDirectoryLoading] = useState(true);
  const [authorDirectoryError, setAuthorDirectoryError] = useState('');
  const [validationErrors, setValidationErrors] = useState<EditorValidationErrors>({});
  const [richText, setRichText] = useState<RichTextValue>(() => ({
    document: (loadedArticle?.content ?? EMPTY_ARTICLE_DOCUMENT) as JSONContent,
    html: loadedArticle?.contentHtml ?? '<p></p>',
    text: loadedArticle?.body ?? '',
  }));
  const [richTextRevision, setRichTextRevision] = useState(0);
  const [aiDraftPayload, setAiDraftPayload] = useState('');
  const [aiImportError, setAiImportError] = useState('');
  const [aiImportFeedback, setAiImportFeedback] = useState('');
  const [previewChannel, setPreviewChannel] = useState<PreviewChannel>('web');
  const [mailchimp, setMailchimp] = useState<MailchimpCapability | null>(null);
  const [mailchimpLoading, setMailchimpLoading] = useState(true);
  const [mailchimpError, setMailchimpError] = useState('');
  const [emailPreview, setEmailPreview] = useState<NewsletterPreview | null>(null);
  const [operation, setOperation] = useState<EditorOperation>(null);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [openSections, setOpenSections] = useState<Record<CollapsibleEditorSection, boolean>>(
    () => ({
      ai: isNewRoute,
      cover: true,
      preview: true,
      seo: true,
      newsletter: true,
    }),
  );
  const [sendConfirmation, setSendConfirmation] = useState<NewsletterSendConfirmation | null>(null);
  const [mediaAssets, setMediaAssets] = useState<ArticleMediaAsset[]>([]);
  const [mediaLoadError, setMediaLoadError] = useState('');
  const [selectedCoverImage, setSelectedCoverImage] = useState<PreparedArticleImage | null>(null);
  const [pendingCoverSource, setPendingCoverSource] = useState<PreparedArticleImage | null>(null);
  const [selectedCoverPreviewUrl, setSelectedCoverPreviewUrl] = useState('');
  const [coverUploadProgress, setCoverUploadProgress] = useState<number | null>(null);
  const [coverUploadError, setCoverUploadError] = useState('');
  const [coverUploadFeedback, setCoverUploadFeedback] = useState('');

  const currentArticle = useMemo(
    () => data.articles.find((candidate) => candidate.id === workingArticleId) ?? loadedArticle,
    [data.articles, loadedArticle, workingArticleId],
  );
  const newsletterSent = currentArticle?.newsletter.status === 'sent';
  const newsletterSending = currentArticle?.newsletter.status === 'sending';
  const newsletterSyncUnknown = currentArticle?.newsletter.status === 'sync_unknown';
  const newsletterSyncing = currentArticle?.newsletter.status === 'syncing';
  const newsletterFieldsLocked = Boolean(
    newsletterSent || newsletterSending || newsletterSyncUnknown || newsletterSyncing,
  );
  const needsNewsletterSync = Boolean(
    !newsletterSent &&
    currentArticle?.newsletter.campaignId &&
    (dirty || currentArticle.newsletter.needsSync),
  );
  const articleVersionStale = Boolean(currentArticle && workingVersion !== currentArticle.version);
  const mailchimpTargetVerified = Boolean(
    mailchimp?.configured &&
    mailchimp.audienceName &&
    mailchimp.audienceCount !== undefined &&
    mailchimp.recipientTag &&
    mailchimp.recipientCount !== undefined &&
    mailchimp.audienceConfirmationToken,
  );
  const busy = operation !== null || coverUploadProgress !== null;

  useEffect(() => {
    if (!selectedCoverImage) {
      setSelectedCoverPreviewUrl('');
      return;
    }

    const previewUrl = URL.createObjectURL(selectedCoverImage.file);
    setSelectedCoverPreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [selectedCoverImage]);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const refreshMailchimp = useCallback(async () => {
    const requestId = mailchimpRequestRef.current + 1;
    mailchimpRequestRef.current = requestId;
    setMailchimp(null);
    setMailchimpError('');
    setMailchimpLoading(true);
    try {
      const capability = await getMailchimpCapability();
      if (requestId === mailchimpRequestRef.current) setMailchimp(capability);
    } catch {
      if (requestId === mailchimpRequestRef.current) {
        setMailchimpError('تعذّر التحقق من إعداد Mailchimp. أعد المحاولة.');
      }
    } finally {
      if (requestId === mailchimpRequestRef.current) setMailchimpLoading(false);
    }
  }, [getMailchimpCapability]);

  useEffect(() => {
    void refreshMailchimp();
    return () => {
      mailchimpRequestRef.current += 1;
    };
  }, [refreshMailchimp]);

  useEffect(() => {
    let active = true;
    setAuthorDirectoryLoading(true);
    void listArticleAuthors()
      .then((candidates) => {
        if (!active) return;
        setAuthorCandidates(candidates);
        setAuthorDirectoryError('');
        setAuthorFields((current) => {
          if (!isNewRoute || current.type !== 'studio_member' || current.studioMemberId) {
            return current;
          }
          const preferred = candidates.find((candidate) => candidate.studioMemberId === viewer?.id);
          return preferred ? { ...current, studioMemberId: preferred.studioMemberId } : current;
        });
      })
      .catch(() => {
        if (active) {
          setAuthorDirectoryError(
            'تعذّر تحميل أعضاء فريق الاستوديو. اختر كاتبًا آخر وأدخل اسمه، أو أعد تحميل الصفحة.',
          );
        }
      })
      .finally(() => {
        if (active) setAuthorDirectoryLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isNewRoute, listArticleAuthors, viewer?.id]);

  const refreshMedia = useCallback(async () => {
    try {
      const assets = await listArticleMedia();
      setMediaAssets((current) => mergeMediaAssets(current, assets));
      setMediaLoadError('');
    } catch {
      setMediaLoadError('تعذّر تحميل مكتبة الصور. يمكنك متابعة تحرير النص والمحاولة لاحقًا.');
      throw new Error('Article media library is unavailable.');
    }
  }, [listArticleMedia]);

  useEffect(() => {
    let active = true;
    void listArticleMedia()
      .then((assets) => {
        if (active) {
          setMediaAssets((current) => mergeMediaAssets(current, assets));
          setMediaLoadError('');
        }
      })
      .catch(() => {
        if (active) {
          setMediaLoadError('تعذّر تحميل مكتبة الصور. يمكنك متابعة تحرير النص والمحاولة لاحقًا.');
        }
      });
    return () => {
      active = false;
    };
  }, [listArticleMedia]);

  useEffect(() => {
    const dialog = sendDialogRef.current;
    if (!dialog) return;
    if (sendConfirmation && !dialog.open) {
      dialog.showModal();
      confirmButtonRef.current?.focus();
    }
    if (!sendConfirmation && dialog.open) dialog.close();
  }, [sendConfirmation]);

  function changeField<K extends keyof EditorFields>(name: K, value: EditorFields[K]) {
    setFields((current) => ({ ...current, [name]: value }));
    setDirty(true);
    setFeedback('');
    setEmailPreview(null);
    if (name === 'title') {
      setValidationErrors((current) => ({ ...current, title: undefined }));
    }
  }

  function changeAuthor(next: ArticleAuthorFields) {
    setAuthorFields(next);
    setAuthorChanged(true);
    setValidationErrors((current) => ({ ...current, author: undefined }));
    setDirty(true);
    setFeedback('');
    setEmailPreview(null);
  }

  async function selectCoverFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    setCoverUploadError('');
    setCoverUploadFeedback('');
    if (!file) return;
    try {
      setPendingCoverSource(await prepareArticleCoverImage(file));
    } catch (cause) {
      setCoverUploadError(articleImageErrorMessage(cause));
    }
  }

  function applyCoverCrop(image: PreparedArticleImage) {
    setSelectedCoverImage(image);
    setPendingCoverSource(null);
    setCoverUploadError('');
    setCoverUploadFeedback('');
  }

  async function uploadCoverImage() {
    if (!selectedCoverImage || busy || !canManage) return;
    const coverAlt = fields.coverAlt.trim();
    if (!coverAlt) {
      setCoverUploadError('أضف وصفًا بديلًا قبل رفع صورة الغلاف.');
      return;
    }

    setCoverUploadError('');
    setCoverUploadFeedback('');
    setCoverUploadProgress(0);
    try {
      const uploaded = await uploadArticleImage({
        body: selectedCoverImage.file,
        fileName: selectedCoverImage.file.name,
        mimeType: selectedCoverImage.file.type as 'image/jpeg' | 'image/png',
        byteSize: selectedCoverImage.file.size,
        width: selectedCoverImage.width,
        height: selectedCoverImage.height,
        alt: coverAlt,
        onProgress: setCoverUploadProgress,
      });
      setMediaAssets((current) => mergeMediaAssets(current, [uploaded]));
      setSelectedCoverImage(null);
      if (!uploaded.publicUrl) {
        setCoverUploadError('رُفعت الصورة، لكن رابط العرض غير متاح. راجع إعداد تخزين الصور.');
        return;
      }
      changeField('coverUrl', uploaded.publicUrl);
      setCoverUploadFeedback('رُفعت صورة الغلاف وأضيفت إلى المقال.');
    } catch (cause) {
      setCoverUploadError(articleImageErrorMessage(cause));
    } finally {
      setCoverUploadProgress(null);
    }
  }

  function validateBase(): string | null {
    const nextValidationErrors: EditorValidationErrors = {
      title: fields.title.trim() ? undefined : 'أضف عنوان المقال.',
      author:
        authorFields.type === 'studio_member'
          ? authorFields.studioMemberId
            ? undefined
            : 'اختر عضوًا من فريق الاستوديو.'
          : authorFields.customDisplayName.trim().length >= 2
            ? undefined
            : 'اكتب اسم الكاتب من حرفين على الأقل.',
      content: hasArticleContent(richText.document)
        ? undefined
        : 'أضف نصًا أو صورة أو فيديو إلى محتوى المقال.',
    };
    setValidationErrors(nextValidationErrors);
    if (nextValidationErrors.title || nextValidationErrors.author || nextValidationErrors.content) {
      return 'راجع عنوان المقال وكاتبه ومحتواه.';
    }
    if (!fields.slug.trim()) {
      return 'أضف معرّف الرابط.';
    }
    if (!SLUG_PATTERN.test(fields.slug.trim())) {
      return 'اكتب معرّف الرابط بحروف إنجليزية صغيرة وأرقام وشرطات فقط.';
    }
    if (fields.coverUrl.trim() && !fields.coverAlt.trim()) {
      return 'أضف وصفًا بديلًا لصورة الغلاف.';
    }
    if (
      !isAllowedCoverUrl(fields.coverUrl, mediaAssets) ||
      [fields.canonicalUrl, fields.socialImageUrl].some((value) => !isHttpUrl(value))
    ) {
      return 'اكتب روابط كاملة تبدأ بـ http:// أو https:// ومن دون بيانات دخول.';
    }
    return null;
  }

  function createCommand(): CreateArticleCommand {
    return {
      slug: fields.slug.trim(),
      title: fields.title.trim(),
      author:
        authorFields.type === 'studio_member'
          ? { type: 'studio_member', studioMemberId: authorFields.studioMemberId }
          : { type: 'custom', displayName: authorFields.customDisplayName.trim() },
      authorPlacement: fields.authorPlacement,
      excerpt: fields.excerpt.trim(),
      coverUrl: fields.coverUrl.trim(),
      coverAlt: fields.coverAlt.trim(),
      content: richText.document as RichTextDocument,
      seo: {
        title: fields.seoTitle.trim(),
        description: fields.seoDescription.trim(),
        canonicalUrl: fields.canonicalUrl.trim(),
        socialTitle: fields.socialTitle.trim(),
        socialDescription: fields.socialDescription.trim(),
        socialImageUrl: fields.socialImageUrl.trim(),
        noIndex: fields.noIndex,
      },
      newsletter: {
        enabled: fields.newsletterEnabled,
        subject: fields.newsletterSubject.trim(),
        preheader: fields.newsletterPreheader.trim(),
      },
    };
  }

  async function persistArticle(): Promise<{ id: ArticleId; version: number } | null> {
    const validationError = validateBase();
    if (validationError) {
      setError(validationError);
      return null;
    }

    const command = createCommand();
    if (workingArticleId) {
      if (!dirty) return { id: workingArticleId, version: workingVersion };
      const { author, ...commandWithoutAuthor } = command;
      const updateCommand: UpdateArticleCommand = newsletterFieldsLocked
        ? {
            slug: command.slug,
            title: command.title,
            authorPlacement: command.authorPlacement,
            ...(authorChanged ? { author } : {}),
            excerpt: command.excerpt,
            coverUrl: command.coverUrl,
            coverAlt: command.coverAlt,
            content: command.content,
            seo: command.seo,
            expectedVersion: workingVersion,
          }
        : {
            ...commandWithoutAuthor,
            ...(authorChanged ? { author } : {}),
            expectedVersion: workingVersion,
          };
      const updated = await updateArticle(workingArticleId, updateCommand);
      setWorkingVersion(updated.version);
      setAuthorFields(initialAuthorFields(updated));
      setStoredAuthorDisplayName(updated.author.displayName);
      setAuthorChanged(false);
      setDirty(false);
      return { id: workingArticleId, version: updated.version };
    }

    const createdId = await createArticle(command);
    setWorkingArticleId(createdId);
    setWorkingVersion(1);
    setAuthorChanged(false);
    setDirty(false);
    return { id: createdId, version: 1 };
  }

  async function saveDraft(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!canManage || busy) return;
    setOperation('save');
    setError('');
    setFeedback('');
    try {
      const saved = await persistArticle();
      if (!saved) return;
      setFeedback('حُفظت المسودة.');
      if (!routeArticleId) navigate(adminPaths.article(saved.id), { replace: true });
    } catch (cause) {
      setError(editorErrorMessage(cause, 'save'));
    } finally {
      setOperation(null);
    }
  }

  async function publishWeb() {
    if (!canManage || busy) return;
    setOperation('publish');
    setError('');
    setFeedback('');
    try {
      const saved = await persistArticle();
      if (!saved) return;
      const nextStatus = currentArticle?.status === 'published' ? 'draft' : 'published';
      const transitioned = await transitionArticleStatus(saved.id, nextStatus, saved.version);
      setWorkingVersion(transitioned.version);
      setFeedback(nextStatus === 'published' ? 'نُشر المقال.' : 'أُعيد المقال إلى المسودات.');
      if (!routeArticleId) navigate(adminPaths.article(saved.id), { replace: true });
    } catch (cause) {
      setError(editorErrorMessage(cause, 'publish'));
    } finally {
      setOperation(null);
    }
  }

  function toggleSection(section: CollapsibleEditorSection) {
    setOpenSections((current) => ({ ...current, [section]: !current[section] }));
  }

  async function copyAiTemplate() {
    if (!canManage || busy) return;
    setAiImportError('');
    setAiImportFeedback('');
    try {
      await copyAiArticleTemplate();
      setAiImportFeedback('نُسخ القالب. أضف موضوعك ومصادرك إلى المساعد، ثم الصق ناتج JSON هنا.');
    } catch {
      setAiImportError('تعذّر نسخ القالب. انسخه يدويًا أو امنح المتصفح إذن الحافظة.');
    }
  }

  function importAiDraft() {
    if (!canManage || busy) return;
    setAiImportError('');
    setAiImportFeedback('');
    try {
      const imported = parseAiArticleDraft(aiDraftPayload);
      setFields((current) => ({
        ...current,
        title: imported.title,
        slug: imported.slug,
        ...(imported.excerpt !== undefined ? { excerpt: imported.excerpt } : {}),
        ...(imported.seoTitle !== undefined ? { seoTitle: imported.seoTitle } : {}),
        ...(imported.seoDescription !== undefined
          ? { seoDescription: imported.seoDescription }
          : {}),
      }));
      setRichText({
        document: imported.document,
        html: '',
        text: imported.text,
      });
      setRichTextRevision((current) => current + 1);
      setValidationErrors((current) => ({ ...current, title: undefined, content: undefined }));
      setDirty(true);
      setEmailPreview(null);
      setFeedback('أُضيفت مسودة AI إلى المحرر. راجعها ثم احفظها.');
      setAiImportFeedback('أُضيفت المسودة. لم يُنشر المقال ولم يُرسل أي بريد.');
    } catch (cause) {
      setAiImportError(
        cause instanceof AiArticleImportError
          ? cause.message
          : 'تعذّر استيراد المسودة. راجع ناتج AI ثم حاول مرة أخرى.',
      );
    }
  }

  async function prepareNewsletterExport(): Promise<boolean> {
    if (!workingArticleId || dirty || busy) return false;
    setOperation('preview');
    setError('');
    try {
      setEmailPreview(await previewArticleNewsletter(workingArticleId));
      setFeedback(
        mailchimp?.mode === 'simulation' ? 'جُهّز البريد للتصدير المحلي.' : 'جُهّز البريد للتصدير.',
      );
      return true;
    } catch (cause) {
      setError(editorErrorMessage(cause, 'preview'));
      return false;
    } finally {
      setOperation(null);
    }
  }

  async function copyNewsletter(format: NewsletterExportFormat): Promise<boolean> {
    if (!emailPreview || busy || dirty) return false;
    setError('');
    setFeedback('');
    try {
      await copyNewsletterExport(format === 'html' ? emailPreview.html : emailPreview.text);
      setFeedback(
        format === 'html'
          ? 'نُسخ HTML للنشرة. الصقه يدويًا في محرر Mailchimp.'
          : 'نُسخت النسخة النصية للنشرة.',
      );
      return true;
    } catch {
      setError('تعذّر نسخ ملف النشرة. استخدم التنزيل بدلًا من ذلك.');
      return false;
    }
  }

  function downloadNewsletter(format: NewsletterExportFormat): boolean {
    if (!emailPreview || busy || dirty) return false;
    setError('');
    setFeedback('');
    try {
      downloadNewsletterExport(
        format === 'html' ? emailPreview.html : emailPreview.text,
        fields.slug,
        format,
      );
      setFeedback(
        format === 'html'
          ? 'نُزّل ملف HTML للنشرة. يمكنك رفعه أو لصقه في Mailchimp.'
          : 'نُزّلت النسخة النصية للنشرة.',
      );
      return true;
    } catch {
      setError('تعذّر تنزيل ملف النشرة. حدّث قالب البريد ثم حاول مرة أخرى.');
      return false;
    }
  }

  async function syncCampaign() {
    if (
      !canManage ||
      busy ||
      !mailchimp ||
      !mailchimpTargetVerified ||
      newsletterSent ||
      newsletterSyncUnknown ||
      newsletterSyncing ||
      articleVersionStale
    )
      return;
    if (!fields.newsletterEnabled || !fields.newsletterSubject.trim()) {
      setError('فعّل النشرة وأضف عنوان الرسالة أولًا.');
      return;
    }
    setOperation('campaign');
    setError('');
    setFeedback('');
    try {
      const saved = await persistArticle();
      if (!saved) return;
      const result = await syncArticleNewsletterCampaign(saved.id, saved.version);
      setWorkingVersion(result.article.version);
      setDirty(false);
      const created = result.operation === 'created';
      setFeedback(
        mailchimp.mode === 'simulation'
          ? created
            ? 'أُنشئت مسودة Mailchimp في المحاكاة المحلية.'
            : 'حُدّثت مسودة Mailchimp في المحاكاة المحلية.'
          : created
            ? 'أُنشئت مسودة Mailchimp.'
            : 'حُدّثت مسودة Mailchimp.',
      );
      if (!routeArticleId) navigate(adminPaths.article(saved.id), { replace: true });
    } catch (cause) {
      setError(editorErrorMessage(cause, 'campaign'));
    } finally {
      setOperation(null);
    }
  }

  function openSendConfirmation() {
    const audienceConfirmationToken = mailchimp?.audienceConfirmationToken;
    const audienceName = mailchimp?.audienceName;
    const audienceCount = mailchimp?.audienceCount;
    const recipientTag = mailchimp?.recipientTag;
    const recipientCount = mailchimp?.recipientCount;
    const campaignId = currentArticle?.newsletter.campaignId;
    if (
      !workingArticleId ||
      !mailchimp ||
      !currentArticle ||
      !audienceConfirmationToken ||
      !audienceName ||
      audienceCount === undefined ||
      !recipientTag ||
      recipientCount === undefined ||
      recipientCount < 1 ||
      !campaignId ||
      !canSend
    )
      return;

    setSendConfirmation({
      articleId: workingArticleId,
      audienceConfirmationToken,
      expectedVersion: workingVersion,
      expectedCampaignId: campaignId,
      audienceName,
      audienceCount,
      recipientTag,
      recipientCount,
      fromName: mailchimp.fromName,
      replyTo: mailchimp.replyTo,
      mode: mailchimp.mode,
      subject: fields.newsletterSubject.trim(),
    });
  }

  async function sendNewsletter() {
    const confirmation = sendConfirmation;
    if (!confirmation || busy || newsletterSent || needsNewsletterSync) return;
    setSendConfirmation(null);
    setOperation('send');
    setError('');
    setFeedback('');
    try {
      const result = await sendArticleNewsletter(
        confirmation.articleId,
        confirmation.audienceConfirmationToken,
        confirmation.expectedVersion,
        confirmation.expectedCampaignId,
      );
      setWorkingVersion(result.article.version);
      if (confirmation.mode === 'simulation') {
        setFeedback(
          result.operation === 'not_sent'
            ? 'لم تبدأ محاكاة الإرسال. عادت الحملة إلى مسودة محلية.'
            : 'اكتملت محاكاة الإرسال محليًا. لم تُرسل الرسالة عبر Mailchimp.',
        );
      } else if (result.operation === 'accepted') {
        setFeedback('استلم Mailchimp طلب الإرسال. تحقق من الحالة بعد قليل.');
      } else if (result.operation === 'not_sent') {
        setFeedback('لم يبدأ الإرسال. عادت الحملة إلى مسودة Mailchimp.');
      } else if (result.operation === 'already_sent') {
        setFeedback('كانت النشرة مرسلة من قبل.');
      } else {
        setFeedback('أُرسلت النشرة.');
      }
    } catch (cause) {
      setError(editorErrorMessage(cause, 'send'));
    } finally {
      setOperation(null);
    }
  }

  async function reconcileNewsletter() {
    if (!workingArticleId || busy) return;
    setOperation('reconcile');
    setError('');
    setFeedback('');
    try {
      const result = await reconcileArticleNewsletter(workingArticleId);
      setWorkingVersion(result.article.version);
      if (result.operation === 'accepted') {
        setFeedback('لا يزال Mailchimp يرسل النشرة. تحقق من الحالة بعد قليل.');
      } else if (result.operation === 'not_sent') {
        setFeedback('لم يبدأ الإرسال. عادت الحملة إلى مسودة Mailchimp.');
      } else {
        setFeedback(
          mailchimp?.mode === 'simulation'
            ? 'اكتملت محاكاة الإرسال محليًا. لم تُرسل الرسالة عبر Mailchimp.'
            : 'أكّد Mailchimp إرسال النشرة.',
        );
      }
    } catch (cause) {
      setError(editorErrorMessage(cause, 'reconcile'));
    } finally {
      setOperation(null);
    }
  }

  if (routeArticleId && !loadedArticle) {
    return (
      <section className="card permission-state" role="status">
        <h1>المقال غير موجود</h1>
        <p>قد يكون المقال حُذف أو تغيّر معرّفه.</p>
      </section>
    );
  }

  if (isNewRoute && !canManage) {
    return (
      <section className="card permission-state" role="status">
        <h1>لا تملك صلاحية إنشاء مقال.</h1>
        <p>اطلب صلاحية إدارة المقالات من المشرف.</p>
      </section>
    );
  }

  const displayTitle = fields.title.trim() || 'مقال بلا عنوان';
  const explicitExcerpt = fields.excerpt.trim();
  const derivedSummary = explicitExcerpt || richText.text.slice(0, 170);
  const currentAuthorCandidate =
    loadedArticle?.author.type === 'studio_member'
      ? {
          studioMemberId: loadedArticle.author.studioMemberId,
          displayName: loadedArticle.author.displayName,
        }
      : undefined;
  const availableAuthorCandidates =
    currentAuthorCandidate &&
    !authorCandidates.some(
      (candidate) => candidate.studioMemberId === currentAuthorCandidate.studioMemberId,
    )
      ? [currentAuthorCandidate, ...authorCandidates]
      : authorCandidates;
  const selectedStudioAuthor = availableAuthorCandidates.find(
    (candidate) => candidate.studioMemberId === authorFields.studioMemberId,
  );
  const selectedAuthorDisplayName =
    authorFields.type === 'studio_member'
      ? (selectedStudioAuthor?.displayName ?? 'اسم الكاتب')
      : authorFields.customDisplayName.trim() || 'اسم الكاتب';
  const displayAuthor =
    !isNewRoute && !authorChanged && storedAuthorDisplayName
      ? storedAuthorDisplayName
      : selectedAuthorDisplayName;
  const campaignExists = Boolean(currentArticle?.newsletter.campaignId);
  const canSend = Boolean(
    mailchimp?.configured &&
    mailchimp.audienceName &&
    mailchimp.audienceCount !== undefined &&
    mailchimp.recipientTag &&
    mailchimp.recipientCount !== undefined &&
    mailchimp.recipientCount > 0 &&
    mailchimp.audienceConfirmationToken &&
    currentArticle?.newsletter.status === 'campaign_created' &&
    currentArticle.newsletter.campaignId &&
    !articleVersionStale &&
    !needsNewsletterSync &&
    !dirty,
  );

  return (
    <div className="article-publisher">
      <PageBreadcrumb
        parentLabel="المقالات"
        parentTo={adminPaths.articles}
        current={isNewRoute ? 'مقال جديد' : displayTitle}
      />
      <header className="page-header article-publisher__header">
        <div className="page-header__title-row">
          <h1 ref={headingRef} tabIndex={-1} id="article-editor-title">
            {isNewRoute
              ? 'مقال ونشرة جديدان'
              : canManage
                ? 'تحرير المقال والنشرة'
                : 'تفاصيل المقال'}
          </h1>
          <div className="page-header__detail">مصدر محتوى واحد، مع نشر مستقل للموقع والبريد.</div>
        </div>
        {currentArticle ? (
          <div className="article-publisher__state" aria-live="polite">
            <span>{currentArticle.status === 'published' ? 'المقال منشور' : 'المقال مسودة'}</span>
            <span>{newsletterStatusLabel(currentArticle, dirty)}</span>
          </div>
        ) : null}
      </header>

      <form
        className="article-publisher__layout"
        aria-labelledby="article-editor-title"
        aria-busy={busy}
        onSubmit={(event) => void saveDraft(event)}
        noValidate
      >
        <main className="article-publisher__main">
          <CollapsibleArticleSection
            id="article-ai-title"
            title="مقال بمساعدة AI"
            description="أنشئ مسودة منظمة، ثم راجعها داخل المحرر قبل الحفظ."
            open={openSections.ai}
            onToggle={() => toggleSection('ai')}
            className="article-publisher__section--ai"
          >
            <div className="article-publisher__ai-panel">
              <p className="article-publisher__ai-intro">
                {isNewRoute ? (
                  <>
                    اختر قالبًا سريعًا لمسودة واحدة، أو نزّل سكيلًا متوافقًا مع{' '}
                    <bdi dir="ltr">ChatGPT Desktop</bdi>&nbsp;و&nbsp;
                    <bdi dir="ltr">Claude</bdi> ليسألك في المحادثة سؤالًا واحدًا في كل مرة، ثم يعيد
                    JSON قابلًا للاستيراد.
                  </>
                ) : (
                  <>انسخ قالبًا سريعًا لإنشاء مسودة منظمة، ثم الصق ناتج JSON هنا.</>
                )}
              </p>
              <div
                className="article-publisher__ai-methods"
                aria-label="خيارات إعداد المقال بمساعدة AI"
              >
                <section
                  className="article-publisher__ai-method"
                  aria-labelledby="article-ai-template-title"
                >
                  <div>
                    <h3 id="article-ai-template-title">القالب</h3>
                    <p>انسخه إلى Claude أو ChatGPT أو أي مساعد لإنشاء مسودة من موضوعك ومصادرك.</p>
                  </div>
                  <Button
                    type="button"
                    className="article-publisher__ai-template-button"
                    disabled={!canManage || busy}
                    onClick={() => void copyAiTemplate()}
                  >
                    <ClipboardCopy aria-hidden="true" focusable="false" size={17} strokeWidth={1.9} />
                    نسخ القالب
                  </Button>
                </section>
                {isNewRoute ? <ArticleAiSkillGuide /> : null}
              </div>
              <p className="article-publisher__ai-boundary">
                هذه الأدوات تنشئ مسودة فقط. لا تنشر المقال ولا ترسل بريدًا.
              </p>
              <Field
                label="ناتج AI بصيغة JSON"
                hint="الصق الناتج كاملًا كما هو. لا يُرسل شيء إلى الموقع أو Mailchimp عند الاستيراد."
              >
                <Textarea
                  className="article-publisher__ai-input"
                  dir="ltr"
                  aria-label="ناتج AI بصيغة JSON"
                  value={aiDraftPayload}
                  readOnly={!canManage}
                  disabled={busy}
                  rows={14}
                  maxLength={220_000}
                  placeholder={'{\n  "schema": "mukhtalif.article-ai/v1",\n  "title": "..."\n}'}
                  spellCheck={false}
                  onChange={(event) => {
                    setAiDraftPayload(event.target.value);
                    setAiImportError('');
                    setAiImportFeedback('');
                  }}
                />
              </Field>
              <div className="article-publisher__ai-import-row">
                <Button
                  type="button"
                  variant="primary"
                  className="article-publisher__ai-import-button"
                  disabled={!canManage || busy || !aiDraftPayload.trim()}
                  onClick={importAiDraft}
                >
                  <Sparkles aria-hidden="true" focusable="false" size={18} strokeWidth={1.9} />
                  استيراد إلى المسودة
                </Button>
                <p>
                  سيستبدل العنوان والمحتوى الحاليين. تبقى صورة الغلاف والكاتب وإعدادات النشرة كما هي.
                </p>
              </div>
              {aiImportError ? (
                <p className="article-publisher__ai-status article-publisher__ai-status--error" role="alert">
                  {aiImportError}
                </p>
              ) : aiImportFeedback ? (
                <p className="article-publisher__ai-status" role="status">
                  {aiImportFeedback}
                </p>
              ) : null}
            </div>
          </CollapsibleArticleSection>

          <section
            className="card article-publisher__section"
            aria-labelledby="article-content-title"
          >
            <div className="article-publisher__section-heading">
              <div>
                <h2 id="article-content-title">المقال</h2>
                <p>اكتب النص مرة واحدة ليظهر في الموقع والنشرة.</p>
              </div>
            </div>
            <div className="article-publisher__fields article-publisher__fields--identity">
              <Field label="عنوان المقال (مطلوب)">
                <Input
                  aria-label="عنوان المقال"
                  aria-invalid={Boolean(validationErrors.title)}
                  aria-describedby={validationErrors.title ? titleErrorId : undefined}
                  value={fields.title}
                  readOnly={!canManage}
                  disabled={busy}
                  maxLength={180}
                  onChange={(event) => changeField('title', event.target.value)}
                  required
                />
                {validationErrors.title ? (
                  <span id={titleErrorId} className="field__error">
                    {validationErrors.title}
                  </span>
                ) : null}
              </Field>
              <Field label="المعرّف في الرابط" hint="حروف إنجليزية صغيرة وأرقام وشرطات فقط.">
                <Input
                  dir="ltr"
                  value={fields.slug}
                  readOnly={!canManage}
                  disabled={busy}
                  onChange={(event) => changeField('slug', event.target.value)}
                  placeholder="future-of-work"
                  autoCapitalize="none"
                  autoComplete="off"
                  spellCheck={false}
                  required
                />
              </Field>
              <Field
                label="ملخص المقال (اختياري)"
                hint="يظهر تحت العنوان وفي قوائم المحتوى. اتركه فارغًا إذا لم تحتج إليه."
              >
                <Textarea
                  aria-label="ملخص المقال"
                  value={fields.excerpt}
                  readOnly={!canManage}
                  disabled={busy}
                  maxLength={500}
                  onChange={(event) => changeField('excerpt', event.target.value)}
                />
              </Field>
            </div>
            <fieldset className="article-author-editor">
              <legend>كاتب المقال</legend>
              <div className="article-author-editor__fields">
                <Field
                  label="نوع الكاتب (مطلوب)"
                  hint="أعضاء الفريق هنا من فريق الاستوديو، وليسوا من المشتركين أو المستمعين."
                >
                  <Select
                    value={authorFields.type}
                    disabled={!canManage || busy}
                    onChange={(event) => {
                      const type = event.target.value as ArticleAuthorFields['type'];
                      changeAuthor({
                        ...authorFields,
                        type,
                        studioMemberId:
                          type === 'studio_member'
                            ? authorFields.studioMemberId ||
                              availableAuthorCandidates[0]?.studioMemberId ||
                              ''
                            : authorFields.studioMemberId,
                      });
                    }}
                  >
                    <option value="studio_member">عضو في فريق الاستوديو</option>
                    <option value="custom">كاتب آخر</option>
                  </Select>
                </Field>

                {authorFields.type === 'studio_member' ? (
                  <Field label="عضو الفريق (مطلوب)">
                    <Select
                      value={authorFields.studioMemberId}
                      disabled={
                        !canManage ||
                        busy ||
                        (authorDirectoryLoading && availableAuthorCandidates.length === 0)
                      }
                      required
                      aria-invalid={Boolean(validationErrors.author)}
                      aria-describedby={validationErrors.author ? authorErrorId : undefined}
                      onChange={(event) =>
                        changeAuthor({ ...authorFields, studioMemberId: event.target.value })
                      }
                    >
                      <option value="" disabled>
                        {authorDirectoryLoading ? 'جارٍ تحميل أعضاء الفريق…' : 'اختر عضوًا'}
                      </option>
                      {availableAuthorCandidates.map((candidate) => (
                        <option key={candidate.studioMemberId} value={candidate.studioMemberId}>
                          {candidate.displayName}
                        </option>
                      ))}
                    </Select>
                    {validationErrors.author ? (
                      <span id={authorErrorId} className="field__error">
                        {validationErrors.author}
                      </span>
                    ) : null}
                  </Field>
                ) : (
                  <Field label="اسم الكاتب (مطلوب)" hint="سيظهر هذا الاسم للقراء.">
                    <Input
                      dir="auto"
                      value={authorFields.customDisplayName}
                      readOnly={!canManage}
                      disabled={busy}
                      required
                      minLength={2}
                      maxLength={100}
                      placeholder="سارة العيسى"
                      aria-invalid={Boolean(validationErrors.author)}
                      aria-describedby={validationErrors.author ? authorErrorId : undefined}
                      onChange={(event) =>
                        changeAuthor({
                          ...authorFields,
                          customDisplayName: event.target.value,
                        })
                      }
                    />
                    {validationErrors.author ? (
                      <span id={authorErrorId} className="field__error">
                        {validationErrors.author}
                      </span>
                    ) : null}
                  </Field>
                )}
                <Field
                  className="article-author-editor__placement"
                  label="موضع اسم الكاتب (مطلوب)"
                  hint="يُطبّق على المقال والنشرة الأسبوعية."
                >
                  <Select
                    value={fields.authorPlacement}
                    disabled={!canManage || busy}
                    required
                    onChange={(event) =>
                      changeField('authorPlacement', event.target.value as ArticleAuthorPlacement)
                    }
                  >
                    <option value="after_title">بعد العنوان</option>
                    <option value="end">نهاية المقال</option>
                  </Select>
                </Field>
              </div>
              {authorFields.type === 'studio_member' &&
              (authorDirectoryLoading || authorDirectoryError || authorCandidates.length === 0) ? (
                <div
                  className={`article-author-editor__status ${authorDirectoryError ? 'article-author-editor__status--error' : ''}`.trim()}
                  role={authorDirectoryError ? 'alert' : 'status'}
                  aria-live={authorDirectoryError ? 'assertive' : 'polite'}
                >
                  <p>
                    {authorDirectoryLoading
                      ? 'جارٍ تحميل أعضاء فريق الاستوديو…'
                      : authorDirectoryError ||
                        (currentAuthorCandidate
                          ? 'لا يوجد أعضاء آخرون متاحون. يمكنك الاحتفاظ بالكاتب المحفوظ أو اختيار كاتب آخر.'
                          : 'لا يوجد أعضاء متاحون للاختيار. اختر كاتبًا آخر وأدخل اسمه.')}
                  </p>
                  {!authorDirectoryLoading ? (
                    <Button
                      type="button"
                      disabled={!canManage || busy}
                      onClick={() => changeAuthor({ ...authorFields, type: 'custom' })}
                    >
                      اختيار كاتب آخر
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </fieldset>
            <div className="article-publisher__editor-field">
              <span className="field__label">محتوى المقال (مطلوب)</span>
              <RichTextEditor
                key={richTextRevision}
                initialDocument={richText.document}
                disabled={!canManage || busy}
                required
                invalid={Boolean(validationErrors.content)}
                describedBy={
                  validationErrors.content ? `${contentHelpId} ${contentErrorId}` : contentHelpId
                }
                mediaAssets={mediaAssets}
                refreshMedia={refreshMedia}
                uploadImage={async (command) => {
                  const uploaded = await uploadArticleImage(command);
                  setMediaAssets((current) => mergeMediaAssets(current, [uploaded]));
                  return uploaded;
                }}
                onChange={(value) => {
                  setRichText(value);
                  if (hasArticleContent(value.document)) {
                    setValidationErrors((current) => ({ ...current, content: undefined }));
                  }
                  setDirty(true);
                  setFeedback('');
                  setEmailPreview(null);
                }}
              />
              <p id={contentHelpId} className="field__hint">
                أضف نصًا أو صورة أو فيديو واحدًا على الأقل.
              </p>
              {validationErrors.content ? (
                <p id={contentErrorId} className="field__error">
                  {validationErrors.content}
                </p>
              ) : null}
              {mediaLoadError ? (
                <p className="article-publisher__inline-warning" role="status">
                  {mediaLoadError}
                </p>
              ) : null}
            </div>
          </section>

          <CollapsibleArticleSection
            id="article-media-title"
            title="صورة الغلاف"
            description="ارفع صورة من جهازك، أو استخدم رابطًا بديلًا عند الحاجة."
            open={openSections.cover}
            onToggle={() => toggleSection('cover')}
          >
            <div className="article-publisher__fields article-cover-manager">
              <div className="article-cover-upload" aria-busy={coverUploadProgress !== null}>
                {canManage ? (
                  <div className="article-cover-upload__picker">
                    <button
                      ref={coverPickerButtonRef}
                      type="button"
                      className="button button--primary"
                      disabled={busy}
                      onClick={() => coverFileInputRef.current?.click()}
                    >
                      اختيار صورة غلاف
                    </button>
                    <input
                      ref={coverFileInputRef}
                      id={coverFileInputId}
                      className="sr-only"
                      type="file"
                      tabIndex={-1}
                      aria-label="ملف صورة الغلاف"
                      accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                      disabled={busy}
                      onChange={(event) => void selectCoverFile(event)}
                    />
                    <span>{selectedCoverImage?.file.name ?? 'لم تختر صورة بعد.'}</span>
                    <small>
                      JPEG أو PNG. بعد الاختيار ستقصّ الغلاف بنسبة 16:9. يجب أن تكفي أبعاد الصورة
                      لقصّ غلاف لا يقل عن 1200 × 675 بكسل، ونوصي بـ 1600 × 900. الحد الأقصى 10 م.ب
                      و24 مليون بكسل إجمالًا.
                    </small>
                  </div>
                ) : null}

                {selectedCoverImage && selectedCoverPreviewUrl ? (
                  <figure className="article-cover-preflight">
                    <img
                      src={selectedCoverPreviewUrl}
                      alt={fields.coverAlt.trim() || 'معاينة صورة الغلاف قبل الرفع'}
                    />
                    <figcaption role="status" aria-live="polite">
                      صورة مطابقة لمتطلبات الغلاف. معاينة القص بنسبة 16:9، والأبعاد{' '}
                      <bdi dir="ltr">
                        {formatArabicInteger(selectedCoverImage.width)} ×{' '}
                        {formatArabicInteger(selectedCoverImage.height)}
                      </bdi>{' '}
                      بكسل.
                    </figcaption>
                  </figure>
                ) : fields.coverUrl.trim() ? (
                  <figure className="article-cover-preview">
                    <img src={fields.coverUrl.trim()} alt={fields.coverAlt.trim()} loading="lazy" />
                    <figcaption>معاينة صورة الغلاف</figcaption>
                  </figure>
                ) : null}

                <Field
                  label="الوصف البديل (مطلوب)"
                  hint="يصف الغلاف لقارئ الشاشة ويظهر إذا تعذّر تحميله."
                >
                  <Input
                    value={fields.coverAlt}
                    readOnly={!canManage}
                    disabled={busy}
                    maxLength={240}
                    required={Boolean(fields.coverUrl.trim() || selectedCoverImage)}
                    onChange={(event) => {
                      changeField('coverAlt', event.target.value);
                      if (selectedCoverImage) setCoverUploadError('');
                    }}
                  />
                </Field>

                {canManage ? (
                  <>
                    {selectedCoverImage ? (
                      <Button
                        type="button"
                        variant="primary"
                        className="article-cover-upload__action"
                        disabled={busy || !fields.coverAlt.trim()}
                        onClick={() => void uploadCoverImage()}
                      >
                        رفع صورة الغلاف
                      </Button>
                    ) : null}
                    {coverUploadProgress !== null ? (
                      <div className="article-cover-upload__progress" aria-live="polite">
                        <progress
                          value={coverUploadProgress}
                          max={100}
                          aria-label="تقدم رفع الغلاف"
                        />
                        <span>{formatArabicInteger(coverUploadProgress)}%</span>
                      </div>
                    ) : null}
                    {coverUploadError ? (
                      <p className="notice notice--error" role="alert">
                        {coverUploadError}
                      </p>
                    ) : coverUploadFeedback ? (
                      <p className="notice" role="status">
                        {coverUploadFeedback}
                      </p>
                    ) : null}
                  </>
                ) : null}
              </div>

              <details className="article-cover-advanced">
                <summary>استخدام رابط خارجي بدل الرفع</summary>
                <div>
                  <Field
                    label="رابط صورة الغلاف"
                    hint="لصورة مستضافة خارج مكتبة مختلف. راجع المعاينة، فالأبعاد لا تُفحص تلقائيًا."
                  >
                    <Input
                      dir="ltr"
                      type="text"
                      inputMode="url"
                      value={fields.coverUrl}
                      readOnly={!canManage}
                      disabled={busy}
                      onChange={(event) => {
                        setSelectedCoverImage(null);
                        changeField('coverUrl', event.target.value);
                        setCoverUploadError('');
                        setCoverUploadFeedback('');
                      }}
                      placeholder="https://example.com/cover.jpg"
                    />
                  </Field>
                </div>
              </details>
            </div>
          </CollapsibleArticleSection>

          <CollapsibleArticleSection
            id="article-preview-title"
            title="المعاينة"
            description="راجع شكل المقال والبريد قبل النشر أو التصدير."
            open={openSections.preview}
            onToggle={() => toggleSection('preview')}
            className="article-publisher__section--preview"
          >
            <div className="article-publisher__preview-toolbar">
              <div
                className="article-publisher__preview-tabs"
                role="group"
                aria-label="قناة المعاينة"
              >
                <button
                  type="button"
                  aria-pressed={previewChannel === 'web'}
                  onClick={() => setPreviewChannel('web')}
                >
                  المقال
                </button>
                <button
                  type="button"
                  aria-pressed={previewChannel === 'newsletter'}
                  onClick={() => setPreviewChannel('newsletter')}
                >
                  النشرة الأسبوعية
                </button>
              </div>
            </div>

            {previewChannel === 'web' ? (
              <article className="article-web-preview">
                {fields.coverUrl.trim() ? (
                  <img
                    className="article-web-preview__cover"
                    src={fields.coverUrl.trim()}
                    alt={fields.coverAlt.trim() || displayTitle}
                  />
                ) : null}
                <p className="article-web-preview__source">مختلف</p>
                <h2>{displayTitle}</h2>
                {fields.authorPlacement === 'after_title' ? (
                  <p className="article-web-preview__byline">
                    بقلم <bdi dir="auto">{displayAuthor}</bdi>
                  </p>
                ) : null}
                {explicitExcerpt ? (
                  <p className="article-web-preview__excerpt">{explicitExcerpt}</p>
                ) : null}
                <div className="article-rendered-content">
                  <ArticleContentPreview
                    document={richText.document}
                    assets={mediaAssets}
                    channel="web"
                  />
                </div>
                {fields.authorPlacement === 'end' ? (
                  <p className="article-web-preview__byline article-web-preview__byline--end">
                    بقلم <bdi dir="auto">{displayAuthor}</bdi>
                  </p>
                ) : null}
              </article>
            ) : emailPreview ? (
              <div className="article-email-frame">
                <iframe title="معاينة قالب النشرة" sandbox="" srcDoc={emailPreview.html} />
              </div>
            ) : (
              <div className="article-newsletter-preview">
                <article className="article-newsletter-preview__message">
                  <header>
                    <span>عنوان الرسالة</span>
                    <h2>{fields.newsletterSubject.trim() || displayTitle}</h2>
                    <p>{fields.newsletterPreheader.trim() || derivedSummary}</p>
                  </header>
                  <div className="article-newsletter-preview__brand">مختلف</div>
                  {fields.coverUrl.trim() ? (
                    <img
                      className="article-newsletter-preview__cover"
                      src={fields.coverUrl.trim()}
                      alt={fields.coverAlt.trim() || displayTitle}
                    />
                  ) : null}
                  <h3>{displayTitle}</h3>
                  {fields.authorPlacement === 'after_title' ? (
                    <p className="article-web-preview__byline">
                      بقلم <bdi dir="auto">{displayAuthor}</bdi>
                    </p>
                  ) : null}
                  <div className="article-rendered-content">
                    <ArticleContentPreview
                      document={richText.document}
                      assets={mediaAssets}
                      channel="email"
                    />
                  </div>
                  {fields.authorPlacement === 'end' ? (
                    <p className="article-web-preview__byline article-web-preview__byline--end">
                      بقلم <bdi dir="auto">{displayAuthor}</bdi>
                    </p>
                  ) : null}
                </article>
              </div>
            )}

            {previewChannel === 'newsletter' ? (
              <div className="article-publisher__preview-footer">
                <p>
                  {mailchimp?.mode === 'simulation'
                    ? 'هذه معاينة محلية تمثيلية. لا تُرسل الرسالة خارج الجهاز.'
                    : 'المعاينة المحلية تتبع المحتوى الحالي. قالب الخادم يتاح بعد الحفظ.'}
                </p>
                <div className="article-publisher__preview-actions">
                  {canManage ? (
                    <NewsletterExportMenu
                      disabled={!workingArticleId || dirty || busy || !fields.newsletterEnabled}
                      preparing={operation === 'preview'}
                      previewReady={Boolean(emailPreview)}
                      onPrepare={prepareNewsletterExport}
                      onCopy={copyNewsletter}
                      onDownload={downloadNewsletter}
                    />
                  ) : null}
                </div>
              </div>
            ) : null}
          </CollapsibleArticleSection>
        </main>

        <aside className="article-publisher__aside">
          <CollapsibleArticleSection
            id="article-seo-title"
            title="إعدادات البحث"
            description="تحكم في ظهور المقال عند مشاركته وفي نتائج البحث."
            open={openSections.seo}
            onToggle={() => toggleSection('seo')}
          >
            <div className="article-publisher__fields">
              <Field label="عنوان نتائج البحث">
                <Input
                  value={fields.seoTitle}
                  readOnly={!canManage}
                  disabled={busy}
                  maxLength={70}
                  onChange={(event) => changeField('seoTitle', event.target.value)}
                />
                <SeoCounter value={fields.seoTitle} maximum={70} />
              </Field>
              <Field label="وصف نتائج البحث">
                <Textarea
                  value={fields.seoDescription}
                  readOnly={!canManage}
                  disabled={busy}
                  maxLength={170}
                  onChange={(event) => changeField('seoDescription', event.target.value)}
                />
                <SeoCounter value={fields.seoDescription} maximum={170} />
              </Field>
              <Field label="الرابط الأساسي">
                <Input
                  dir="ltr"
                  type="url"
                  value={fields.canonicalUrl}
                  readOnly={!canManage}
                  disabled={busy}
                  onChange={(event) => changeField('canonicalUrl', event.target.value)}
                  placeholder="https://mukhtalif.com/articles/..."
                />
              </Field>
              <Field label="عنوان المشاركة">
                <Input
                  value={fields.socialTitle}
                  readOnly={!canManage}
                  disabled={busy}
                  maxLength={100}
                  onChange={(event) => changeField('socialTitle', event.target.value)}
                />
              </Field>
              <Field label="وصف المشاركة">
                <Textarea
                  value={fields.socialDescription}
                  readOnly={!canManage}
                  disabled={busy}
                  maxLength={200}
                  onChange={(event) => changeField('socialDescription', event.target.value)}
                />
              </Field>
              <Field label="صورة المشاركة">
                <Input
                  dir="ltr"
                  type="url"
                  value={fields.socialImageUrl}
                  readOnly={!canManage}
                  disabled={busy}
                  onChange={(event) => changeField('socialImageUrl', event.target.value)}
                />
              </Field>
              <label className="article-publisher__check-row">
                <input
                  type="checkbox"
                  checked={fields.noIndex}
                  disabled={!canManage || busy}
                  onChange={(event) => changeField('noIndex', event.target.checked)}
                />
                <span>
                  <b>منع الفهرسة</b>
                  <small>اطلب من محركات البحث عدم فهرسة المقال.</small>
                </span>
              </label>
            </div>
            <div className="article-search-preview" aria-label="معاينة نتيجة البحث">
              <span dir="ltr">mukhtalif.com/articles/{fields.slug.trim() || 'article'}</span>
              <h3>{fields.seoTitle.trim() || displayTitle}</h3>
              <p>{fields.seoDescription.trim() || derivedSummary || 'أضف وصفًا واضحًا للمقال.'}</p>
            </div>
          </CollapsibleArticleSection>

          <CollapsibleArticleSection
            id="newsletter-settings-title"
            title="النشرة الأسبوعية"
            description="يُستخدم محتوى المقال نفسه في رسالة Mailchimp."
            open={openSections.newsletter}
            onToggle={() => toggleSection('newsletter')}
          >
            <div className="article-publisher__fields">
              <label className="article-publisher__check-row">
                <input
                  type="checkbox"
                  checked={fields.newsletterEnabled}
                  disabled={!canManage || busy || newsletterFieldsLocked || campaignExists}
                  onChange={(event) => changeField('newsletterEnabled', event.target.checked)}
                />
                <span>
                  <b>إعداد نشرة لهذا المقال</b>
                  <small>يبقى نشر المقال وإرسال الرسالة خطوتين منفصلتين.</small>
                </span>
              </label>
              <Field label="عنوان الرسالة">
                <Input
                  value={fields.newsletterSubject}
                  readOnly={!canManage || newsletterFieldsLocked}
                  disabled={busy || !fields.newsletterEnabled || newsletterFieldsLocked}
                  maxLength={150}
                  onChange={(event) => changeField('newsletterSubject', event.target.value)}
                />
                <SeoCounter value={fields.newsletterSubject} maximum={150} />
              </Field>
              <Field label="النص التمهيدي" hint="يظهر بجانب عنوان الرسالة في صندوق الوارد.">
                <Textarea
                  value={fields.newsletterPreheader}
                  readOnly={!canManage || newsletterFieldsLocked}
                  disabled={busy || !fields.newsletterEnabled || newsletterFieldsLocked}
                  maxLength={200}
                  onChange={(event) => changeField('newsletterPreheader', event.target.value)}
                />
              </Field>
            </div>

            <div
              className="article-mailchimp-state"
              role="status"
              aria-live="polite"
              aria-busy={mailchimpLoading}
            >
              <b>Mailchimp</b>
              {mailchimp?.mode === 'simulation' ? (
                <p>محاكاة محلية للعرض. لا تُرسل الرسائل خارج هذا الجهاز.</p>
              ) : mailchimpError ? (
                <p>{mailchimpError}</p>
              ) : mailchimpLoading || !mailchimp ? (
                <p>جارٍ التحقق من الإعداد…</p>
              ) : mailchimp.configured ? (
                <p>
                  إعداد Mailchimp محفوظ
                  {mailchimp.fromName ? ` باسم ${mailchimp.fromName}` : ''}
                  {mailchimp.replyTo ? (
                    <>
                      {' '}
                      والرد إلى <bdi dir="ltr">{mailchimp.replyTo}</bdi>
                    </>
                  ) : null}
                  .
                </p>
              ) : (
                <p>أضف إعداد Mailchimp في الخادم قبل إنشاء حملة أو إرسالها.</p>
              )}
              {currentArticle ? (
                <p>الحالة: {newsletterStatusLabel(currentArticle, dirty)}</p>
              ) : null}
              {articleVersionStale ? (
                <p>تغيّر المقال في جلسة أخرى. حدّث الصفحة قبل مزامنة النشرة أو إرسالها.</p>
              ) : null}
              {newsletterSyncUnknown ? (
                <p>راجع الحملة في Mailchimp قبل أي محاولة أخرى، ثم اطلب من المشرف معالجة الحالة.</p>
              ) : null}
              {newsletterSyncing ? (
                <p>يجري تحديث المسودة الآن. انتظر قليلًا ثم حدّث الصفحة قبل المتابعة.</p>
              ) : null}
              {mailchimp?.audienceName && mailchimp.audienceCount !== undefined ? (
                <p>
                  الجمهور: <bdi dir="auto">{mailchimp.audienceName}</bdi>. إجمالي أعضاء الجمهور:{' '}
                  {formatArabicInteger(mailchimp.audienceCount)}.
                </p>
              ) : mailchimp?.mode === 'live' && mailchimp.configured ? (
                <p>تعذّر التحقق من الحساب والجمهور. الإرسال معطّل حتى يتاح الاتصال.</p>
              ) : null}
              {mailchimp?.mode === 'live' &&
              mailchimp.configured &&
              mailchimp.audienceName &&
              mailchimp.recipientTag &&
              !mailchimp.audienceConfirmationToken ? (
                <p>تعذّر تثبيت بيانات الجمهور. الإرسال معطّل حتى يعيد الخادم التحقق منها.</p>
              ) : null}
              {mailchimp?.recipientTag && mailchimp.recipientCount !== undefined ? (
                <p>
                  شريحة الإرسال: <bdi dir="ltr">{mailchimp.recipientTag}</bdi>. المستلمون المؤهلون:{' '}
                  {formatArabicInteger(mailchimp.recipientCount)}.
                </p>
              ) : mailchimp?.mode === 'live' &&
                mailchimp.configured &&
                mailchimp.audienceName &&
                mailchimp.audienceCount !== undefined ? (
                <p>تعذّر التحقق من شريحة الإرسال. الإرسال معطّل حتى تتوفر بياناتها.</p>
              ) : null}
              {mailchimp?.recipientCount === 0 ? (
                <p>لا تضم شريحة الإرسال مستلمين مؤهلين حاليًا.</p>
              ) : null}
              {newsletterSent && currentArticle?.newsletter.sentAt ? (
                <p>
                  أُرسلت في {DATE_FORMATTER.format(new Date(currentArticle.newsletter.sentAt))}.
                </p>
              ) : null}
              <div className="article-mailchimp-state__refresh">
                <Button
                  type="button"
                  disabled={busy || mailchimpLoading}
                  onClick={() => void refreshMailchimp()}
                >
                  {mailchimpLoading ? 'جارٍ التحقق…' : 'إعادة التحقق'}
                </Button>
                <small>يقرأ حالة الحساب والجمهور وشريحة الإرسال فقط، ولا ينشئ حملة أو يرسل رسالة.</small>
              </div>
            </div>

            {canManage && !newsletterSent ? (
              <div className="article-publisher__newsletter-actions">
                <Button
                  type="button"
                  disabled={
                    busy ||
                    !mailchimpTargetVerified ||
                    !fields.newsletterEnabled ||
                    newsletterSyncUnknown ||
                    newsletterSyncing ||
                    articleVersionStale
                  }
                  onClick={() => void syncCampaign()}
                >
                  {operation === 'campaign'
                    ? 'جارٍ التحديث…'
                    : campaignExists
                      ? 'تحديث مسودة Mailchimp'
                      : 'إنشاء مسودة Mailchimp'}
                </Button>
                {currentArticle?.newsletter.status === 'sending' ? (
                  <Button
                    type="button"
                    variant="primary"
                    disabled={busy}
                    onClick={() => void reconcileNewsletter()}
                  >
                    {operation === 'reconcile' ? 'جارٍ التحقق…' : 'التحقق من حالة الإرسال'}
                  </Button>
                ) : (
                  <button
                    ref={sendTriggerRef}
                    type="button"
                    className="button button--primary"
                    disabled={busy || !canSend}
                    onClick={openSendConfirmation}
                  >
                    إرسال النشرة
                  </button>
                )}
              </div>
            ) : null}
          </CollapsibleArticleSection>
        </aside>

        {canManage ? (
          <footer className="card article-publisher__footer">
            <div className="article-publisher__feedback" aria-live="polite">
              {error ? (
                <p className="notice notice--error" role="alert">
                  {error}
                </p>
              ) : feedback ? (
                <p className="notice" role="status">
                  {feedback}
                </p>
              ) : dirty ? (
                <p>توجد تغييرات غير محفوظة.</p>
              ) : (
                <p>كل التغييرات محفوظة.</p>
              )}
            </div>
            <div className="article-publisher__footer-actions">
              <Button type="submit" variant="primary" disabled={busy}>
                {operation === 'save' ? 'جارٍ الحفظ…' : 'حفظ المسودة'}
              </Button>
              <Button type="button" disabled={busy} onClick={() => void publishWeb()}>
                {operation === 'publish'
                  ? 'جارٍ التحديث…'
                  : currentArticle?.status === 'published'
                    ? 'إلغاء نشر المقال'
                    : 'نشر المقال'}
              </Button>
            </div>
          </footer>
        ) : null}
      </form>

      <ArticleCoverCropDialog
        source={pendingCoverSource}
        onCancel={() => setPendingCoverSource(null)}
        onApply={applyCoverCrop}
        onClosed={() => coverPickerButtonRef.current?.focus()}
      />

      <dialog
        ref={sendDialogRef}
        className="article-send-confirm"
        aria-labelledby="send-newsletter-title"
        onCancel={(event) => {
          event.preventDefault();
          setSendConfirmation(null);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          setSendConfirmation(null);
        }}
        onClose={() => {
          setSendConfirmation(null);
          sendTriggerRef.current?.focus();
        }}
      >
        <div className="article-send-confirm__panel">
          <h2 id="send-newsletter-title">إرسال النشرة؟</h2>
          <p>
            ستُرسل «{sendConfirmation?.subject}» إلى شريحة {'«'}
            <bdi dir="ltr">{sendConfirmation?.recipientTag}</bdi>
            {'»'} ضمن جمهور {'«'}
            <bdi dir="auto">{sendConfirmation?.audienceName}</bdi>
            {'»'} في Mailchimp. لا يمكن التراجع بعد بدء الإرسال.
          </p>
          <p>
            شريحة الإرسال: <bdi dir="ltr">{sendConfirmation?.recipientTag ?? 'غير محددة'}</bdi>
            {`، المستلمون المؤهلون: ${
              sendConfirmation?.recipientCount === undefined
                ? 'عدد غير متاح'
                : formatArabicInteger(sendConfirmation.recipientCount)
            }. `}
            الجمهور الكامل: <bdi dir="auto">{sendConfirmation?.audienceName ?? 'غير محدد'}</bdi>
            {`، إجمالي أعضائه: ${
              sendConfirmation?.audienceCount === undefined
                ? 'عدد غير متاح'
                : formatArabicInteger(sendConfirmation.audienceCount)
            }.`}
          </p>
          {sendConfirmation?.fromName || sendConfirmation?.replyTo ? (
            <p>
              المرسل: {sendConfirmation.fromName ?? 'غير محدد'}
              {sendConfirmation.replyTo ? (
                <>
                  {' '}
                  والرد إلى <bdi dir="ltr">{sendConfirmation.replyTo}</bdi>.
                </>
              ) : null}
            </p>
          ) : null}
          {sendConfirmation?.mode === 'simulation' ? (
            <p className="article-send-confirm__local-note">
              هذه محاكاة محلية، ولن تغادر الرسالة جهازك.
            </p>
          ) : null}
          <div className="article-send-confirm__actions">
            <button
              ref={confirmButtonRef}
              type="button"
              className="button button--primary"
              onClick={() => void sendNewsletter()}
            >
              تأكيد الإرسال
            </button>
            <Button type="button" onClick={() => setSendConfirmation(null)}>
              إلغاء
            </Button>
          </div>
        </div>
      </dialog>
    </div>
  );
}

/** Remounts route-owned editor state when React Router reuses the detail route. */
export function ArticleEditorRouteView() {
  const { articleId } = useParams<{ articleId: string }>();
  return <ArticleEditorView key={articleId ?? 'new'} />;
}
