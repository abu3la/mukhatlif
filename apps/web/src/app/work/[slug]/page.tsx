import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getShow, listEpisodes, NotFoundError, ApiUnavailableError } from '@/lib/api';
import { EpisodeVideo } from '@/components/episode-video';
type Params = { params: Promise<{ slug: string }> };
export const revalidate = 60;
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  try {
    const show = await getShow(slug);
    return {
      title: show.titleAr,
      description: show.descriptionAr.slice(0, 300),
      alternates: { canonical: '/work/' + encodeURIComponent(show.slug) },
    };
  } catch {
    return { title: 'أعمال مختلف' };
  }
}
export default async function WorkDetailPage({ params }: Params) {
  const { slug } = await params;
  let show;
  try {
    show = await getShow(slug);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  let episode;
  try {
    episode = (await listEpisodes({ showId: show.id, perPage: 1 })).items[0];
  } catch (error) {
    if (!(error instanceof ApiUnavailableError)) throw error;
  }
  return (
    <div className="content-page public-page">
      <div className="content-container">
        <Link className="public-back" href="/work">
          كل الأعمال
        </Link>
        <section className="public-show-intro">
          <div>
            {show.artworkUrl ? (
              <img className="public-work-cover" src={show.artworkUrl} alt={show.titleAr} />
            ) : null}
          </div>
          <div>
            <h1>{show.titleAr}</h1>
            <p>{show.descriptionAr}</p>
            <Link href={'/shows/' + encodeURIComponent(show.slug)}>كل حلقات البرنامج</Link>
          </div>
        </section>
        <section className="public-mission">
          <h2>الفكرة</h2>
          <p>{show.descriptionAr}</p>
          {show.hostName ? <p>يقدّم البرنامج {show.hostName}.</p> : null}
        </section>
        {episode && !episode.premium ? (
          <section className="public-work-example">
            <h2>من البرنامج</h2>
            <h3>{episode.titleAr}</h3>
            <EpisodeVideo videoId={episode.youtubeVideoId} title={episode.titleAr} />
            <Link href={'/episodes/' + encodeURIComponent(episode.id)}>صفحة الحلقة والاستماع</Link>
          </section>
        ) : null}
        <div className="public-service-footer">
          <Link className="public-primary" href="/prodservice">
            لدي فكرة برنامج
          </Link>
        </div>
      </div>
    </div>
  );
}
