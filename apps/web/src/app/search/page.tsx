import type { Metadata } from 'next';
import Link from 'next/link';
import { ArticleCard, EpisodeCard, ShowCard } from '@/components/cards';
import { GuestCard } from '@/components/guest-card';
import { ApiUnavailableError, listArticles, listEpisodes, listGuests, listShows } from '@/lib/api';
import { ErrorState } from '@/components/states';
import { singleQuery } from '@/lib/public-content';

export const metadata: Metadata = {
  title: 'البحث',
  description: 'ابحث في برامج مختلف وحلقاتها وضيوفها وقراءاتها.',
  robots: { index: false, follow: true },
};
const kinds = [
  ['all', 'الكل'],
  ['episodes', 'الحلقات'],
  ['shows', 'البرامج'],
  ['guests', 'الضيوف'],
  ['articles', 'القراءات'],
] as const;

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams,
    search = singleQuery(params.q),
    requestedType = singleQuery(params.type);
  const type = kinds.some(([id]) => id === requestedType) ? requestedType : 'all';
  let content = null;
  if (search) {
    try {
      const [shows, episodes, guests, articles] = await Promise.all([
        listShows(),
        listEpisodes({ search, perPage: 6 }),
        listGuests({ search, perPage: 6 }),
        listArticles({ search, perPage: 6 }),
      ]);
      const normalized = (value: string) =>
        value
          .normalize('NFKD')
          .replace(/[\u064b-\u065f]/g, '')
          .replace(/[أإآ]/g, 'ا')
          .toLowerCase();
      const matchedShows = shows.filter((show) =>
        normalized(
          [show.titleAr, show.descriptionAr, show.hostName].filter(Boolean).join(' '),
        ).includes(normalized(search)),
      );
      const has = (kind: string) => type === 'all' || type === kind;
      const count =
        (has('shows') ? matchedShows.length : 0) +
        (has('episodes') ? episodes.pageInfo.total : 0) +
        (has('guests') ? guests.pageInfo.total : 0) +
        (has('articles') ? articles.pageInfo.total : 0);
      content = count ? (
        <>
          <p className="public-result-count">
            نتائج البحث عن {search}: <bdi>{count}</bdi>
          </p>
          {has('episodes') && episodes.items.length > 0 ? (
            <section className="content-section">
              <div className="content-section__header">
                <h2 className="content-section__title">الحلقات</h2>
                <Link href={'/episodes?search=' + encodeURIComponent(search)}>
                  كل الحلقات المطابقة
                </Link>
              </div>
              <div className="public-episode-grid" role="list">
                {episodes.items.map((episode) => (
                  <EpisodeCard
                    key={episode.id}
                    episode={episode}
                    showName={shows.find((show) => show.id === episode.showId)?.titleAr}
                  />
                ))}
              </div>
            </section>
          ) : null}
          {has('shows') && matchedShows.length > 0 ? (
            <section className="content-section">
              <h2 className="content-section__title">البرامج</h2>
              <div className="shows-grid">
                {matchedShows.map((show) => (
                  <ShowCard key={show.id} show={show} />
                ))}
              </div>
            </section>
          ) : null}
          {has('guests') && guests.items.length > 0 ? (
            <section className="content-section">
              <div className="content-section__header">
                <h2 className="content-section__title">الضيوف</h2>
                <Link href={'/guests?search=' + encodeURIComponent(search)}>
                  كل الضيوف المطابقين
                </Link>
              </div>
              <div className="guest-grid">
                {guests.items.map((guest) => (
                  <GuestCard key={guest.id} guest={guest} />
                ))}
              </div>
            </section>
          ) : null}
          {has('articles') && articles.items.length > 0 ? (
            <section className="content-section">
              <div className="content-section__header">
                <h2 className="content-section__title">القراءات</h2>
                <Link href={'/articles?search=' + encodeURIComponent(search)}>
                  كل القراءات المطابقة
                </Link>
              </div>
              <div className="articles-grid">
                {articles.items.map((article) => (
                  <ArticleCard key={article.id} article={article} />
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <div className="public-search-empty">
          <h2>لم نجد نتائج لـ{search}</h2>
          <p>جرّب اسم ضيف أو برنامج، أو ابحث بكلمة أقصر.</p>
        </div>
      );
    } catch (error) {
      if (!(error instanceof ApiUnavailableError)) throw error;
      content = <ErrorState title="تعذّر البحث الآن" text="حاول مرة أخرى بعد قليل." />;
    }
  }
  return (
    <div className="content-page public-page public-search-results">
      <div className="content-container">
        <header className="public-page-head">
          <h1>ما الذي يشغلك؟</h1>
        </header>
        <form className="public-filters public-filters--search" action="/search" role="search">
          <label htmlFor="search">
            ابحث عن حلقة، برنامج، أو ضيف
            <input
              id="search"
              name="q"
              type="search"
              defaultValue={search}
              placeholder="مثلًا: الفضاء"
              maxLength={160}
            />
          </label>
          <input type="hidden" name="type" value={type} />
          <button className="public-primary" type="submit">
            ابحث
          </button>
        </form>
        <nav className="public-filter-tabs" aria-label="نوع نتائج البحث">
          {kinds.map(([id, label]) => (
            <Link
              key={id}
              href={'/search?q=' + encodeURIComponent(search) + '&type=' + id}
              aria-current={id === type ? 'page' : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
        {content || (
          <section className="public-search-empty">
            <h2>ابدأ بموضوع</h2>
            <div className="public-reading-controls">
              {['المهن', 'الصحة', 'التقنية', 'الثقافة', 'المجتمع'].map((topic) => (
                <Link key={topic} href={'/search?q=' + encodeURIComponent(topic)}>
                  {topic}
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
