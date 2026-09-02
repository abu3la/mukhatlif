import { useState } from 'react';
import { Button, Input, Select, StatusBadge } from '@/shared/ui/primitives';
import {
  formatArabicInteger,
  formatEpisodeTimeline,
  formatResultCount,
  type Episode,
  type EpisodeId,
  type Show,
  type ShowId,
} from '@/lib';

interface GuestAppearancePickerProps {
  query: string;
  selectedShow: 'all' | ShowId;
  shows: Show[];
  results: Episode[];
  onQueryChange: (query: string) => void;
  onShowChange: (showId: 'all' | ShowId) => void;
  onAdd: (episodeId: EpisodeId) => Promise<void>;
}

export function GuestAppearancePicker({
  query,
  selectedShow,
  shows,
  results,
  onQueryChange,
  onShowChange,
  onAdd,
}: GuestAppearancePickerProps) {
  const [pendingEpisodeId, setPendingEpisodeId] = useState<EpisodeId | null>(null);
  const [operationError, setOperationError] = useState('');

  async function addAppearance(episodeId: EpisodeId) {
    if (pendingEpisodeId) return;
    setPendingEpisodeId(episodeId);
    setOperationError('');
    try {
      await onAdd(episodeId);
    } catch {
      setOperationError('تعذّرت إضافة الظهور. حاول مرة أخرى.');
    } finally {
      setPendingEpisodeId(null);
    }
  }

  return (
    <div className="picker-panel">
      <div className="picker-search">
        <label>
          <span className="sr-only">البحث عن حلقة لإضافتها</span>
          <Input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="ابحث بالعنوان أو رقم الحلقة…"
          />
        </label>
        <label>
          <span className="sr-only">تصفية نتائج الحلقات حسب البرنامج</span>
          <Select
            value={selectedShow}
            onChange={(event) => onShowChange(event.target.value as 'all' | ShowId)}
          >
            <option value="all">كل البرامج</option>
            {shows.map((show) => (
              <option key={show.id} value={show.id}>
                {show.name}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <p className="picker-summary">
        {formatResultCount(results.length)}
        {results.length > 0 ? ' · تُعرض أول 5' : ''}
      </p>
      {operationError ? (
        <p className="notice notice--error" role="alert">
          {operationError}
        </p>
      ) : null}
      {results.length === 0 ? (
        <p className="empty-state">لا توجد حلقة مطابقة. جرّب كلمة أخرى أو غيّر البرنامج.</p>
      ) : (
        results.slice(0, 5).map((episode) => {
          const show = shows.find((item) => item.id === episode.showId);
          return (
            <div className="picker-row" key={episode.id}>
              <div className="row-copy">
                <p className="row-copy__title">{episode.title}</p>
                <p className="row-copy__meta">
                  {show?.name} · حلقة{' '}
                  {episode.episodeNumber == null
                    ? 'غير مرقمة'
                    : formatArabicInteger(episode.episodeNumber)}{' '}
                  · {formatEpisodeTimeline(episode)}
                </p>
              </div>
              <StatusBadge status={episode.status} />
              <Button
                type="button"
                disabled={pendingEpisodeId !== null}
                aria-busy={pendingEpisodeId === episode.id}
                onClick={() => void addAppearance(episode.id)}
              >
                {pendingEpisodeId === episode.id ? 'جارٍ الإضافة…' : 'إضافة'}
              </Button>
            </div>
          );
        })
      )}
      {results.length > 5 ? (
        <p className="picker-summary">
          ضيّق البحث بكلمة من العنوان أو برقم الحلقة للوصول إلى ما تريد.
        </p>
      ) : null}
    </div>
  );
}
