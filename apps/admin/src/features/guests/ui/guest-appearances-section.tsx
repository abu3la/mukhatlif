import { useState } from 'react';
import { Link } from 'react-router-dom';
import { adminPaths } from '@/application';
import { Button, Input, PremiumMark, Select, StatusBadge } from '@/shared/ui/primitives';
import {
  formatAdditionalEpisodeCount,
  formatArabicInteger,
  formatEpisodeTimeline,
  type Episode,
  type EpisodeId,
  type EpisodeStatus,
  type Show,
  type ShowId,
} from '@/lib';
import { GuestAppearancePicker } from './guest-appearance-picker';

export type GuestAppearanceSortMode = 'newest' | 'oldest' | 'show';

interface GuestAppearancesSectionProps {
  appearances: Episode[];
  visibleAppearances: Episode[];
  filteredAppearanceCount: number;
  hasFilters: boolean;
  remainingCount: number;
  expanded: boolean;
  pickerOpen: boolean;
  pickerQuery: string;
  pickerShow: 'all' | ShowId;
  pickerResults: Episode[];
  appearanceQuery: string;
  appearanceShow: 'all' | ShowId;
  appearanceStatus: 'all' | EpisodeStatus;
  sort: GuestAppearanceSortMode;
  shows: Show[];
  readOnly?: boolean;
  canOpenEpisodeEditor?: boolean;
  onPickerToggle: () => void;
  onPickerQueryChange: (query: string) => void;
  onPickerShowChange: (showId: 'all' | ShowId) => void;
  onAppearanceAdd: (episodeId: EpisodeId) => Promise<void>;
  onAppearanceRemove: (episodeId: EpisodeId) => Promise<void>;
  onAppearanceQueryChange: (query: string) => void;
  onAppearanceShowChange: (showId: 'all' | ShowId) => void;
  onAppearanceStatusChange: (status: 'all' | EpisodeStatus) => void;
  onSortChange: (sort: GuestAppearanceSortMode) => void;
  onExpandedToggle: () => void;
}

export function GuestAppearancesSection({
  appearances,
  visibleAppearances,
  filteredAppearanceCount,
  hasFilters,
  remainingCount,
  expanded,
  pickerOpen,
  pickerQuery,
  pickerShow,
  pickerResults,
  appearanceQuery,
  appearanceShow,
  appearanceStatus,
  sort,
  shows,
  readOnly = false,
  canOpenEpisodeEditor = false,
  onPickerToggle,
  onPickerQueryChange,
  onPickerShowChange,
  onAppearanceAdd,
  onAppearanceRemove,
  onAppearanceQueryChange,
  onAppearanceShowChange,
  onAppearanceStatusChange,
  onSortChange,
  onExpandedToggle,
}: GuestAppearancesSectionProps) {
  const [pendingRemovalId, setPendingRemovalId] = useState<EpisodeId | null>(null);
  const [operationError, setOperationError] = useState('');

  async function removeAppearance(episodeId: EpisodeId) {
    if (readOnly || pendingRemovalId) return;
    setPendingRemovalId(episodeId);
    setOperationError('');
    try {
      await onAppearanceRemove(episodeId);
    } catch {
      setOperationError('تعذّرت إزالة الظهور. حاول مرة أخرى.');
    } finally {
      setPendingRemovalId(null);
    }
  }

  return (
    <div className="profile-section">
      <div className="profile-section__header">
        <h2>
          الحلقات التي ظهر فيها ·{' '}
          {hasFilters
            ? `${formatArabicInteger(filteredAppearanceCount)} من ${formatArabicInteger(appearances.length)}`
            : formatArabicInteger(appearances.length)}
        </h2>
        {readOnly ? null : (
          <Button type="button" onClick={onPickerToggle}>
            {pickerOpen ? 'إغلاق' : 'إضافة ظهور'}
          </Button>
        )}
      </div>

      {!readOnly && pickerOpen ? (
        <GuestAppearancePicker
          query={pickerQuery}
          selectedShow={pickerShow}
          shows={shows}
          results={pickerResults}
          onQueryChange={onPickerQueryChange}
          onShowChange={onPickerShowChange}
          onAdd={onAppearanceAdd}
        />
      ) : null}

      {operationError ? (
        <p className="notice notice--error" role="alert">
          {operationError}
        </p>
      ) : null}

      {appearances.length > 3 ? (
        <div className="appearance-filter-bar">
          <label>
            <span className="sr-only">البحث في ظهور الضيف</span>
            <Input
              type="search"
              value={appearanceQuery}
              onChange={(event) => onAppearanceQueryChange(event.target.value)}
              placeholder="بحث في ظهوره…"
            />
          </label>
          <Select
            aria-label="تصفية ظهور الضيف حسب البرنامج"
            value={appearanceShow}
            onChange={(event) => onAppearanceShowChange(event.target.value as 'all' | ShowId)}
          >
            <option value="all">كل البرامج</option>
            {shows.map((show) => (
              <option key={show.id} value={show.id}>
                {show.name}
              </option>
            ))}
          </Select>
          <Select
            aria-label="تصفية ظهور الضيف حسب حالة الحلقة"
            value={appearanceStatus}
            onChange={(event) =>
              onAppearanceStatusChange(event.target.value as 'all' | EpisodeStatus)
            }
          >
            <option value="all">كل الحالات</option>
            <option value="draft">مسودة</option>
            <option value="scheduled">مجدولة</option>
            <option value="published">منشورة</option>
            <option value="archived">مؤرشفة</option>
          </Select>
          <Select
            aria-label="ترتيب ظهور الضيف"
            value={sort}
            onChange={(event) => onSortChange(event.target.value as GuestAppearanceSortMode)}
          >
            <option value="newest">الأحدث أولًا</option>
            <option value="oldest">الأقدم أولًا</option>
            <option value="show">حسب البرنامج</option>
          </Select>
        </div>
      ) : null}

      {visibleAppearances.length === 0 ? (
        <p className="empty-state">
          {appearances.length === 0 ? 'لم يظهر في أي حلقة بعد.' : 'لا يوجد ظهور يطابق هذه التصفية.'}
        </p>
      ) : (
        <div>
          {visibleAppearances.map((episode) => {
            const show = shows.find((item) => item.id === episode.showId);
            return (
              <article className="appearance-row" key={episode.id}>
                <div className="row-copy">
                  {canOpenEpisodeEditor ? (
                    <Link to={adminPaths.episode(episode.id)} className="text-link row-copy__title">
                      {episode.title}
                    </Link>
                  ) : (
                    <p className="row-copy__title">{episode.title}</p>
                  )}
                  {episode.premium ? <PremiumMark /> : null}
                  <p className="row-copy__meta">
                    {show?.name} · حلقة{' '}
                    {episode.episodeNumber == null
                      ? 'غير مرقمة'
                      : formatArabicInteger(episode.episodeNumber)}{' '}
                    · {formatEpisodeTimeline(episode)}
                  </p>
                </div>
                {readOnly ? (
                  <span aria-hidden="true" />
                ) : (
                  <Button
                    type="button"
                    variant="danger"
                    disabled={pendingRemovalId !== null}
                    aria-busy={pendingRemovalId === episode.id}
                    onClick={() => void removeAppearance(episode.id)}
                  >
                    {pendingRemovalId === episode.id ? 'جارٍ الإزالة…' : 'إزالة الظهور'}
                  </Button>
                )}
                <StatusBadge status={episode.status} />
              </article>
            );
          })}
          {filteredAppearanceCount > 4 ? (
            <Button type="button" className="full-width-button" onClick={onExpandedToggle}>
              {expanded ? 'طيّ القائمة' : `عرض ${formatAdditionalEpisodeCount(remainingCount)}`}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
