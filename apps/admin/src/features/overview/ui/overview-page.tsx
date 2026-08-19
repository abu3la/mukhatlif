import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { adminPaths, canViewPage, useAdminAuth, useStudioData } from '@/application';
import { PageHeader, PremiumMark, StatusBadge } from '@/shared/ui/primitives';
import { formatArabicDate, formatArabicInteger, formatEpisodeTimeline } from '@/lib';

export function OverviewView() {
  const { viewer } = useAdminAuth();
  const { data } = useStudioData();
  const canViewEpisodes = viewer ? canViewPage(viewer, 'episodes') : false;
  const publishedEpisodes = useMemo(
    () =>
      data.episodes
        .filter((episode) => episode.status === 'published')
        .sort(
          (a, b) =>
            new Date(b.publishedAt ?? b.updatedAt).getTime() -
            new Date(a.publishedAt ?? a.updatedAt).getTime(),
        ),
    [data.episodes],
  );
  const episodesInProgress = data.episodes.filter(
    (episode) => episode.status === 'draft' || episode.status === 'scheduled',
  ).length;

  return (
    <>
      <PageHeader
        title="نظرة عامة"
        action={
          <time className="page-header__detail" dateTime={new Date().toISOString()}>
            {formatArabicDate(new Date())}
          </time>
        }
      />

      <section className="stats-grid" aria-label="ملخص الاستوديو">
        <article className="card stat-card">
          <p className="stat-card__label">البرامج</p>
          <p className="stat-card__value">{formatArabicInteger(data.shows.length)}</p>
        </article>
        <article className="card stat-card">
          <p className="stat-card__label">حلقات منشورة</p>
          <p className="stat-card__value">{formatArabicInteger(publishedEpisodes.length)}</p>
        </article>
        <article className="card stat-card">
          <p className="stat-card__label">حلقات قيد العمل</p>
          <p className="stat-card__value">{formatArabicInteger(episodesInProgress)}</p>
        </article>
      </section>

      <section className="card section-card" aria-labelledby="latest-episodes-title">
        <div className="section-card__header">
          <h2 id="latest-episodes-title">أحدث الحلقات</h2>
          {canViewEpisodes ? (
            <Link to={`${adminPaths.episodes}?status=published`} className="button button--quiet">
              كل الحلقات
            </Link>
          ) : null}
        </div>
        <div className="list-body">
          {publishedEpisodes.slice(0, 4).map((episode) => {
            const show = data.shows.find((item) => item.id === episode.showId);
            return (
              <article className="episode-row episode-row--overview" key={episode.id}>
                <div className="row-copy">
                  {canViewEpisodes ? (
                    <Link to={adminPaths.episode(episode.id)} className="text-link row-copy__title">
                      {episode.title}
                    </Link>
                  ) : (
                    <p className="row-copy__title">{episode.title}</p>
                  )}
                  {episode.premium ? <PremiumMark /> : null}
                  <p className="row-copy__meta">
                    {show?.name ?? 'برنامج غير محدد'} ·{' '}
                    {episode.durationMinutes == null
                      ? 'المدة غير محددة'
                      : `${formatArabicInteger(episode.durationMinutes)} د`}{' '}
                    · {formatEpisodeTimeline(episode)}
                  </p>
                </div>
                <StatusBadge status={episode.status} />
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}
