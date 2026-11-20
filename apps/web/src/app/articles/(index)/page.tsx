import Link from 'next/link';
import type { Metadata } from 'next';
import type { PaginatedList, PublishedArticle } from '@mukhtalif/types';
import { ArticleTiles } from '@/components/article-tile';
import { dateTimeAttribute, formatDate } from '@/components/formatting';
import { NewsletterCards } from '@/components/newsletter-cards';
import { Pager, parsePage } from '@/components/pager';
import { EmptyState, ErrorState } from '@/components/states';
import { ApiUnavailableError, listArticles } from '@/lib/api';
import { singleQuery } from '@/lib/public-content';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'المقالات والنشرات',
  description: 'مقالات ونشرات مختلف عن العمل والمسار المهني.',
  alternates: { canonical: '/articles' },
};

const TOPICS = ['المهن', 'الصحة', 'التقنية', 'الثقافة', 'المجتمع'];

/**
 * The reading index of the presentation site (D-24). The newest article's
 * cover crosses from the night stage onto the sheet, where the article is
 * introduced; the rest follow in a grid with search and pages, then the
 * newsletters. A search or a later page shows the grid alone.
 */
export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const requested = await searchParams;
  const page = parsePage(requested.page);
  const search = singleQuery(requested.search);

  let articles: PaginatedList<PublishedArticle> | null = null;
  try {
    articles = await listArticles({ page, perPage: 9, search });
  } catch (error) {
    if (!(error instanceof ApiUnavailableError)) throw error;
  }

  const featured = articles && page === 1 && !search ? articles.items[0] : undefined;
  const listed = (featured ? articles?.items.slice(1) : articles?.items) ?? [];
  const featuredHref = featured ? `/articles/${encodeURIComponent(featured.slug)}` : '';
  const listTitle = search
    ? `نتائج البحث عن «${search}»`
    : page > 1
      ? 'مقالات أقدم'
      : 'أحدث المقالات';

  return (
    <div className={'stage-page reading-page' + (featured?.coverUrl ? ' has-cross' : '')}>
      <div className="stage-scope">
        <section className="reading-stage" aria-labelledby="articles-title">
          <div className="content-container stage-head">
            <h1 id="articles-title" className="stage-statement">
              اقرأ من مختلف
            </h1>
            <p className="stage-head__lede">مقالات ونشرات مختلف عن العمل والمسار المهني.</p>
          </div>
          {featured?.coverUrl ? (
            <Link className="stage-cross" href={featuredHref} tabIndex={-1} aria-hidden="true">
              <img src={featured.coverUrl} alt="" fetchPriority="high" decoding="async" />
            </Link>
          ) : null}
        </section>
      </div>

      <div className="home-sheet">
        <div className="home-sheet__surface reading-sheet">
          {featured ? (
            <article className="content-container reading-feature" aria-labelledby="featured-title">
              {featured.publishedAt ? (
                <p className="reading-feature__date">
                  <time dateTime={dateTimeAttribute(featured.publishedAt)}>
                    {formatDate(featured.publishedAt)}
                  </time>
                </p>
              ) : null}
              <h2 className="reading-feature__title" id="featured-title">
                <Link href={featuredHref}>{featured.titleAr}</Link>
              </h2>
              {featured.excerptAr ? (
                <p className="reading-feature__text">{featured.excerptAr}</p>
              ) : null}
              <p className="reading-feature__by">{featured.author.displayName}</p>
              <Link className="stage-link" href={featuredHref}>
                اقرأ المقال
              </Link>
            </article>
          ) : null}

          {!featured || listed.length ? (
            <section className="content-container" aria-labelledby="articles-list">
              <h2 className="cover-section__title" id="articles-list">
                {listTitle}
              </h2>
              <form
                action="/articles"
                className="public-filters public-filters--search reading-search"
                role="search"
              >
                <label>
                  ابحث في القراءات
                  <input
                    type="search"
                    name="search"
                    defaultValue={search}
                    maxLength={160}
                    placeholder="عنوان أو موضوع"
                  />
                </label>
                <button type="submit" className="public-primary">
                  ابحث
                </button>
              </form>
              {articles === null ? (
                <ErrorState />
              ) : listed.length ? (
                <>
                  <ArticleTiles articles={listed} />
                  <Pager pageInfo={articles.pageInfo} basePath="/articles" query={{ search }} />
                </>
              ) : (
                <EmptyState
                  title={
                    search
                      ? 'لم نجد قراءة بهذا البحث'
                      : page > 1
                        ? 'لا مزيد من المقالات'
                        : 'لا توجد مقالات منشورة بعد'
                  }
                  text={
                    search
                      ? 'جرّب كلمة أخرى أو امسح البحث لعرض كل القراءات.'
                      : page > 1
                        ? 'وصلت إلى نهاية الأرشيف.'
                        : 'سيظهر أول مقال هنا فور نشره.'
                  }
                />
              )}
            </section>
          ) : null}

          <section
            className="content-container"
            id="newsletters"
            aria-labelledby="newsletters-title"
          >
            <h2 className="cover-section__title" id="newsletters-title">
              نشرات مختلف
            </h2>
            <div className="cover-section__body">
              <NewsletterCards variant="stage" />
            </div>
          </section>

          <section className="content-container" aria-labelledby="articles-topics">
            <h2 className="cover-section__title" id="articles-topics">
              ومن القراءة إلى الحوار
            </h2>
            <ul className="reading-topics">
              {TOPICS.map((topic) => (
                <li key={topic}>
                  <Link className="stage-link" href={'/search?q=' + encodeURIComponent(topic)}>
                    {topic}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
