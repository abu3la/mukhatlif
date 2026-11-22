import Link from 'next/link';
import { youtubeThumbnailUrl, type Episode } from '@mukhtalif/types';
import { BrandIcon } from './brand-icon';
import { EpisodeThumbnail } from './episode-thumbnail';
import { dateTimeAttribute, formatDate, formatDuration, formatNumber } from './formatting';
import { PlayEpisodeButton, type PlayerEpisode } from './player';
import { EpisodeLibraryActions, EpisodeProgress } from './episode-library-actions';

export type CardEpisode = Pick<
  Episode,
  'id' | 'titleAr' | 'episodeNumber' | 'durationSec' | 'premium' | 'publishAt' | 'youtubeVideoId'
> &
  Partial<Pick<Episode, 'showNotesAr' | 'showId'>>;

/**
 * The episode card. It takes its stream from the caller, so it also renders
 * inside client pages (the library) without the server's configuration;
 * `EpisodeCard` in cards.tsx fills it in on the server.
 */
export function EpisodeCardView({
  episode,
  showName,
  showArtwork,
  audioSrc,
}: {
  episode: CardEpisode;
  showName?: string;
  showArtwork?: string;
  /** The episode's stream; null shows a link to the episode instead of play. */
  audioSrc: string | null;
}) {
  const href = `/episodes/${encodeURIComponent(episode.id)}`;
  const playable: PlayerEpisode = {
    id: episode.id,
    title: episode.titleAr,
    showTitle: showName,
    href,
    durationSec: episode.durationSec,
    audioSrc: audioSrc ?? '',
    youtubeVideoId: episode.youtubeVideoId,
    artworkUrl: youtubeThumbnailUrl(episode.youtubeVideoId) ?? showArtwork,
  };
  return (
    <article className="handoff-episode-card" role="listitem">
      {((!episode.premium && youtubeThumbnailUrl(episode.youtubeVideoId)) || showArtwork) && (
        <Link href={href} className="handoff-episode-card__art" tabIndex={-1} aria-hidden="true">
          {!episode.premium && episode.youtubeVideoId ? (
            <EpisodeThumbnail videoId={episode.youtubeVideoId} />
          ) : showArtwork ? (
            <img src={showArtwork} alt="" loading="lazy" />
          ) : null}
        </Link>
      )}
      <p className="handoff-episode-card__meta">
        {showName}
        <BrandIcon name="clock" className="metadata-icon" />
        <bdi>{formatDuration(episode.durationSec)}</bdi>
      </p>
      <Link href={href}>
        <h3>
          <span className="visually-hidden">الحلقة {formatNumber(episode.episodeNumber)}: </span>
          {episode.titleAr}
          {episode.premium ? <span className="visually-hidden"> حصرية</span> : null}
        </h3>
      </Link>
      {episode.showNotesAr && (
        <p className="handoff-episode-card__description">
          {episode.showNotesAr.split(/\n/)[0].slice(0, 180)}
        </p>
      )}
      {episode.publishAt ? (
        <time className="visually-hidden" dateTime={dateTimeAttribute(episode.publishAt)}>
          {formatDate(episode.publishAt)}
        </time>
      ) : null}
      <div className="handoff-episode-card__actions">
        {audioSrc && !episode.premium ? (
          <PlayEpisodeButton episode={playable} variant="icon" />
        ) : (
          <Link href={href}>تفاصيل الحلقة</Link>
        )}
        <EpisodeLibraryActions episode={playable} compact />
        <EpisodeProgress episode={playable} />
      </div>
    </article>
  );
}
