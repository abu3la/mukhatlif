import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { Episode, Show } from '@mukhtalif/types';
import { EpisodeRow } from '@/components/cards';
import { formatNumber } from '@/components/formatting';
import { EmptyState, ErrorState } from '@/components/states';
import {
  ApiUnavailableError,
  NotFoundError,
  getShow,
  listEpisodes,
  listShows,
} from '@/lib/api';

export const revalidate = 60;

type Params = { params: Promise<{ slug: string }> };

const LISTENING_PLATFORMS = [
  {
    label: 'سبوتيفاي',
    href: 'https://open.spotify.com/show/6m9xb0r6xCBtTvq4UnnYbh',
  },
  {
    label: 'آبل بودكاست',
    href: 'https://podcasts.apple.com/sa/podcast/id1532674246',
  },
  {
    label: 'يوتيوب ميوزك',
    href: 'https://music.youtube.com/playlist?list=PLRJcweuRKcSNLQvq3g1guO92LVLyXxUOM',
  },
] as const;

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
  let episodeCount = 0;
  let episodesFailed = false;
  try {
    const result = await listEpisodes({ showId: show.id, perPage: 50 });
    episodes = result.items;
    episodeCount = result.pageInfo.total;
  } catch (error) {
    if (!(error instanceof ApiUnavailableError)) throw error;
    // The show itself loaded, so the page is still worth rendering.
    episodesFailed = true;
  }

  let related: Array<{ episode: Episode; showName?: string }> = [];
  try {
    const [latest, shows] = await Promise.all([
      listEpisodes({ perPage: 12 }),
      listShows(),
    ]);
    const showNames = new Map(shows.map((item) => [item.id, item.titleAr]));
    related = latest.items
      .filter((episode) => episode.showId !== show.id)
      .slice(0, 3)
      .map((episode) => ({ episode, showName: showNames.get(episode.showId) }));
  } catch (error) {
    if (!(error instanceof ApiUnavailableError)) throw error;
    // Recommendations are supplementary and must never hide a loaded show.
  }

  const hostInitial = Array.from(show.hostName.trim())[0] ?? 'م';

  return (
    <div className="content-page">
      <div className="content-container">
        <section className="show-hero" aria-labelledby="show-title">
          <div className="show-hero__art">
            {show.artworkUrl ? (
              <img
                className="show-hero__cover"
                src={show.artworkUrl}
                alt={`غلاف برنامج ${show.titleAr}`}
                decoding="async"
              />
            ) : (
              <>
                <span className="show-card__mark" aria-hidden="true" />
                <span className="show-card__name">{show.titleAr}</span>
              </>
            )}
          </div>

          <div className="show-hero__copy">
            <p className="show-hero__kicker">برنامج من شبكة مختلف</p>
            <h1 className="show-hero__title" id="show-title">
              {show.titleAr}
            </h1>
            <p className="show-hero__host">{`يقدّمه ${show.hostName}`}</p>
            <p className="show-hero__description">{show.descriptionAr}</p>
            {!episodesFailed ? (
              <p className="show-hero__meta">
                {episodeCount === 0
                  ? 'لا توجد حلقات منشورة بعد'
                  : `${formatNumber(episodeCount)} حلقة منشورة`}
              </p>
            ) : null}
            <div className="platform-links platform-links--light" aria-label="منصات الاستماع">
              <span className="platform-links__label">استمع عبر:</span>
              {LISTENING_PLATFORMS.map((platform) => (
                <a key={platform.href} className="platform-links__link" href={platform.href}>
                  {platform.label}
                </a>
              ))}
            </div>
          </div>
        </section>

        <section className="content-section" aria-labelledby="show-episodes">
          <div className="content-section__header">
            <h2 className="content-section__title" id="show-episodes">
              الحلقات
            </h2>
          </div>

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
            <div className="episode-list episode-list--table" role="list">
              <div className="episode-list__header" role="presentation" aria-hidden="true">
                <span />
                <span>الحلقة</span>
                <span>التاريخ</span>
                <span>المدة</span>
              </div>
              {episodes.map((episode) => (
                <EpisodeRow
                  key={episode.id}
                  episode={episode}
                  showName={show.titleAr}
                  variant="table"
                />
              ))}
            </div>
          )}
        </section>

        {related.length > 0 ? (
          <section className="content-section" aria-labelledby="similar-episodes">
            <div className="content-section__header">
              <h2 className="content-section__title" id="similar-episodes">
                أحدث الحلقات من برامج أخرى
              </h2>
              <p className="content-section__meta">استكشف المزيد من شبكة مختلف</p>
            </div>
            <div className="episode-list" role="list">
              {related.map(({ episode, showName }) => (
                <EpisodeRow key={episode.id} episode={episode} showName={showName} />
              ))}
            </div>
          </section>
        ) : null}

        <section className="show-host" aria-labelledby="show-host-name">
          <span className="show-host__avatar" aria-hidden="true">
            {hostInitial}
          </span>
          <div className="show-host__body">
            <h2 className="show-host__name" id="show-host-name">
              {show.hostName}
            </h2>
            <p className="show-host__role">مقدّم بودكاست {show.titleAr}</p>
          </div>
        </section>
      </div>
    </div>
  );
}
