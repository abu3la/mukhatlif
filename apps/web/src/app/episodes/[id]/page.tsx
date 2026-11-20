import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isYouTubeVideoId, type Episode, type Show } from '@mukhtalif/types';
import { BrandIcon } from '@/components/brand-icon';
import { EpisodeCard } from '@/components/cards';
import { EpisodeMoments } from '@/components/episode-moments';
import { EpisodeChapters } from '@/components/episode-chapters';
import { EpisodeLibraryActions } from '@/components/episode-library-actions';
import { RailControls, ShareButton } from '@/components/public-content-controls';
import { publishedChapters, singleQuery } from '@/lib/public-content';
import { EpisodeVideo } from '@/components/episode-video';
import {
  dateTimeAttribute,
  formatDate,
  formatDuration,
  formatNumber,
} from '@/components/formatting';
import { PlayEpisodeButton, type PlayerEpisode } from '@/components/player';
import { ApiUnavailableError, NotFoundError, getEpisode, getShow, listEpisodes } from '@/lib/api';
import { publicEpisodeAudioSrc } from '@/lib/player-source';
import { NEWSLETTERS, communityOfShow, coverTone, showHref } from '@/lib/communities';

export const revalidate = 60;

type Params = { params: Promise<{ id: string }> };

async function loadEpisode(id: string): Promise<Episode> {
  try {
    return await getEpisode(id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  try {
    // Deliberately not loadEpisode: notFound() throws a control-flow signal that
    // a catch here would swallow, leaving the 404 page wearing an episode title.
    const episode = await getEpisode(id);
    return {
      title: episode.titleAr,
      description: episode.showNotesAr.slice(0, 300),
      alternates: { canonical: `/episodes/${episode.id}` },
    };
  } catch (error) {
    if (error instanceof NotFoundError) return { title: 'الصفحة غير موجودة' };
    return { title: 'الحلقة' };
  }
}

/**
 * An episode page of the presentation site (D-24). The episode stands on its
 * programme's cover ground (the night stage for a show outside the 27
 * programmes); the video is there from the start and crosses onto the sheet,
 * where the notes are read and the programme's other episodes follow.
 */
export default async function EpisodePage({
  params,
  searchParams,
}: Params & { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const episode = await loadEpisode(id);
  const at = Number(singleQuery((await searchParams).t));
  const initialSeconds = Number.isFinite(at)
    ? Math.max(0, Math.min(Math.floor(at), episode.durationSec))
    : 0;
  const chapters = publishedChapters(episode.showNotesAr, episode.durationSec);

  // The show is supporting context: a failure here must not lose the episode.
  let show: Show | null = null;
  try {
    show = await getShow(episode.showId);
  } catch (error) {
    if (!(error instanceof ApiUnavailableError) && !(error instanceof NotFoundError)) throw error;
  }

  let moreEpisodes: Episode[] = [];
  if (show) {
    try {
      const result = await listEpisodes({ showId: show.id, perPage: 7 });
      moreEpisodes = result.items.filter((item) => item.id !== episode.id).slice(0, 6);
    } catch (error) {
      if (!(error instanceof ApiUnavailableError)) throw error;
      // The rail is optional; the loaded episode remains fully usable.
    }
  }

  const programme = show ? communityOfShow(show.slug)?.programme : undefined;
  const showName = programme?.name ?? show?.titleAr;
  const newsletter = programme
    ? NEWSLETTERS.find((item) => item.programme === programme.slug)
    : undefined;
  const ground = (
    programme
      ? {
          '--cover-ground': `var(--mk-cover-${programme.slug}-ground)`,
          '--cover-accent': `var(--mk-cover-${programme.slug}-accent)`,
        }
      : { '--cover-ground': 'var(--mk-stage)', '--cover-accent': 'var(--mk-stage-ink-muted)' }
  ) as CSSProperties;
  const hasVideo = !episode.premium && isYouTubeVideoId(episode.youtubeVideoId);

  const duration = formatDuration(episode.durationSec);
  const publishDate = episode.publishAt ? formatDate(episode.publishAt) : '';
  const publishDateTime = dateTimeAttribute(episode.publishAt);
  const paragraphs = episode.showNotesAr
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const standfirst = paragraphs.length > 1 ? paragraphs[0] : '';
  const noteParagraphs = paragraphs.length > 1 ? paragraphs.slice(1) : paragraphs;
  const audioSrc = publicEpisodeAudioSrc(episode.id);
  const playerEpisode: PlayerEpisode | null =
    audioSrc && !episode.premium
      ? {
          id: episode.id,
          title: episode.titleAr,
          showTitle: show?.titleAr,
          href: `/episodes/${encodeURIComponent(episode.id)}`,
          durationSec: episode.durationSec,
          audioSrc,
          youtubeVideoId: episode.youtubeVideoId,
          artworkUrl: episode.youtubeVideoId
            ? `https://i.ytimg.com/vi/${episode.youtubeVideoId}/hqdefault.jpg`
            : show?.artworkUrl,
        }
      : null;

  return (
    <div className={'cover-page episode-page' + (hasVideo ? ' has-cross' : '')} style={ground}>
      <section
        className="cover-stage"
        data-tone={programme ? coverTone(programme) : 'dark'}
        aria-labelledby="episode-title"
      >
        <div className="content-container stage-head">
          <p className="stage-head__crumbs">
            {show ? <Link href={showHref(show.slug)}>{showName}</Link> : null}
            <span className="stage-head__accent">الحلقة {formatNumber(episode.episodeNumber)}</span>
          </p>
          <h1 id="episode-title" className="stage-head__title">
            {episode.titleAr}
          </h1>
          {standfirst ? <p className="stage-head__lede">{standfirst}</p> : null}
          <p className="stage-head__meta">
            {publishDate ? <time dateTime={publishDateTime}>{publishDate}</time> : null}
            {duration ? (
              <span className="stage-head__icon-text">
                <BrandIcon name="clock" />
                <bdi>{duration}</bdi>
              </span>
            ) : null}
            {episode.premium ? <span className="stage-head__strong">حصرية للمشتركين</span> : null}
          </p>
          <div className="stage-head__actions">
            {playerEpisode ? (
              <PlayEpisodeButton
                episode={playerEpisode}
                variant="label"
                initialSeconds={initialSeconds}
              />
            ) : null}
            {playerEpisode ? <EpisodeLibraryActions episode={playerEpisode} /> : null}
            <ShareButton
              title={episode.titleAr}
              path={
                '/episodes/' +
                encodeURIComponent(id) +
                (initialSeconds ? '?t=' + initialSeconds : '')
              }
            />
          </div>
          {episode.premium ? (
            <p className="stage-head__note">
              هذه الحلقة حصرية للمشتركين، والاستماع غير متاح عبر النسخة العامة حاليًا.
            </p>
          ) : null}
        </div>
        {hasVideo ? (
          <div className="stage-cross">
            <EpisodeVideo
              videoId={episode.youtubeVideoId}
              title={episode.titleAr}
              initialSeconds={initialSeconds}
              hideHeading
            />
          </div>
        ) : null}
      </section>

      <div className="cover-sheet">
        <div className="home-sheet__surface">
          <div className="content-container episode-read">
            {!episode.premium && chapters.length ? (
              <EpisodeChapters
                key={episode.id}
                chapters={chapters}
                episode={playerEpisode}
                videoId={episode.youtubeVideoId}
              />
            ) : null}
            <section aria-labelledby="episode-notes-title">
              <h2 className="cover-section__title" id="episode-notes-title">
                عن الحلقة
              </h2>
              <div className="episode-read__body">
                {noteParagraphs.length ? (
                  noteParagraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)
                ) : (
                  <p>لا توجد ملاحظات منشورة لهذه الحلقة.</p>
                )}
              </div>
            </section>
            {!episode.premium ? (
              <EpisodeMoments
                key={episode.id}
                episodeId={episode.id}
                title={episode.titleAr}
                episode={playerEpisode}
                videoId={episode.youtubeVideoId}
                initialSeconds={initialSeconds}
              />
            ) : null}
          </div>

          {show && moreEpisodes.length ? (
            <section aria-labelledby="episode-more">
              <div className="content-container home-head">
                <h2 className="cover-section__title" id="episode-more">
                  المزيد من {showName}
                </h2>
                <div className="home-head__tools">
                  <Link
                    className="stage-link"
                    href={`/episodes?showId=${encodeURIComponent(show.id)}`}
                  >
                    كل الحلقات
                  </Link>
                  <RailControls target="episode-more-rail" label="الحلقات" />
                </div>
              </div>
              <div
                id="episode-more-rail"
                className="stage-rail stage-rail--episodes"
                role="list"
                tabIndex={0}
                aria-label={`حلقات أخرى من ${showName}`}
              >
                {moreEpisodes.map((item) => (
                  <EpisodeCard
                    key={item.id}
                    episode={item}
                    showName={showName}
                    showArtwork={show.artworkUrl}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {newsletter ? (
            <div className="content-container">
              <section
                className="community-invite cover-invite"
                aria-labelledby="episode-newsletter"
              >
                <div>
                  <h2 className="community-invite__title" id="episode-newsletter">
                    نشرة {newsletter.name}
                  </h2>
                  <p>{newsletter.description}</p>
                </div>
                <Link className="public-primary" href={`/newsletters/${newsletter.slug}`}>
                  اشترك في النشرة
                </Link>
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
