import Link from 'next/link';
import { EpisodeThumbnail } from './episode-thumbnail';
import type { Episode, PublishedArticle, Show } from '@mukhtalif/types';
import { dateTimeAttribute, formatDate, formatDuration, formatNumber } from './formatting';
import { PlayEpisodeButton, type PlayerEpisode } from './player';
import { publicEpisodeAudioSrc } from '@/lib/player-source';

function PlayIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4.5 2.7a1 1 0 0 1 1.53-.85l8 5.3a1 1 0 0 1 0 1.7l-8 5.3a1 1 0 0 1-1.53-.85z" />
    </svg>
  );
}

function LockedIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M5.25 7V5.5a2.75 2.75 0 0 1 5.5 0V7m-6.5 0h7.5v6h-7.5V7Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A stable, data-derived tone keeps adjacent fallback artworks from merging. */
function artworkTone(show: Pick<Show, 'id' | 'slug'>): 0 | 1 | 2 {
  const seed = `${show.id}:${show.slug}`;
  let value = 0;
  for (const character of seed) value = (value + character.codePointAt(0)!) % 3;
  return value as 0 | 1 | 2;
}

export function ShowCard({ show }: { show: Show }) {
  const href = `/shows/${encodeURIComponent(show.slug)}`;
  const tone = artworkTone(show);

  return (
    <Link
      className="show-card"
      href={href}
      aria-label={`بودكاست ${show.titleAr}${show.premium ? ' - حصري' : ''}`}
    >
      <span className={`show-card__art show-card__art--${tone}`}>
        {show.artworkUrl ? (
          /*
           * Artwork may be hosted on R2 or at an editor-supplied origin. Keeping
           * this a native image avoids an unsafe wildcard in next/image.
           */
          <img
            className="show-card__image"
            src={show.artworkUrl}
            alt={`غلاف برنامج ${show.titleAr}`}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <>
            <span className="show-card__mark" aria-hidden="true" />
            <span className="show-card__name">{show.titleAr}</span>
          </>
        )}
      </span>
      <span className="show-card__caption">
        {`بودكاست ${show.titleAr}`}
        {show.premium ? (
          <>
            {' '}
            <span className="episode-row__premium">حصري</span>
          </>
        ) : null}
      </span>
    </Link>
  );
}

export function ArticleCard({
  article,
  headingLevel = 3,
}: {
  article: Pick<
    PublishedArticle,
    'slug' | 'titleAr' | 'excerptAr' | 'coverUrl' | 'coverAlt' | 'publishedAt'
  > & { author: { displayName: string } };
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';

  return (
    <Link className="card article-card" href={`/articles/${encodeURIComponent(article.slug)}`}>
      {article.coverUrl ? (
        /*
         * A cover can come from R2 or an external URL supplied by an editor.
         * next/image would require either dropping valid covers or allowing an
         * unsafe remote wildcard, so this deliberately stays a native image.
         */
        <img
          className="card__cover article-card__cover"
          src={article.coverUrl}
          alt={article.coverAlt ?? ''}
          loading="lazy"
          decoding="async"
        />
      ) : null}
      <Heading className="card__title article-card__title">{article.titleAr}</Heading>
      {article.excerptAr ? (
        <span className="card__text article-card__excerpt">{article.excerptAr}</span>
      ) : null}
      <span className="card__foot article-card__byline">
        {article.author.displayName}
        {article.publishedAt ? (
          <>
            {' · '}
            <time dateTime={dateTimeAttribute(article.publishedAt)}>
              {formatDate(article.publishedAt)}
            </time>
          </>
        ) : null}
      </span>
    </Link>
  );
}

export function EpisodeRow({
  episode,
  showName,
  variant = 'list',
}: {
  episode: Pick<
    Episode,
    'id' | 'titleAr' | 'episodeNumber' | 'durationSec' | 'premium' | 'publishAt' | 'youtubeVideoId'
  >;
  showName?: string;
  variant?: 'list' | 'table';
}) {
  const href = `/episodes/${encodeURIComponent(episode.id)}`;
  const duration = formatDuration(episode.durationSec);
  const publishedDate = episode.publishAt ? formatDate(episode.publishAt) : '';
  const publishedDateTime = dateTimeAttribute(episode.publishAt);
  const audioSrc = publicEpisodeAudioSrc(episode.id);
  const playerEpisode: PlayerEpisode | null =
    audioSrc && !episode.premium
      ? {
          id: episode.id,
          title: episode.titleAr,
          showTitle: showName,
          href,
          durationSec: episode.durationSec,
          audioSrc,
        }
      : null;

  return (
    <div
      className={`episode-row${variant === 'table' ? ' episode-row--table' : ''}`}
      role="listitem"
    >
      {playerEpisode ? (
        <PlayEpisodeButton episode={playerEpisode} variant="icon" className="episode-row__play" />
      ) : episode.premium ? (
        <Link
          className="episode-row__play episode-row__play--premium"
          href={href}
          aria-label={`عرض تفاصيل الحلقة الحصرية ${episode.titleAr}`}
        >
          <LockedIcon />
        </Link>
      ) : (
        <Link className="episode-row__play" href={href} aria-label={`فتح حلقة ${episode.titleAr}`}>
          <PlayIcon />
        </Link>
      )}

      <div className="episode-row__body">
        {!episode.premium && episode.youtubeVideoId ? (
          <Link href={href} className="episode-row__thumbnail" tabIndex={-1} aria-hidden="true">
            <EpisodeThumbnail videoId={episode.youtubeVideoId} />
          </Link>
        ) : null}
        <Link className="episode-row__title" href={href}>
          <span className="visually-hidden">
            {`الحلقة ${formatNumber(episode.episodeNumber)}: `}
          </span>
          {episode.titleAr}
          {episode.premium ? (
            <>
              {' '}
              <span className="episode-row__premium">حصري</span>
            </>
          ) : null}
        </Link>
        {variant === 'list' && (showName || publishedDate) ? (
          <span className="episode-row__meta">
            {showName ? <span>{showName}</span> : null}
            {showName && publishedDate ? ' · ' : null}
            {publishedDate ? <time dateTime={publishedDateTime}>{publishedDate}</time> : null}
          </span>
        ) : null}
      </div>

      {variant === 'table' ? (
        <time className="episode-row__date" dateTime={publishedDateTime}>
          {publishedDate}
        </time>
      ) : null}
      <span className="episode-row__duration">{duration}</span>
    </div>
  );
}
