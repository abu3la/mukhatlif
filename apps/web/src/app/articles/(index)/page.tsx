import Link from 'next/link';
import type { Metadata } from 'next';
import type { PaginatedList, PublishedArticle } from '@mukhtalif/types';
import { ArticleCard } from '@/components/cards';
import { Pager, parsePage } from '@/components/pager';
import { EmptyState, ErrorState } from '@/components/states';
import { ApiUnavailableError, listArticles } from '@/lib/api';
import { singleQuery } from '@/lib/public-content';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'قراءات من مختلف',
  description: 'مقالات شبكة مختلف عن العمل والمسار المهني.',
  alternates: { canonical: '/articles' },
};

export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const requested = await searchParams;
  const page = parsePage(requested.page);
  const search = singleQuery(requested.search);

  let articles: PaginatedList<PublishedArticle>;
  try {
    articles = await listArticles({ page, perPage: 9, search });
  } catch (error) {
    if (!(error instanceof ApiUnavailableError)) throw error;
    return (
      <div className="shell articles-index">
        <ErrorState />
      </div>
    );
  }

  return (
    <div className="shell articles-index public-page">
      <header className="articles-index__header">
        <h1 className="articles-index__title">قراءات من مختلف</h1>
        <p className="articles-index__intro">مساحة للرأي والتأمل في معنى العمل.</p>
      </header>
      <form action="/articles" className="public-filters public-filters--search" role="search">
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
      {articles.items.length === 0 ? (
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
      ) : (
        <>
          <div className="articles-grid public-article-collection">
            {articles.items.map((article) => (
              <ArticleCard key={article.id} article={article} headingLevel={2} />
            ))}
          </div>
          <Pager pageInfo={articles.pageInfo} basePath="/articles" query={{ search }} />
        </>
      )}
      <section className="content-section">
        <h2 className="content-section__title">ومن القراءة إلى الحوار</h2>
        <div className="public-reading-controls">
          {['المهن', 'الصحة', 'التقنية', 'الثقافة', 'المجتمع'].map((topic) => (
            <Link key={topic} href={'/search?q=' + encodeURIComponent(topic)}>
              {topic}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
