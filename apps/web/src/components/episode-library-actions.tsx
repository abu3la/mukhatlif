'use client';
import { useRef, useState } from 'react';
import { useCustomer } from './customer-provider';
import { usePlayer, type PlayerEpisode } from './player';
import { BrandIcon } from './brand-icon';
import { formatDuration } from './formatting';
import { formatPlaybackTime } from './player-utils';

export function EpisodeLibraryActions({
  episode,
  compact = false,
}: {
  episode: PlayerEpisode;
  compact?: boolean;
}) {
  const customer = useCustomer();
  const player = usePlayer();
  const dialog = useRef<HTMLDialogElement>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [playlist, setPlaylist] = useState('');
  const [newName, setNewName] = useState('');
  const saved = customer.library.savedEpisodeIds.includes(episode.id);
  const queued = customer.library.queueEpisodeIds.includes(episode.id);
  const run = async (action: () => Promise<unknown>, success: string) => {
    if (!customer.requireAccount()) return;
    setBusy(true);
    setMessage('');
    try {
      await action();
      setMessage(success);
    } catch {
      setMessage('تعذّر الحفظ. حاول مرة أخرى.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="episode-library-actions">
      <button
        type="button"
        className="icon-action"
        disabled={busy}
        aria-pressed={saved}
        aria-label={saved ? `إزالة ${episode.title} من المحفوظات` : `حفظ ${episode.title}`}
        onClick={() =>
          void run(
            () => customer.toggleSaved('episode', episode.id),
            saved ? 'أُزيلت من المحفوظات.' : 'حُفظت الحلقة.',
          )
        }
      >
        <BrandIcon name={saved ? 'saved' : 'save'} />
      </button>
      <button
        type="button"
        className="icon-action"
        disabled={busy || queued}
        aria-label={queued ? 'الحلقة في الانتظار' : `إضافة ${episode.title} إلى الانتظار`}
        onClick={() =>
          void run(
            () => customer.updateQueue([...customer.library.queueEpisodeIds, episode.id]),
            'أُضيفت إلى الانتظار.',
          )
        }
      >
        <BrandIcon name="queue" />
      </button>
      {!compact && (
        <>
          <button
            type="button"
            className="icon-action"
            aria-label="إضافة إلى قائمة تشغيل"
            onClick={() => {
              if (customer.requireAccount()) dialog.current?.showModal();
            }}
          >
            <BrandIcon name="plus" />
          </button>
          {player.episode?.id === episode.id && (
            <button
              className="icon-action"
              aria-label="احفظ اللحظة"
              onClick={() =>
                void run(
                  () => customer.addBookmark(episode.id, Math.floor(player.currentTime)),
                  `حُفظت اللحظة عند ${formatPlaybackTime(player.currentTime)}.`,
                )
              }
            >
              <BrandIcon name="saved" />
            </button>
          )}
        </>
      )}
      {message && (
        <span className="action-message" role="status">
          {message}
        </span>
      )}
      <dialog className="customer-dialog" ref={dialog}>
        <div className="customer-dialog__head">
          <h2>أضف إلى قائمة تشغيل</h2>
          <button
            className="icon-action"
            aria-label="إغلاق"
            onClick={() => dialog.current?.close()}
          >
            <BrandIcon name="close" />
          </button>
        </div>
        {customer.library.playlists.length ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const selected = customer.library.playlists.find((item) => item.id === playlist);
              if (!selected) return;
              void run(async () => {
                await customer.mutateLibrary(`/playlists/${selected.id}`, 'PATCH', {
                  episodeIds: [...new Set([...selected.episodeIds, episode.id])],
                });
                dialog.current?.close();
              }, 'أُضيفت الحلقة إلى القائمة.');
            }}
          >
            <label>
              قائمة التشغيل
              <select
                required
                value={playlist}
                onChange={(event) => setPlaylist(event.target.value)}
              >
                <option value="">اختر قائمة</option>
                {customer.library.playlists.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={busy}>
              أضف الحلقة
            </button>
          </form>
        ) : (
          <p>اجمع الحلقات التي تهمك في قائمة جديدة.</p>
        )}
        <form
          className="playlist-create-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!newName.trim()) return;
            void run(async () => {
              const before = new Set(customer.library.playlists.map((item) => item.id));
              const next = await customer.mutateLibrary('/playlists', 'POST', {
                name: newName.trim(),
              });
              const created = next.playlists.find((item) => !before.has(item.id));
              if (!created) throw new Error('Playlist was not created');
              await customer.mutateLibrary(`/playlists/${created.id}`, 'PATCH', {
                episodeIds: [episode.id],
              });
              setNewName('');
              dialog.current?.close();
            }, 'أنشأنا القائمة وأضفنا الحلقة.');
          }}
        >
          <label>
            اسم القائمة الجديدة
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              required
              maxLength={100}
            />
          </label>
          <button type="submit" disabled={busy}>
            أنشئ القائمة وأضف الحلقة
          </button>
        </form>
        {message && <p role="status">{message}</p>}
      </dialog>
    </div>
  );
}
export function EpisodeProgress({ episode }: { episode: PlayerEpisode }) {
  const { library } = useCustomer();
  const player = usePlayer();
  const position =
    player.episode?.id === episode.id
      ? player.currentTime
      : (library.progress.find((item) => item.episodeId === episode.id)?.positionSec ?? 0);
  const duration = episode.durationSec ?? 0;
  if (position < 15 || !duration || position >= duration - 5) return null;
  return (
    <div className="episode-progress">
      <progress max={duration} value={position} aria-label="تقدم الاستماع" />
      <span>بقي {formatDuration(duration - position)}</span>
    </div>
  );
}
