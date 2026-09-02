import type { Metadata } from 'next';
import type { PaginatedList, PublishedArticle } from '@mukhtalif/types';
import { ArticleCard } from '@/components/cards';
import { Pager, parsePage } from '@/components/pager';
import { EmptyState, ErrorState } from '@/components/states';
import { ApiUnavailableError, listArticles } from '@/lib/api';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'المقالات',
  description: 'مقالات شبكة مختلف عن العمل والمسار المهني.',
  alternates: { canonical: '/articles' },
};

export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const page = parsePage((await searchParams).page);

  let articles: PaginatedList<PublishedArticle>;
  try {
    articles = await listArticles({ page, perPage: 9 });
  } catch (error) {
    if (!(error instanceof ApiUnavailableError)) throw error;
    return (
      <div className="shell articles-index">
        <ErrorState />
      </div>
    );
  }

  return (
    <div className="shell articles-index">
      <header className="articles-index__header">
        <h1 className="articles-index__title">المقالات</h1>
        <p className="articles-index__intro">قراءات قصيرة من فريق مختلف عن العمل والمهنة</p>
      </header>
      {articles.items.length === 0 ? (
        <EmptyState
          title={page > 1 ? 'لا مزيد من المقالات' : 'لا توجد مقالات منشورة بعد'}
          text={page > 1 ? 'وصلت إلى نهاية الأرشيف.' : 'سيظهر أول مقال هنا فور نشره.'}
        />
      ) : (
        <>
          <div className="articles-grid">
            {articles.items.map((article) => (
              <ArticleCard key={article.id} article={article} headingLevel={2} />
            ))}
          </div>
          <Pager pageInfo={articles.pageInfo} basePath="/articles" />
        </>
      )}
    </div>
  );
}
