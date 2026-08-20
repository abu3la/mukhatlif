import Link from 'next/link';
import type { Episode, PublishedArticle, Show } from '@mukhtalif/types';
import { Signal } from './signal';
import { dateTimeAttribute, formatDate, formatDuration, formatNumber } from './formatting';

export function ShowCard({ show }: { show: Show }) {
  return (
    <Link className="card" href={`/shows/${encodeURIComponent(show.slug)}`}>
      <span className="card__meta">{show.category}</span>
      <span className="card__title">{show.titleAr}</span>
      <span className="card__text">{show.descriptionAr}</span>
      <span className="card__foot">
        {show.hostName}
        {show.premium ? (
          <>
            {' · '}
            <span className="badge badge--premium">
              <Signal />
              اشتراك
            </span>
          </>
        ) : null}
      </span>
    </Link>
  );
}

export function ArticleCard({
  article,
}: {
  article: Pick<
    PublishedArticle,
    'slug' | 'titleAr' | 'excerptAr' | 'coverUrl' | 'coverAlt' | 'publishedAt'
  > & { author: { displayName: string } };
}) {
  return (
    <Link className="card" href={`/articles/${encodeURIComponent(article.slug)}`}>
      {article.coverUrl ? (
        /*
         * A plain img, not next/image: a cover URL may point at the R2 media
         * origin or, per the media runbook, at an external URL an editor
         * supplied. next/image would need every such host allowlisted up front,
         * so it would either drop real covers or force a wildcard remote pattern.
         */
        <img
          className="card__cover"
          src={article.coverUrl}
          alt={article.coverAlt ?? ''}
          loading="lazy"
          decoding="async"
        />
      ) : null}
      <span className="card__title">{article.titleAr}</span>
      {article.excerptAr ? <span className="card__text">{article.excerptAr}</span> : null}
      <span className="card__foot">
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
}: {
  episode: Pick<
    Episode,
    'id' | 'titleAr' | 'episodeNumber' | 'durationSec' | 'premium' | 'publishAt'
  >;
  showName?: string;
}) {
  const duration = formatDuration(episode.durationSec);
  return (
    <Link className="episode" href={`/episodes/${encodeURIComponent(episode.id)}`}>
      <span className="episode__number" aria-hidden="true">
        {formatNumber(episode.episodeNumber)}
      </span>
      <span className="episode__body">
        <span className="episode__title">
          <span className="visually-hidden">{`الحلقة ${formatNumber(episode.episodeNumber)}: `}</span>
          {episode.titleAr}
        </span>
        <span className="episode__meta">
          {[showName, episode.publishAt ? formatDate(episode.publishAt) : '']
            .filter(Boolean)
            .join(' · ')}
        </span>
      </span>
      <span className="episode__aside">
        {episode.premium ? (
          <span className="badge badge--premium">
            <Signal />
            اشتراك
          </span>
        ) : null}
        {duration ? <span>{duration}</span> : null}
      </span>
    </Link>
  );
}
