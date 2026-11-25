import type { Metadata } from 'next';
import Link from 'next/link';
import type { Show } from '@mukhtalif/types';
import { ApiUnavailableError, listShows } from '@/lib/api';
import { EmptyState, ErrorState } from '@/components/states';
import { showFace } from '@/lib/communities';
import { categoryLabel, singleQuery } from '@/lib/public-content';

export const revalidate = 60;
export const metadata: Metadata = {
  title: 'أعمالنا',
  description: 'برامج منشورة من مختلف، لكل منها موضوعه وصوته.',
  alternates: { canonical: '/work' },
};

/**
 * «أعمال لها صوت.» on the presentation site (D-24). The categories sit at the
 * night stage's edge as words, and the works rise from the stage onto the
 * sheet: the first row of covers stands half on each. A work is named and
 * drawn as its programme when it is one of the 27.
 */
export default async function WorkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const category = singleQuery((await searchParams).category);
  let shows: Show[] | null = null;
  try {
    shows = await listShows();
  } catch (error) {
    if (!(error instanceof ApiUnavailableError)) throw error;
  }
  const categories = [
    ...new Set((shows ?? []).map((show) => show.category.trim()).filter(Boolean)),
  ];
  const selected = categories.includes(category) ? category : '';
  const items = selected
    ? (shows ?? []).filter((show) => show.category.trim() === selected)
    : (shows ?? []);
  const rises = items.length > 0;

  return (
    <div className={'stage-page work-page' + (rises ? ' work-page--rise' : '')}>
      <div className="stage-scope">
        <section className="stage-intro work-intro" aria-labelledby="work-title">
          <div className="content-container stage-head">
            <h1 id="work-title" className="stage-statement">
              أعمال لها صوت.
            </h1>
            <p className="stage-head__lede">برامج منشورة من مختلف.</p>
          </div>
          {categories.length > 1 ? (
            <nav className="search-kinds work-filter" aria-label="تصفية الأعمال">
              <ul>
                <li>
                  <Link href="/work" aria-current={!selected ? 'page' : undefined}>
                    كل الأعمال
                  </Link>
                </li>
                {categories.map((item) => (
                  <li key={item}>
                    <Link
                      href={'/work?category=' + encodeURIComponent(item)}
                      aria-current={selected === item ? 'page' : undefined}
                    >
                      {categoryLabel(item)}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
        </section>
      </div>

      <div className="home-sheet">
        <div className="home-sheet__surface">
          <div className="content-container work-list">
            {shows === null ? (
              <ErrorState />
            ) : items.length ? (
              <ul className="work-grid">
                {items.map((show) => {
                  const face = showFace(show);
                  const href = '/work/' + encodeURIComponent(show.slug);
                  return (
                    <li className="work-tile" key={show.id}>
                      {/* The cover repeats the name's link for the pointer; the name is the one stop for the keyboard. */}
                      <Link className="work-tile__art" href={href} tabIndex={-1} aria-hidden="true">
                        {face.cover ? (
                          <img
                            className="work-tile__cover"
                            src={face.cover}
                            alt=""
                            width="480"
                            height="480"
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <span className="work-tile__cover" />
                        )}
                      </Link>
                      <h2 className="work-tile__name">
                        <Link href={href}>{face.name}</Link>
                      </h2>
                      {show.descriptionAr ? (
                        <p className="work-tile__text">{show.descriptionAr}</p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState title="لا برامج منشورة بعد" text="ستظهر هنا أعمال مختلف فور نشرها." />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
