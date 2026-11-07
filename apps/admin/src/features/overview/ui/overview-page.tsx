import { type ReactNode, useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { StudioDomain } from '@mukhtalif/design-tokens';
import { adminPaths, canViewPage, useAdminAuth, useStudioData } from '@/application';
import { PageHeader, PremiumMark, StatusBadge } from '@/shared/ui/primitives';
import {
  type Article,
  type Episode,
  formatArabicDate,
  formatArabicInteger,
  formatEpisodeTimeline,
} from '@/lib';

interface CountCard {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  readonly domain: StudioDomain;
  /** Absent when the viewer cannot open the section. */
  readonly to?: string;
}

function StatCard({ card }: { card: CountCard }) {
  const body = (
    <>
      <span className="stat-card__label">{card.label}</span>
      <span className="stat-card__value">{formatArabicInteger(card.value)}</span>
    </>
  );
  return card.to ? (
    <Link to={card.to} className="card stat-card" data-domain={card.domain}>
      {body}
    </Link>
  ) : (
    <article className="card stat-card" data-domain={card.domain}>
      {body}
    </article>
  );
}

function AttentionRow({
  title,
  to,
  meta,
  badge,
}: {
  title: string;
  to?: string;
  meta: ReactNode;
  badge: ReactNode;
}) {
  return (
    <article className="episode-row episode-row--overview">
      <div className="row-copy">
        {to ? (
          <Link to={to} className="text-link row-copy__title">
            {title}
          </Link>
        ) : (
          <p className="row-copy__title">{title}</p>
        )}
        <p className="row-copy__meta row-copy__meta--parts">{meta}</p>
      </div>
      {badge}
    </article>
  );
}

const byLatest = (a: Episode, b: Episode) =>
  new Date(b.publishedAt ?? b.updatedAt).getTime() -
  new Date(a.publishedAt ?? a.updatedAt).getTime();

const bySoonest = (a: Episode, b: Episode) =>
  new Date(a.scheduledAt ?? a.updatedAt).getTime() -
  new Date(b.scheduledAt ?? b.updatedAt).getTime();

const byRecentlyEdited = (a: Article | Episode, b: Article | Episode) =>
  new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();

export function OverviewView() {
  const { viewer } = useAdminAuth();
  const { data } = useStudioData();
  const canView = (page: Parameters<typeof canViewPage>[1]) =>
    viewer ? canViewPage(viewer, page) : false;
  const canViewEpisodes = canView('episodes');
  const canViewArticles = canView('articles');

  const publishedEpisodes = useMemo(
    () => data.episodes.filter((episode) => episode.status === 'published').sort(byLatest),
    [data.episodes],
  );
  const scheduledEpisodes = useMemo(
    () => data.episodes.filter((episode) => episode.status === 'scheduled').sort(bySoonest),
    [data.episodes],
  );
  const draftEpisodes = useMemo(
    () => data.episodes.filter((episode) => episode.status === 'draft').sort(byRecentlyEdited),
    [data.episodes],
  );
  const draftArticles = useMemo(
    () => data.articles.filter((article) => article.status === 'draft').sort(byRecentlyEdited),
    [data.articles],
  );
  const publishedArticles = data.articles.filter((article) => article.status === 'published');
  const showName = (episode: Episode) =>
    data.shows.find((show) => show.id === episode.showId)?.name ?? 'برنامج غير محدد';

  const cards: CountCard[] = [
    {
      key: 'shows',
      label: 'البرامج',
      value: data.shows.length,
      domain: 'shows',
      to: canView('shows') ? adminPaths.shows : undefined,
    },
    {
      key: 'published-episodes',
      label: 'حلقات منشورة',
      value: publishedEpisodes.length,
      domain: 'episodes',
      to: canViewEpisodes ? `${adminPaths.episodes}?status=published` : undefined,
    },
    {
      key: 'episodes-in-progress',
      label: 'حلقات قيد العمل',
      value: scheduledEpisodes.length + draftEpisodes.length,
      domain: 'episodes',
      to: canViewEpisodes ? adminPaths.episodes : undefined,
    },
    {
      key: 'published-articles',
      label: 'مقالات منشورة',
      value: publishedArticles.length,
      domain: 'articles',
      to: canViewArticles ? adminPaths.articles : undefined,
    },
    {
      key: 'draft-articles',
      label: 'مسودات مقالات',
      value: draftArticles.length,
      domain: 'articles',
      to: canViewArticles ? adminPaths.articles : undefined,
    },
  ];
  if (data.guestDirectory) {
    cards.push({
      key: 'guests',
      label: 'الضيوف',
      value: data.guestDirectory.guests.length,
      domain: 'guests',
      to: canView('guests') ? adminPaths.guests : undefined,
    });
  }

  const attentionCount = scheduledEpisodes.length + draftEpisodes.length + draftArticles.length;

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
        {cards.map((card) => (
          <StatCard key={card.key} card={card} />
        ))}
      </section>

      <div className="overview-grid">
        <section className="card section-card" aria-labelledby="attention-title">
          <div className="section-card__header">
            <div>
              <h2 id="attention-title">يحتاج متابعة</h2>
              <p>
                {attentionCount === 0
                  ? 'لا شيء ينتظرك الآن.'
                  : `غير المنشور الآن: ${formatArabicInteger(attentionCount)}`}
              </p>
            </div>
          </div>
          <div className="list-body">
            {attentionCount === 0 ? (
              <p className="empty-state">كل الحلقات والمقالات منشورة.</p>
            ) : null}
            {scheduledEpisodes.map((episode) => (
              <AttentionRow
                key={episode.id}
                title={episode.title}
                to={canViewEpisodes ? adminPaths.episode(episode.id) : undefined}
                meta={
                  <>
                    <span>{showName(episode)}</span>
                    <span>{formatEpisodeTimeline(episode)}</span>
                  </>
                }
                badge={<StatusBadge status="scheduled" />}
              />
            ))}
            {draftEpisodes.map((episode) => (
              <AttentionRow
                key={episode.id}
                title={episode.title}
                to={canViewEpisodes ? adminPaths.episode(episode.id) : undefined}
                meta={
                  <>
                    <span>{showName(episode)}</span>
                    <span>{formatEpisodeTimeline(episode)}</span>
                  </>
                }
                badge={<StatusBadge status="draft" label="مسودة حلقة" />}
              />
            ))}
            {draftArticles.map((article) => (
              <AttentionRow
                key={article.id}
                title={article.title}
                to={canViewArticles ? adminPaths.article(article.id) : undefined}
                meta={
                  <>
                    <span>{article.author.displayName}</span>
                    <span>آخر تعديل {formatArabicDate(article.updatedAt)}</span>
                  </>
                }
                badge={<StatusBadge status="draft" label="مسودة مقال" />}
              />
            ))}
          </div>
        </section>

        <section className="card section-card" aria-labelledby="latest-episodes-title">
          <div className="section-card__header">
            <h2 id="latest-episodes-title">أحدث الحلقات المنشورة</h2>
            {canViewEpisodes ? (
              <Link to={`${adminPaths.episodes}?status=published`} className="button button--quiet">
                عرض الحلقات المنشورة
              </Link>
            ) : null}
          </div>
          <div className="list-body">
            {publishedEpisodes.length === 0 ? (
              <p className="empty-state">لم تُنشر أي حلقة بعد.</p>
            ) : null}
            {publishedEpisodes.slice(0, 5).map((episode) => (
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
                  <p className="row-copy__meta row-copy__meta--parts">
                    <span>{showName(episode)}</span>
                    <span>
                      {episode.durationMinutes == null
                        ? 'المدة غير محددة'
                        : `${formatArabicInteger(episode.durationMinutes)} د`}
                    </span>
                    <span>{formatEpisodeTimeline(episode)}</span>
                  </p>
                </div>
                <StatusBadge status={episode.status} />
              </article>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
