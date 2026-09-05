import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Episode, Show } from '@mukhtalif/types';
import { EpisodeRow } from '@/components/cards';
import { EpisodeVideo } from '@/components/episode-video';
import {
  dateTimeAttribute,
  formatDate,
  formatDuration,
  formatNumber,
} from '@/components/formatting';
import { InlineEpisodePlayer, type PlayerEpisode } from '@/components/player';
import { ApiUnavailableError, NotFoundError, getEpisode, getShow, listEpisodes } from '@/lib/api';
import { publicEpisodeAudioSrc } from '@/lib/player-source';

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

export default async function EpisodePage({ params }: Params) {
  const { id } = await params;
  const episode = await loadEpisode(id);

  // The show is supporting context: a failure here must not lose the episode.
  let show: Show | null = null;
  try {
    show = await getShow(episode.showId);
  } catch (error) {
    if (!(error instanceof ApiUnavailableError) && !(error instanceof NotFoundError)) throw error;
  }

  let relatedEpisodes: Episode[] = [];
  if (show) {
    try {
      const result = await listEpisodes({ showId: show.id, perPage: 4 });
      relatedEpisodes = result.items.filter((item) => item.id !== episode.id).slice(0, 2);
    } catch (error) {
      if (!(error instanceof ApiUnavailableError)) throw error;
      // A related shelf is optional; the loaded episode remains fully usable.
    }
  }

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
        }
      : null;

  return (
    <div className="content-page">
      <article className="content-container content-container--narrow episode-detail">
        <header>
          <p className="episode-detail__breadcrumb">
            {show ? (
              <>
                <Link href={`/shows/${encodeURIComponent(show.slug)}`}>{show.titleAr}</Link>
                {' · '}
              </>
            ) : null}
            <span>{`الحلقة ${formatNumber(episode.episodeNumber)}`}</span>
            {publishDate ? (
              <>
                {' · '}
                <time dateTime={publishDateTime}>{publishDate}</time>
              </>
            ) : null}
            {duration ? ` · ${duration}` : null}
            {episode.premium ? <span className="episode-row__premium">حصري</span> : null}
          </p>
          <h1 className="episode-detail__title">{episode.titleAr}</h1>
          {standfirst ? <p className="episode-detail__standfirst">{standfirst}</p> : null}
        </header>

        {playerEpisode ? (
          <section className="episode-audio-section" aria-labelledby="episode-audio-heading">
            <h2 id="episode-audio-heading" className="episode-notes__title">
              الاستماع للحلقة
            </h2>
            <InlineEpisodePlayer episode={playerEpisode} />
          </section>
        ) : null}
        {!episode.premium ? (
          <EpisodeVideo videoId={episode.youtubeVideoId} title={episode.titleAr} />
        ) : null}
        {episode.premium ? (
          <p className="episode-detail__premium-note">
            هذه الحلقة حصرية للمشتركين، والاستماع غير متاح عبر النسخة العامة حاليًا.
          </p>
        ) : null}

        {noteParagraphs.length > 0 ? (
          <section className="episode-notes" aria-labelledby="episode-notes-title">
            <h2 className="episode-notes__title" id="episode-notes-title">
              عن الحلقة
            </h2>
            <div className="episode-notes__body">
              {noteParagraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          </section>
        ) : (
          <p className="episode-detail__standfirst">لا توجد ملاحظات منشورة لهذه الحلقة.</p>
        )}

        {show && relatedEpisodes.length > 0 ? (
          <section className="content-section episode-related" aria-labelledby="related-title">
            <div className="content-section__header">
              <h2 className="content-section__title" id="related-title">
                المزيد من {show.titleAr}
              </h2>
              <Link
                className="content-section__more"
                href={`/shows/${encodeURIComponent(show.slug)}`}
              >
                كل الحلقات
              </Link>
            </div>
            <div className="episode-list" role="list">
              {relatedEpisodes.map((relatedEpisode) => (
                <EpisodeRow
                  key={relatedEpisode.id}
                  episode={relatedEpisode}
                  showName={show.titleAr}
                />
              ))}
            </div>
          </section>
        ) : null}
      </article>
    </div>
  );
}
