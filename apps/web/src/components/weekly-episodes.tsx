import Link from 'next/link';
import { EpisodeThumbnail } from './episode-thumbnail';
import type { HomepageWeeklyEpisode } from '@mukhtalif/types';
import { dateTimeAttribute, formatDate, formatDuration, formatNumber } from './formatting';

export function WeeklyEpisodeCard({ episode }: { episode: HomepageWeeklyEpisode }) {
  const href = `/episodes/${encodeURIComponent(episode.id)}`;
  const publishedDate = episode.publishAt ? formatDate(episode.publishAt) : '';
  const duration = formatDuration(episode.durationSec);

  return (
    <article className="weekly-episode-card" role="listitem">
      <Link
        className="weekly-episode-card__link"
        href={href}
        aria-label={`الحلقة ${formatNumber(episode.episodeNumber)}: ${episode.titleAr}`}
      >
        {!episode.premium ? (
          <EpisodeThumbnail
            videoId={episode.youtubeVideoId}
            className="weekly-episode-card__thumbnail"
          />
        ) : null}
        <span className="weekly-episode-card__show">{episode.showTitleAr}</span>
        <h3 className="weekly-episode-card__title">{episode.titleAr}</h3>
        <span className="weekly-episode-card__meta">
          <span>{`الحلقة ${formatNumber(episode.episodeNumber)}`}</span>
          {publishedDate ? (
            <time dateTime={dateTimeAttribute(episode.publishAt)}>{publishedDate}</time>
          ) : null}
          {duration ? <span>{duration}</span> : null}
          {episode.premium ? <span className="weekly-episode-card__premium">حصرية</span> : null}
        </span>
      </Link>
    </article>
  );
}
