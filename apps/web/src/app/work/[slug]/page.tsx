import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isYouTubeVideoId, type Episode, type Show } from '@mukhtalif/types';
import { BrandIcon } from '@/components/brand-icon';
import { EpisodeCard } from '@/components/cards';
import { EpisodeVideo } from '@/components/episode-video';
import {
  dateTimeAttribute,
  formatDate,
  formatDuration,
  formatNumber,
} from '@/components/formatting';
import { presenterLine } from '@/components/home-stage';
import { RailControls } from '@/components/public-content-controls';
import { EmptyState, ErrorState } from '@/components/states';
import { getShow, listEpisodes, NotFoundError, ApiUnavailableError } from '@/lib/api';
import { communityOfShow, coverTone, programmeMark, showFace, showHref } from '@/lib/communities';

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

/**
 * A work on the presentation site (D-24). It stands on its programme's cover
 * ground (the night stage for a show outside the 27), with the cover as its
 * title, the idea and who presents it; its latest episode plays from the
 * stage across onto the sheet, and the episodes before it follow in a rail.
 */
export default async function WorkDetailPage({ params }: Params) {
  const { slug } = await params;
  let show: Show;
  try {
    show = await getShow(slug);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  let episodes: Episode[] = [];
  let episodesFailed = false;
  try {
    episodes = (await listEpisodes({ showId: show.id, perPage: 7 })).items;
  } catch (error) {
    if (!(error instanceof ApiUnavailableError)) throw error;
    episodesFailed = true;
  }

  const found = communityOfShow(show.slug);
  const programme = found?.programme;
  const face = showFace(show);
  const mark = programme ? programmeMark(programme) : undefined;
  const hosts = programme ? presenterLine(programme) : '';
  const ground = (
    programme
      ? {
          '--cover-ground': `var(--mk-cover-${programme.slug}-ground)`,
          '--cover-accent': `var(--mk-cover-${programme.slug}-accent)`,
        }
      : { '--cover-ground': 'var(--mk-stage)', '--cover-accent': 'var(--mk-stage-ink-muted)' }
  ) as CSSProperties;

  const example = episodes[0];
  const plays = Boolean(example && !example.premium && isYouTubeVideoId(example.youtubeVideoId));
  const exampleHref = example ? '/episodes/' + encodeURIComponent(example.id) : '';
  const exampleDuration = example ? formatDuration(example.durationSec) : '';
  const more = plays ? episodes.slice(1) : episodes;

  return (
    <div className={'cover-page work-detail' + (plays ? ' has-cross' : '')} style={ground}>
      <section
        className="cover-stage"
        data-tone={programme ? coverTone(programme) : 'dark'}
        aria-labelledby="work-title"
      >
        <div className="content-container cover-stage__inner">
          <p className="stage-head__crumbs">
            <Link href="/work">كل الأعمال</Link>
          </p>
          {/* The cover is the work's name as it is drawn. */}
          <h1 id="work-title" className="cover-stage__title">
            {mark ? (
              <img
                className="cover-stage__mark"
                src={mark.src}
                alt={face.name}
                width={mark.width}
                height={mark.height}
                fetchPriority="high"
              />
            ) : face.cover ? (
              <img
                className="cover-stage__art"
                src={face.cover}
                alt={face.name}
                width="720"
                height="720"
                fetchPriority="high"
              />
            ) : (
              <span className="work-detail__name">{face.name}</span>
            )}
          </h1>
          {show.descriptionAr ? <p className="cover-stage__line">{show.descriptionAr}</p> : null}
          {found ? (
            <p className="cover-stage__credit">
              {hosts ? `${hosts}، من ` : 'من '}
              <Link href={`/communities/${found.community.slug}`}>{found.community.name}</Link>
            </p>
          ) : show.hostName ? (
            <p className="cover-stage__credit">يقدّم البرنامج {show.hostName}.</p>
          ) : null}
          <div className="cover-stage__actions">
            <Link className="public-primary" href="/prodservice">
              لدي فكرة برنامج
            </Link>
            <Link className="stage-link" href={showHref(show.slug)}>
              كل حلقات البرنامج
            </Link>
          </div>
        </div>
        {plays && example ? (
          <div className="stage-cross">
            <EpisodeVideo videoId={example.youtubeVideoId} title={example.titleAr} hideHeading />
          </div>
        ) : null}
      </section>

      <div className="cover-sheet">
        <div className="home-sheet__surface">
          {plays && example ? (
            <article
              className="content-container stage-feature stage-feature--episode"
              aria-labelledby="work-example"
            >
              <p className="stage-head__crumbs">
                <span>من البرنامج</span>
                <span className="stage-head__accent">
                  الحلقة {formatNumber(example.episodeNumber)}
                </span>
              </p>
              <h2 className="stage-feature__title" id="work-example">
                <Link href={exampleHref}>{example.titleAr}</Link>
              </h2>
              <p className="stage-head__meta stage-feature__meta">
                {example.publishAt ? (
                  <time dateTime={dateTimeAttribute(example.publishAt)}>
                    {formatDate(example.publishAt)}
                  </time>
                ) : null}
                {exampleDuration ? (
                  <span className="stage-head__icon-text">
                    <BrandIcon name="clock" />
                    <bdi>{exampleDuration}</bdi>
                  </span>
                ) : null}
              </p>
              <Link className="stage-link" href={exampleHref}>
                صفحة الحلقة والاستماع
              </Link>
            </article>
          ) : null}

          {episodesFailed ? (
            <div className="content-container">
              <ErrorState title="تعذّر تحميل الحلقات" />
            </div>
          ) : !episodes.length ? (
            <div className="content-container">
              <EmptyState title="لا توجد حلقات منشورة بعد" text="ستظهر الحلقات هنا فور نشرها." />
            </div>
          ) : more.length ? (
            <section aria-labelledby="work-episodes">
              <div className="content-container home-head">
                <h2 className="cover-section__title" id="work-episodes">
                  {plays ? `المزيد من ${face.name}` : 'أحدث الحلقات'}
                </h2>
                <div className="home-head__tools">
                  <Link
                    className="stage-link"
                    href={`/episodes?showId=${encodeURIComponent(show.id)}`}
                  >
                    كل الحلقات
                  </Link>
                  <RailControls target="work-episodes-rail" label="الحلقات" />
                </div>
              </div>
              <div
                id="work-episodes-rail"
                className="stage-rail stage-rail--episodes"
                role="list"
                tabIndex={0}
                aria-label={`حلقات ${face.name}`}
              >
                {more.map((episode) => (
                  <EpisodeCard
                    key={episode.id}
                    episode={episode}
                    showName={face.name}
                    showArtwork={show.artworkUrl}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
