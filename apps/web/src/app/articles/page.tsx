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
      <div className="shell">
        <ErrorState />
      </div>
    );
  }

  return (
    <div className="shell section">
      <div className="section__head">
        <h1 className="section__title">المقالات</h1>
      </div>
      {articles.items.length === 0 ? (
        <EmptyState
          title={page > 1 ? 'لا مزيد من المقالات' : 'لا توجد مقالات منشورة بعد'}
          text={page > 1 ? 'وصلت إلى نهاية الأرشيف.' : 'سيظهر أول مقال هنا فور نشره.'}
        />
      ) : (
        <>
          <div className="grid grid--articles">
            {articles.items.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
          <Pager pageInfo={articles.pageInfo} basePath="/articles" />
        </>
      )}
    </div>
  );
}
