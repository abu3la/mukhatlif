import type { Metadata } from 'next';
import Link from 'next/link';
import type { Episode, PaginatedList, Show } from '@mukhtalif/types';
import { EpisodeCard } from '@/components/cards';
import { Pager, parsePage } from '@/components/pager';
import { EmptyState, ErrorState } from '@/components/states';
import { ApiUnavailableError, listEpisodes, listShows } from '@/lib/api';
import { episodeSort, singleQuery } from '@/lib/public-content';

export const revalidate = 60;
export const metadata: Metadata = {
  title: 'الحلقات',
  description: 'تجارب من قلب المهنة، وأسئلة تفتح عوالم جديدة.',
  alternates: { canonical: '/episodes' },
};

export default async function EpisodesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const requested = await searchParams;
  const page = parsePage(requested.page),
    search = singleQuery(requested.search),
    showId = singleQuery(requested.showId),
    sort = episodeSort(singleQuery(requested.sort));
  let episodes: PaginatedList<Episode>;
  let shows: Show[] = [];
  try {
    [episodes, shows] = await Promise.all([
      listEpisodes({ page, perPage: 12, search, showId, sort }),
      listShows(),
    ]);
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
  const byId = new Map(shows.map((show) => [show.id, show]));
  return (
    <div className="content-page public-page">
      <div className="content-container">
        <header className="public-page-head">
          <h1>الحلقات</h1>
          <p>تجارب من قلب المهنة، وأسئلة تفتح عوالم جديدة.</p>
        </header>
        <form className="public-filters" action="/episodes" role="search">
          <label>
            عنوان الحلقة
            <input
              type="search"
              name="search"
              defaultValue={search}
              placeholder="ابحث عن حلقة"
              maxLength={160}
            />
          </label>
          <label>
            البرنامج
            <select name="showId" defaultValue={showId}>
              <option value="">كل البرامج</option>
              {shows.map((show) => (
                <option key={show.id} value={show.id}>
                  {show.titleAr}
                </option>
              ))}
            </select>
          </label>
          <label>
            الترتيب
            <select name="sort" defaultValue={sort}>
              <option value="latest">الأحدث أولًا</option>
              <option value="shortest">الأقصر أولًا</option>
              <option value="longest">الأطول أولًا</option>
            </select>
          </label>
          <button type="submit" className="public-primary">
            اعرض الحلقات
          </button>
          {search || showId || sort !== 'latest' ? <Link href="/episodes">مسح التصفية</Link> : null}
        </form>
        <p className="public-result-count">
          الحلقات المطابقة: <bdi>{episodes.pageInfo.total}</bdi>
        </p>
        {episodes.items.length ? (
          <>
            <div className="public-episode-grid" role="list">
              {episodes.items.map((episode) => (
                <EpisodeCard
                  key={episode.id}
                  episode={episode}
                  showName={byId.get(episode.showId)?.titleAr}
                  showArtwork={byId.get(episode.showId)?.artworkUrl}
                />
              ))}
            </div>
            <Pager
              pageInfo={episodes.pageInfo}
              basePath="/episodes"
              query={{ search, showId, sort: sort === 'latest' ? undefined : sort }}
            />
          </>
        ) : (
          <EmptyState
            title={
              search || showId
                ? 'لا توجد حلقات بهذه الشروط'
                : page > 1
                  ? 'لا مزيد من الحلقات'
                  : 'لا توجد حلقات منشورة بعد'
            }
            text={
              search || showId ? 'غيّر البرنامج أو كلمة البحث.' : 'ستظهر الحلقات هنا فور نشرها.'
            }
          />
        )}
      </div>
    </div>
  );
}
