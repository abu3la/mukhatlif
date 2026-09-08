import type { Metadata } from 'next';
import Link from 'next/link';
import { ApiUnavailableError, listShows } from '@/lib/api';
import { EmptyState, ErrorState } from '@/components/states';
import { categoryLabel, singleQuery } from '@/lib/public-content';
export const revalidate = 60;
export const metadata: Metadata = {
  title: 'أعمالنا',
  description: 'برامج منشورة من مختلف، لكل منها موضوعه وصوته.',
  alternates: { canonical: '/work' },
};
export default async function WorkPage({
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
  const items = selected ? shows.filter((show) => show.category.trim() === selected) : shows;
  return (
    <div className="content-page public-page">
      <div className="content-container">
        <header className="public-page-head">
          <h1>أعمال لها صوت.</h1>
          <p>برامج منشورة من مختلف.</p>
        </header>
        {categories.length > 1 ? (
          <nav className="public-filter-tabs" aria-label="تصفية الأعمال">
            <Link href="/work" aria-current={!selected ? 'page' : undefined}>
              كل الأعمال
            </Link>
            {categories.map((item) => (
              <Link
                key={item}
                href={'/work?category=' + encodeURIComponent(item)}
                aria-current={selected === item ? 'page' : undefined}
              >
                {categoryLabel(item)}
              </Link>
            ))}
          </nav>
        ) : null}
        {items.length ? (
          <div className="public-work-grid">
            {items.map((show) => (
              <article key={show.id}>
                <Link href={'/work/' + encodeURIComponent(show.slug)}>
                  {show.artworkUrl ? (
                    <img src={show.artworkUrl} alt={'غلاف ' + show.titleAr} loading="lazy" />
                  ) : null}
                  <h2>{show.titleAr}</h2>
                  {show.descriptionAr ? <p>{show.descriptionAr}</p> : null}
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title="لا برامج منشورة بعد" text="ستظهر هنا أعمال مختلف فور نشرها." />
        )}
      </div>
    </div>
  );
}
