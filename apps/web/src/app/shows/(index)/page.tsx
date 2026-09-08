import type { Metadata } from 'next';
import Link from 'next/link';
import { ShowCard } from '@/components/cards';
import { EmptyState, ErrorState } from '@/components/states';
import { ApiUnavailableError, listShows } from '@/lib/api';
import { categoryLabel, singleQuery } from '@/lib/public-content';

export const revalidate = 60;
export const metadata: Metadata = {
  title: 'برامج مختلف',
  description: 'لكل برنامج عالمه. اختر ما يشغلك، وتابع الحكاية.',
  alternates: { canonical: '/shows' },
};

export default async function ShowsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const category = singleQuery((await searchParams).category);
  let shows;
  try {
    shows = await listShows();
  } catch (error) {
    if (!(error instanceof ApiUnavailableError)) throw error;
    return (
      <div className="content-page">
        <div className="content-container">
          <ErrorState />
        </div>
      </div>
    );
  }
  const categories = [...new Set(shows.map((show) => show.category.trim()).filter(Boolean))];
  const selected = categories.includes(category) ? category : '';
  const filtered = selected ? shows.filter((show) => show.category.trim() === selected) : shows;
  return (
    <div className="content-page public-page">
      <div className="content-container">
        <header className="public-page-head">
          <h1>برامج مختلف</h1>
          <p>لكل برنامج عالمه. اختر ما يشغلك، وتابع الحكاية.</p>
        </header>
        {categories.length > 1 ? (
          <nav className="public-filter-tabs" aria-label="تصفية البرامج">
            <Link href="/shows" aria-current={!selected ? 'page' : undefined}>
              الكل
            </Link>
            {categories.map((item) => (
              <Link
                href={'/shows?category=' + encodeURIComponent(item)}
                key={item}
                aria-current={selected === item ? 'page' : undefined}
              >
                {categoryLabel(item)}
              </Link>
            ))}
          </nav>
        ) : null}
        {filtered.length ? (
          <div className="shows-grid">
            {filtered.map((show) => (
              <ShowCard key={show.id} show={show} />
            ))}
          </div>
        ) : (
          <EmptyState title="لا توجد برامج بعد" text="سيظهر هنا أول برنامج فور نشره." />
        )}
      </div>
    </div>
  );
}
