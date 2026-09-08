'use client';

import { ContentSkeleton } from './content-skeleton';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useCustomer } from './customer-provider';
import { CustomerDialog, CustomerField } from './customer-ui';
import { formatPlaybackTime } from './player-utils';
import { useEpisodePosition } from './episode-position';
import type { PlayerEpisode } from './player';
import { customerError } from '@/lib/customer-utils';
import { ShareButton } from './public-content-controls';

type MomentDialog =
  { kind: 'save'; seconds: number } | { kind: 'edit' | 'delete'; id: string; label: string };
export function EpisodeMoments({
  episodeId,
  title,
  episode,
  videoId,
  initialSeconds = 0,
}: {
  episodeId: string;
  title: string;
  episode: PlayerEpisode | null;
  videoId?: string | null;
  initialSeconds?: number;
}) {
  const customer = useCustomer(),
    position = useEpisodePosition(episode, videoId, initialSeconds);
  const moments = customer.library.bookmarks
    .filter((moment) => moment.episodeId === episodeId)
    .sort((a, b) => a.positionSec - b.positionSec);
  const [dialog, setDialog] = useState<MomentDialog | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  function open(next: MomentDialog) {
    if (!customer.requireAccount()) return;
    setError('');
    setDialog(next);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog || busy) return;
    const label = String(new FormData(event.currentTarget).get('label') || '').trim();
    setBusy(true);
    setError('');
    try {
      if (dialog.kind === 'save') await customer.addBookmark(episodeId, dialog.seconds, label);
      else if (dialog.kind === 'edit') {
        await customer.mutateLibrary('/bookmarks/' + encodeURIComponent(dialog.id), 'PATCH', {
          label,
        });
        customer.notify('حفظنا اسم اللحظة.');
      } else {
        await customer.mutateLibrary('/bookmarks/' + encodeURIComponent(dialog.id), 'DELETE');
        customer.notify('حذفنا اللحظة من مكتبتك.');
      }
      setDialog(null);
    } catch (failure) {
      setError(customerError(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="public-moments" aria-labelledby="moments-title">
      <div className="content-section__header">
        <h2 className="content-section__title" id="moments-title">
          لحظاتك من الحلقة
        </h2>
        <button
          type="button"
          className="customer-secondary"
          disabled={customer.loading}
          onClick={() => open({ kind: 'save', seconds: position.seconds })}
        >
          احفظ لحظة <bdi>{formatPlaybackTime(position.seconds)}</bdi>
        </button>
      </div>
      {customer.loading ? (
        <ContentSkeleton label="تحميل لحظاتك" variant="rows" />
      ) : !customer.user ? (
        <p>
          احفظ فكرة سمعتها لتعود إليها في أي وقت.{' '}
          <Link href={'/login?next=' + encodeURIComponent('/episodes/' + episodeId)}>
            سجّل الدخول
          </Link>
        </p>
      ) : customer.error ? (
        <p role="alert">{customer.error}</p>
      ) : moments.length ? (
        <ol className="public-moments__list">
          {moments.map((moment) => (
            <li key={moment.id}>
              <button
                type="button"
                className="public-moments__seek"
                onClick={() => position.seek(moment.positionSec)}
              >
                <bdi>{formatPlaybackTime(moment.positionSec)}</bdi>
                <span>{moment.label || 'لحظة محفوظة'}</span>
              </button>
              <div className="public-reading-controls">
                <ShareButton
                  title={title}
                  path={'/episodes/' + encodeURIComponent(episodeId) + '?t=' + moment.positionSec}
                />
                <button
                  className="public-text-action"
                  onClick={() => open({ kind: 'edit', id: moment.id, label: moment.label })}
                >
                  تعديل
                </button>
                <button
                  className="public-text-action"
                  onClick={() => open({ kind: 'delete', id: moment.id, label: moment.label })}
                >
                  حذف
                </button>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p>لم تحفظ لحظة من هذه الحلقة بعد. شغّل الحلقة، ثم احفظ الفكرة التي لفتتك.</p>
      )}
      {dialog ? (
        <CustomerDialog
          title={
            dialog.kind === 'save'
              ? 'احفظ هذه اللحظة'
              : dialog.kind === 'edit'
                ? 'عدّل اسم اللحظة'
                : 'حذف اللحظة؟'
          }
          onClose={() => {
            if (!busy) setDialog(null);
          }}
        >
          <form className="customer-form" onSubmit={(event) => void submit(event)} aria-busy={busy}>
            {dialog.kind === 'delete' ? (
              <p>ستُحذف {dialog.label || 'هذه اللحظة'} من مكتبتك.</p>
            ) : (
              <>
                {dialog.kind === 'save' ? (
                  <p>
                    موضع الحفظ: <bdi>{formatPlaybackTime(dialog.seconds)}</bdi>
                  </p>
                ) : null}
                <CustomerField
                  name="label"
                  label="اسم اللحظة (اختياري)"
                  maxLength={300}
                  defaultValue={dialog.kind === 'edit' ? dialog.label : ''}
                  autoFocus
                />
              </>
            )}
            {error ? (
              <p role="alert" className="customer-error">
                {error}
              </p>
            ) : null}
            <button type="submit" className="customer-primary" disabled={busy}>
              {busy ? 'جارٍ الحفظ…' : dialog.kind === 'delete' ? 'احذف اللحظة' : 'احفظ'}
            </button>
          </form>
        </CustomerDialog>
      ) : null}
    </section>
  );
}
