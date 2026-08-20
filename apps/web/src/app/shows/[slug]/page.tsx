import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { Episode, Show } from '@mukhtalif/types';
import { EpisodeRow } from '@/components/cards';
import { EmptyState, ErrorState } from '@/components/states';
import { Signal } from '@/components/signal';
import { ApiUnavailableError, NotFoundError, getShow, listEpisodes } from '@/lib/api';

export const revalidate = 60;

type Params = { params: Promise<{ slug: string }> };

async function loadShow(slug: string): Promise<Show> {
  try {
    return await getShow(slug);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  try {
    // Deliberately not loadShow: notFound() throws a control-flow signal that a
    // catch here would swallow, leaving the 404 page wearing a show title.
    const show = await getShow(slug);
    return {
      title: show.titleAr,
      description: show.descriptionAr.slice(0, 300),
      alternates: { canonical: `/shows/${show.slug}` },
      openGraph: {
        title: show.titleAr,
        description: show.descriptionAr.slice(0, 300),
        images: show.artworkUrl ? [show.artworkUrl] : undefined,
      },
    };
  } catch (error) {
    // Metadata must never fail the page; the body renders the real state.
    if (error instanceof NotFoundError) return { title: 'الصفحة غير موجودة' };
    return { title: 'البرنامج' };
  }
}

export default async function ShowPage({ params }: Params) {
  const { slug } = await params;
  const show = await loadShow(slug);

  let episodes: Episode[] = [];
  let episodesFailed = false;
  try {
    episodes = (await listEpisodes({ showId: show.id, perPage: 50 })).items;
  } catch (error) {
    if (!(error instanceof ApiUnavailableError)) throw error;
    // The show itself loaded, so the page is still worth rendering.
    episodesFailed = true;
  }

  return (
    <div className="shell section">
      <div className="section__head">
        <div>
          <p className="hero__station">
            <Signal />
            {show.category}
          </p>
          <h1 className="section__title">{show.titleAr}</h1>
          <p className="card__meta">{`تقديم ${show.hostName}`}</p>
        </div>
      </div>

      <p className="hero__lede" style={{ marginBlockEnd: 'var(--space-2xl)' }}>
        {show.descriptionAr}
      </p>

      <h2 className="section__title" style={{ fontSize: 24 }}>
        الحلقات
      </h2>
      {episodesFailed ? (
        <ErrorState
          title="تعذّر تحميل الحلقات"
          text="البرنامج معروض، لكن قائمة حلقاته غير متاحة الآن."
        />
      ) : episodes.length === 0 ? (
        <EmptyState
          title="لا توجد حلقات منشورة"
          text="ستظهر حلقات هذا البرنامج هنا فور نشرها."
        />
      ) : (
        <div className="episodes">
          {episodes.map((episode) => (
            <EpisodeRow key={episode.id} episode={episode} />
          ))}
        </div>
      )}
    </div>
  );
}
