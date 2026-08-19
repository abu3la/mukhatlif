import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { adminPaths, canManagePage, useAdminAuth, useStudioData } from '@/application';
import { getEpisodeOperationErrorMessage } from '@/features/episodes/model/episode-form';
import {
  formatArabicInteger,
  formatEpisodeTimeline,
  getEpisodeTransitionActions,
  matchesArabicSearch,
  type EpisodeId,
  type EpisodeStatus,
  type ShowId,
} from '@/lib';
import { PageHeader, PremiumMark, StatusBadge } from '@/shared/ui/primitives';

type StatusFilter = 'all' | EpisodeStatus;

const FILTERS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'الكل' },
  { value: 'draft', label: 'مسودات' },
  { value: 'scheduled', label: 'مجدولة' },
  { value: 'published', label: 'منشورة' },
  { value: 'archived', label: 'مؤرشفة' },
];

interface EpisodeRowOperation {
  readonly pendingStatus?: EpisodeStatus;
  readonly error?: string;
}

function parseStatusFilter(value: string | null): StatusFilter {
  return FILTERS.some((filter) => filter.value === value) ? (value as StatusFilter) : 'all';
}

function parseShowFilter(
  value: string | null,
  shows: ReadonlyArray<{ readonly id: ShowId }>,
): 'all' | ShowId {
  return value !== null && shows.some((show) => show.id === value) ? (value as ShowId) : 'all';
}

export function EpisodesView() {
  const { viewer } = useAdminAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, transitionEpisodeStatus } = useStudioData();
  const canManageEpisodes = viewer ? canManagePage(viewer, 'episodes') : false;
  const status = parseStatusFilter(searchParams.get('status'));
  const query = searchParams.get('q') ?? '';
  const showId = parseShowFilter(searchParams.get('show'), data.shows);
  const [rowOperations, setRowOperations] = useState<
    Partial<Record<EpisodeId, EpisodeRowOperation>>
  >({});

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    let changed = false;

    if (next.has('status') && status === 'all') {
      next.delete('status');
      changed = true;
    }
    if (next.has('q') && query === '') {
      next.delete('q');
      changed = true;
    }
    if (next.has('show') && showId === 'all') {
      next.delete('show');
      changed = true;
    }

    if (changed) setSearchParams(next, { replace: true });
  }, [query, searchParams, setSearchParams, showId, status]);

  function setFilterParam(name: 'status' | 'q' | 'show', value: string, defaultValue: string) {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value === defaultValue) next.delete(name);
        else next.set(name, value);
        return next;
      },
      { replace: true },
    );
  }

  const counts = useMemo(
    () => ({
      all: data.episodes.length,
      draft: data.episodes.filter((episode) => episode.status === 'draft').length,
      scheduled: data.episodes.filter((episode) => episode.status === 'scheduled').length,
      published: data.episodes.filter((episode) => episode.status === 'published').length,
      archived: data.episodes.filter((episode) => episode.status === 'archived').length,
    }),
    [data.episodes],
  );

  const filteredEpisodes = useMemo(
    () =>
      data.episodes.filter((episode) => {
        const show = data.shows.find((item) => item.id === episode.showId);
        return (
          (status === 'all' || episode.status === status) &&
          (showId === 'all' || episode.showId === showId) &&
          matchesArabicSearch(query, episode.title, show?.name, episode.episodeNumber)
        );
      }),
    [data.episodes, data.shows, query, showId, status],
  );

  async function runAction(episodeId: EpisodeId, to: EpisodeStatus) {
    if (!canManageEpisodes) return;
    if (to === 'scheduled') {
      navigate(`${adminPaths.episode(episodeId)}?intent=schedule`);
      return;
    }

    setRowOperations((current) => ({
      ...current,
      [episodeId]: { pendingStatus: to },
    }));
    try {
      await transitionEpisodeStatus(episodeId, to);
      setRowOperations((current) => {
        const next = { ...current };
        delete next[episodeId];
        return next;
      });
    } catch (cause) {
      setRowOperations((current) => ({
        ...current,
        [episodeId]: { error: getEpisodeOperationErrorMessage(cause, 'transition') },
      }));
    }
  }

  return (
    <>
      <PageHeader
        title="الحلقات"
        action={
          canManageEpisodes ? (
            <Link to={adminPaths.episodeNew} className="button button--primary">
              حلقة جديدة
            </Link>
          ) : null
        }
      />

      <div className="filters-layout">
        <aside className="filter-rail" aria-label="تصفية الحلقات حسب الحالة">
          {FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              className={`filter-rail__item ${status === filter.value ? 'filter-rail__item--active' : ''}`}
              aria-pressed={status === filter.value}
              onClick={() => setFilterParam('status', filter.value, 'all')}
            >
              <span>{filter.label}</span>
              <span className="filter-rail__count">
                {formatArabicInteger(counts[filter.value])}
              </span>
            </button>
          ))}
        </aside>

        <section className="card" aria-label="قائمة الحلقات">
          <div className="search-bar">
            <label>
              <span className="sr-only">البحث في الحلقات</span>
              <input
                className="control"
                type="search"
                value={query}
                onChange={(event) => setFilterParam('q', event.target.value, '')}
                placeholder="ابحث بالعنوان أو رقم الحلقة…"
              />
            </label>
            <label>
              <span className="sr-only">تصفية حسب البرنامج</span>
              <select
                className="control"
                value={showId}
                onChange={(event) => setFilterParam('show', event.target.value, 'all')}
              >
                <option value="all">كل البرامج</option>
                {data.shows.map((show) => (
                  <option key={show.id} value={show.id}>
                    {show.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {filteredEpisodes.length === 0 ? (
            <p className="empty-state">
              {query ? 'لا توجد حلقة تطابق بحثك. جرّب كلمة أخرى.' : 'لا توجد حلقات في هذه الحالة.'}
            </p>
          ) : (
            <div className="list-body">
              {filteredEpisodes.map((episode) => {
                const show = data.shows.find((item) => item.id === episode.showId);
                const rowOperation = rowOperations[episode.id];
                const errorId = `episode-${episode.id}-operation-error`;
                return (
                  <article
                    className="episode-row"
                    key={episode.id}
                    aria-busy={Boolean(rowOperation?.pendingStatus)}
                    aria-describedby={rowOperation?.error ? errorId : undefined}
                  >
                    <div className="row-copy">
                      <Link
                        to={adminPaths.episode(episode.id)}
                        className="text-link row-copy__title"
                      >
                        {episode.title}
                      </Link>
                      {episode.premium ? <PremiumMark /> : null}
                      <p className="row-copy__meta">
                        {show?.name ?? 'برنامج غير محدد'} · حلقة{' '}
                        {episode.episodeNumber == null
                          ? 'غير مرقمة'
                          : formatArabicInteger(episode.episodeNumber)}{' '}
                        · {formatEpisodeTimeline(episode)}
                      </p>
                      {rowOperation?.error ? (
                        <p className="notice notice--error" id={errorId} role="alert">
                          {rowOperation.error}
                        </p>
                      ) : null}
                    </div>

                    {canManageEpisodes ? (
                      <div className="row-actions" aria-label={`إجراءات ${episode.title}`}>
                        {getEpisodeTransitionActions(episode.status).map((action) => (
                          <button
                            key={action.to}
                            type="button"
                            className="button button--quiet"
                            disabled={Boolean(rowOperation?.pendingStatus)}
                            onClick={() => void runAction(episode.id, action.to)}
                          >
                            {rowOperation?.pendingStatus === action.to
                              ? 'جارٍ التحديث'
                              : action.label}
                          </button>
                        ))}
                      </div>
                    ) : null}

                    <StatusBadge status={episode.status} />
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
