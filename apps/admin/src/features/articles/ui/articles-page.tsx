import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { adminPaths, canManagePage, useAdminAuth, useStudioData } from '@/application';
import { isAdminRepositoryError } from '@/data';
import {
  Button,
  Input,
  PageHeader,
  StatusBadge,
} from '@/shared/ui/primitives';
import {
  formatArabicInteger,
  formatArticleTimeline,
  getArticleTransitionActions,
  matchesArabicSearch,
  type Article,
  type ArticleId,
  type ArticleStatus,
} from '@/lib';
import {
  AI_ARTICLE_SKILL_DOWNLOAD_URL,
  AI_ARTICLE_SKILL_FILENAME,
} from './article-ai-skill';

type ArticleFilter = 'all' | ArticleStatus;

const FILTERS: ReadonlyArray<{ value: ArticleFilter; label: string }> = [
  { value: 'all', label: 'الكل' },
  { value: 'draft', label: 'مسودات' },
  { value: 'published', label: 'منشورة' },
];

interface TransitionState {
  readonly articleId: ArticleId;
  readonly targetStatus: ArticleStatus;
}

interface RowError {
  readonly articleId: ArticleId;
  readonly message: string;
}

function parseArticleFilter(value: string | null): ArticleFilter {
  return FILTERS.some((filter) => filter.value === value) ? (value as ArticleFilter) : 'all';
}

function articleOperationErrorMessage(error: unknown): string {
  if (!isAdminRepositoryError(error)) {
    return 'تعذّر تحديث حالة المقال. حاول مرة أخرى.';
  }

  switch (error.code) {
    case 'CONFLICT':
      return error.context?.remoteCode === 'ARTICLE_VERSION_CONFLICT'
        ? 'تغيّرت حالة المقال في جلسة أخرى. حدّث الصفحة ثم حاول مرة أخرى.'
        : 'تعذّر تحديث الحالة بسبب تعارض في نسخة المقال.';
    case 'UNAUTHENTICATED':
      return 'انتهت جلسة الدخول. سجّل الدخول ثم حاول مرة أخرى.';
    case 'FORBIDDEN':
      return 'ليس لديك صلاحية لتحديث حالة المقال.';
    case 'NETWORK':
    case 'REMOTE_UNAVAILABLE':
      return 'تعذّر الاتصال بالخادم. تحقق من اتصالك ثم حاول مرة أخرى.';
    default:
      return 'تعذّر تحديث حالة المقال. حاول مرة أخرى.';
  }
}

function newsletterDirectoryStatus(article: Article): string {
  if (!article.newsletter.enabled) return 'غير مفعّلة';
  if (article.newsletter.status === 'sent') return 'أُرسلت';
  if (article.newsletter.status === 'sending') return 'جارٍ الإرسال';
  if (article.newsletter.status === 'syncing') return 'جارٍ تحديث المسودة';
  if (article.newsletter.status === 'sync_unknown') return 'نتيجة المزامنة غير مؤكدة';
  if (article.newsletter.needsSync) return 'تحتاج تحديثًا';
  if (article.newsletter.status === 'campaign_created') return 'جاهزة في Mailchimp';
  return 'مسودة';
}

export function ArticlesView() {
  const { viewer } = useAdminAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, transitionArticleStatus } = useStudioData();
  const canManageArticles = viewer ? canManagePage(viewer, 'articles') : false;
  const status = parseArticleFilter(searchParams.get('status'));
  const query = searchParams.get('q') ?? '';
  const [pendingTransition, setPendingTransition] = useState<TransitionState | null>(null);
  const [rowError, setRowError] = useState<RowError | null>(null);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    let changed = false;

    if (next.has('status') && status === 'all') {
      next.delete('status');
      changed = true;
    }
    if (next.has('q') && query === '') {
      next.delete('q');
      changed = true;
    }

    if (changed) setSearchParams(next, { replace: true });
  }, [query, searchParams, setSearchParams, status]);

  function setFilterParam(name: 'status' | 'q', value: string, defaultValue: string) {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value === defaultValue) next.delete(name);
        else next.set(name, value);
        return next;
      },
      { replace: true },
    );
  }

  const counts = useMemo(
    () => ({
      all: data.articles.length,
      draft: data.articles.filter((article) => article.status === 'draft').length,
      published: data.articles.filter((article) => article.status === 'published').length,
    }),
    [data.articles],
  );
  const filteredArticles = useMemo(
    () =>
      data.articles.filter(
        (article) =>
          (status === 'all' || article.status === status) &&
          matchesArabicSearch(query, article.title, article.author.displayName),
      ),
    [data.articles, query, status],
  );

  async function updateArticleStatus(articleId: ArticleId, targetStatus: ArticleStatus) {
    if (!canManageArticles || pendingTransition) return;

    setPendingTransition({ articleId, targetStatus });
    setRowError(null);
    try {
      const article = data.articles.find((candidate) => candidate.id === articleId);
      if (!article) return;
      await transitionArticleStatus(articleId, targetStatus, article.version);
    } catch (cause) {
      setRowError({
        articleId,
        message: articleOperationErrorMessage(cause),
      });
    } finally {
      setPendingTransition(null);
    }
  }

  return (
    <>
      <PageHeader
        title="المقالات"
        action={
          canManageArticles ? (
            <>
              <Link to={adminPaths.articleNew} className="button button--primary">
                مقال جديد
              </Link>
              <a
                className="text-link"
                href={AI_ARTICLE_SKILL_DOWNLOAD_URL}
                download={AI_ARTICLE_SKILL_FILENAME}
              >
                تنزيل سكيل المقالات
              </a>
            </>
          ) : null
        }
      />

      <div className="filters-layout">
        <aside className="filter-rail" aria-label="تصفية المقالات حسب الحالة">
          {FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              className={`filter-rail__item ${status === filter.value ? 'filter-rail__item--active' : ''}`}
              aria-pressed={status === filter.value}
              onClick={() => setFilterParam('status', filter.value, 'all')}
            >
              <span>{filter.label}</span>
              <span className="filter-rail__count">
                {formatArabicInteger(counts[filter.value])}
              </span>
            </button>
          ))}
        </aside>

        <section className="card" aria-label="قائمة المقالات">
          <div className="search-bar search-bar--single">
            <label>
              <span className="sr-only">البحث في المقالات</span>
              <Input
                type="search"
                value={query}
                onChange={(event) => setFilterParam('q', event.target.value, '')}
                placeholder="ابحث بالعنوان أو الكاتب…"
              />
            </label>
          </div>
          {filteredArticles.length === 0 ? (
            <p className="empty-state">
              {query
                ? 'لا توجد مقالات تطابق بحثك. جرّب كلمة أخرى.'
                : 'لا توجد مقالات في هذه الحالة.'}
            </p>
          ) : (
            <div className="list-body">
              {filteredArticles.map((article) => (
                <article
                  className="article-row"
                  key={article.id}
                  aria-busy={pendingTransition?.articleId === article.id}
                >
                  <div className="row-copy">
                    <Link className="text-link row-copy__title" to={adminPaths.article(article.id)}>
                      {article.title}
                    </Link>
                    <p className="row-copy__meta">
                      <bdi dir="auto">{article.author.displayName}</bdi> ·{' '}
                      {formatArticleTimeline(article)}
                    </p>
                    <p className="row-copy__channel">
                      النشرة: {newsletterDirectoryStatus(article)}
                    </p>
                  </div>
                  {canManageArticles ? (
                    <div
                      className="row-actions"
                      aria-label={`إجراءات ${article.title}`}
                      aria-live="polite"
                    >
                      {getArticleTransitionActions(article.status).map((action) => (
                        <Button
                          key={action.to}
                          type="button"
                          disabled={pendingTransition !== null}
                          onClick={() => {
                            void updateArticleStatus(article.id, action.to);
                          }}
                        >
                          {pendingTransition?.articleId === article.id &&
                          pendingTransition.targetStatus === action.to
                            ? 'جارٍ التحديث…'
                            : action.label}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                  <StatusBadge
                    status={article.status}
                    label={article.status === 'published' ? 'منشور' : 'مسودة'}
                  />
                  {rowError?.articleId === article.id ? (
                    <p className="notice notice--error inline-create-grid__full" role="alert">
                      {rowError.message}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

export { ArticleEditorView as CreateArticleView } from './article-editor-page';
