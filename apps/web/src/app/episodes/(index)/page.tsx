import type { Metadata } from 'next';
import type { PaginatedList, Episode, Show } from '@mukhtalif/types';
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
      <div className="shell">
        <ErrorState />
      </div>
    );
  }

  const showsById = new Map(shows.map((show) => [show.id, show]));

  return (
    <div className="shell section">
      <div className="section__head">
        <h1 className="section__title">الحلقات</h1>
      </div>
      {episodes.items.length === 0 ? (
        <EmptyState
          title={page > 1 ? 'لا مزيد من الحلقات' : 'لا توجد حلقات منشورة بعد'}
          text={
            page > 1
              ? 'وصلت إلى نهاية الأرشيف.'
              : 'ستظهر أول حلقة هنا فور نشرها.'
          }
        />
      ) : (
        <>
          <div className="episodes">
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
  );
}
