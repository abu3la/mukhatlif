import type { Metadata } from 'next';
import type { Episode, PaginatedList, Show } from '@mukhtalif/types';
import { EpisodeRow } from '@/components/cards';
import { Pager, parsePage } from '@/components/pager';
import { EmptyState, ErrorState } from '@/components/states';
import { ApiUnavailableError, listEpisodes, listShows } from '@/lib/api';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'الحلقات',
  description: 'أحدث حلقات شبكة مختلف.',
  alternates: { canonical: '/episodes' },
};

export default async function EpisodesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const page = parsePage((await searchParams).page);

  let episodes: PaginatedList<Episode>;
  let shows: Show[] = [];
  try {
    [episodes, shows] = await Promise.all([listEpisodes({ page, perPage: 15 }), listShows()]);
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

  const showsById = new Map(shows.map((show) => [show.id, show]));

  return (
    <div className="content-page">
      <div className="content-container content-section">
        <header className="content-section__header">
          <div>
            <h1 className="content-section__title">الحلقات</h1>
            <p className="content-section__meta">استمع إلى أحدث ما نشرته شبكة مختلف.</p>
          </div>
        </header>

        {episodes.items.length === 0 ? (
          <EmptyState
            title={page > 1 ? 'لا مزيد من الحلقات' : 'لا توجد حلقات منشورة بعد'}
            text={page > 1 ? 'وصلت إلى نهاية الأرشيف.' : 'ستظهر أول حلقة هنا فور نشرها.'}
          />
        ) : (
          <>
            <div className="episode-list" role="list">
              {episodes.items.map((episode) => (
                <EpisodeRow
                  key={episode.id}
                  episode={episode}
                  showName={showsById.get(episode.showId)?.titleAr}
                />
              ))}
            </div>
            <Pager pageInfo={episodes.pageInfo} basePath="/episodes" />
          </>
        )}
      </div>
    </div>
  );
}
