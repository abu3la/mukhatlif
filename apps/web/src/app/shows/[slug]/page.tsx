import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { Episode, Show, PageInfo } from '@mukhtalif/types';
import { EpisodeCard } from '@/components/cards';
import Link from 'next/link';
import { FollowShowButton } from '@/components/customer-content';
import { Pager, parsePage } from '@/components/pager';
import { EmptyState, ErrorState } from '@/components/states';
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

export default async function ShowPage({
  params,
  searchParams,
}: Params & { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const show = await loadShow(slug);
  const page = parsePage((await searchParams).page);
  let episodes: Episode[] = [];
  let pageInfo: PageInfo | null = null;
  let episodesFailed = false;
  try {
    const result = await listEpisodes({ showId: show.id, page, perPage: 12 });
    episodes = result.items;
    pageInfo = result.pageInfo;
  } catch (error) {
    if (!(error instanceof ApiUnavailableError)) throw error;
    episodesFailed = true;
  }
  const host = show.hostName?.trim();
  const hostPhoto = host === 'أحمد عطار' ? '/handoff/team/ahmed-attar.jpg' : null;
  return (
    <div className="content-page public-page">
      <div className="content-container">
        <Link className="public-back" href="/shows">
          البرامج
        </Link>
        <section className="public-show-intro" aria-labelledby="show-title">
          {show.artworkUrl ? (
            <img src={show.artworkUrl} alt={'غلاف برنامج ' + show.titleAr} decoding="async" />
          ) : null}
          <div>
            <h1 id="show-title">{show.titleAr}</h1>
            {show.descriptionAr ? <p>{show.descriptionAr}</p> : null}
            <div className="public-reading-controls">
              <FollowShowButton showId={show.id} />
              {page === 1 && episodes[0] ? (
                <Link href={'/episodes/' + encodeURIComponent(episodes[0].id)}>أحدث حلقة</Link>
              ) : null}
            </div>
          </div>
        </section>
        {host ? (
          <section className="public-presenter" aria-labelledby="presenter-name">
            {hostPhoto ? <img src={hostPhoto} alt={host} width="116" height="116" /> : null}
            <div>
              <h2>مقدّم البرنامج</h2>
              <h3 id="presenter-name">{host}</h3>
              <p>يقدّم {show.titleAr} من شبكة مختلف.</p>
            </div>
          </section>
        ) : null}
        <section className="content-section" aria-labelledby="show-episodes">
          <div className="content-section__header">
            <h2 className="content-section__title" id="show-episodes">
              حلقات {show.titleAr}
            </h2>
            {pageInfo ? <p className="content-section__meta">{pageInfo.total} حلقة</p> : null}
          </div>
          {episodesFailed ? (
            <ErrorState
              title="تعذّر تحميل الحلقات"
              text="البرنامج معروض، لكن قائمة حلقاته غير متاحة الآن."
            />
          ) : episodes.length ? (
            <>
              <div className="public-episode-grid" role="list">
                {episodes.map((episode) => (
                  <EpisodeCard
                    key={episode.id}
                    episode={episode}
                    showName={show.titleAr}
                    showArtwork={show.artworkUrl}
                  />
                ))}
              </div>
              {pageInfo ? (
                <Pager pageInfo={pageInfo} basePath={'/shows/' + encodeURIComponent(show.slug)} />
              ) : null}
            </>
          ) : (
            <EmptyState
              title="لا توجد حلقات منشورة"
              text="ستظهر حلقات هذا البرنامج هنا فور نشرها."
            />
          )}
        </section>
      </div>
    </div>
  );
}
