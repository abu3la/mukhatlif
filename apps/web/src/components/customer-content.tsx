'use client';

import { ContentSkeleton } from './content-skeleton';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { type Episode, type Show, youtubeThumbnailUrl } from '@mukhtalif/types';
import { customerError } from '@/lib/customer-utils';
import { useCustomer } from './customer-provider';
import { CustomerEmpty, CustomerIcon } from './customer-ui';
import { PlayEpisodeButton, type PlayerEpisode } from './player';
import { formatDuration } from './formatting';

export function FollowShowButton({ showId }: { showId: string }) {
  const customer = useCustomer();
  const [busy, setBusy] = useState(false);
  const followed = customer.library.followedShowIds.includes(showId);
  return (
    <button
      type="button"
      className="customer-primary customer-follow"
      aria-pressed={followed}
      disabled={busy || customer.loading}
      onClick={async () => {
        setBusy(true);
        try {
          await customer.toggleFollow(showId);
        } catch (failure) {
          customer.notify(customerError(failure));
        } finally {
          setBusy(false);
        }
      }}
    >
      {followed && <CustomerIcon name="check" />}
      {followed ? 'تتابع البرنامج' : 'تابع البرنامج'}
    </button>
  );
}

export function ArticleLibraryActions({ articleId }: { articleId: string }) {
  const customer = useCustomer();
  const [busy, setBusy] = useState(false);
  const saved = customer.library.savedArticleIds.includes(articleId);
  return (
    <button
      type="button"
      className="customer-text-button customer-inline-save"
      aria-pressed={saved}
      disabled={busy || customer.loading}
      onClick={async () => {
        setBusy(true);
        try {
          await customer.toggleSaved('article', articleId);
        } catch (failure) {
          customer.notify(customerError(failure));
        } finally {
          setBusy(false);
        }
      }}
    >
      <CustomerIcon name={saved ? 'check' : 'save'} />
      {saved ? 'محفوظة' : 'احفظ القراءة'}
    </button>
  );
}

export function useCustomerEpisodes(episodeIds: string[]) {
  const { publicRead } = useCustomer();
  const key = JSON.stringify(episodeIds);
  const [data, setData] = useState<{
    key: string;
    episodes: Episode[];
    shows: Show[];
    unavailable: string[];
    error: string;
  }>({ key: '', episodes: [], shows: [], unavailable: [], error: '' });
  useEffect(() => {
    let active = true;
    const ids = JSON.parse(key) as string[];
    if (!ids.length) {
      setData({ key, episodes: [], shows: [], unavailable: [], error: '' });
      return;
    }
    void Promise.all([
      Promise.allSettled(
        ids.map((id) => publicRead<Episode>(`/episodes/${encodeURIComponent(id)}`)),
      ),
      publicRead<Show[]>('/shows'),
    ])
      .then(([results, shows]) => {
        if (!active) return;
        const episodes: Episode[] = [];
        const unavailable: string[] = [];
        results.forEach((result, index) => {
          if (result.status === 'fulfilled') episodes.push(result.value);
          else unavailable.push(ids[index]);
        });
        setData({ key, episodes, shows, unavailable, error: '' });
      })
      .catch((failure) => {
        if (active)
          setData({ key, episodes: [], shows: [], unavailable: [], error: customerError(failure) });
      });
    return () => {
      active = false;
    };
  }, [key, publicRead]);
  return { ...data, loading: data.key !== key };
}

export function customerPlayerEpisode(
  episode: Episode,
  show: Show | undefined,
  apiOrigin: string,
): PlayerEpisode {
  return {
    id: episode.id,
    title: episode.titleAr,
    showTitle: show?.titleAr,
    durationSec: episode.durationSec,
    youtubeVideoId: episode.premium ? null : episode.youtubeVideoId,
    href: `/episodes/${encodeURIComponent(episode.id)}`,
    audioSrc: `${apiOrigin}/episodes/${encodeURIComponent(episode.id)}/audio`,
    artworkUrl: youtubeThumbnailUrl(episode.youtubeVideoId) || show?.artworkUrl,
  };
}

export function CustomerEpisodeRow({
  episode,
  show,
  children,
}: {
  episode: Episode;
  show?: Show;
  children?: ReactNode;
}) {
  const customer = useCustomer();
  const [busy, setBusy] = useState(false);
  const artwork = youtubeThumbnailUrl(episode.youtubeVideoId) || show?.artworkUrl;
  const position =
    customer.library.progress.find((progress) => progress.episodeId === episode.id)?.positionSec ??
    0;
  const saved = customer.library.savedEpisodeIds.includes(episode.id);
  return (
    <article className="customer-episode-row">
      {artwork ? (
        <Link href={`/episodes/${encodeURIComponent(episode.id)}`} tabIndex={-1} aria-hidden="true">
          <img src={artwork} width="90" height="90" alt="" loading="lazy" />
        </Link>
      ) : (
        <span aria-hidden="true" />
      )}
      <div>
        <h3>
          <Link href={`/episodes/${encodeURIComponent(episode.id)}`}>{episode.titleAr}</Link>
        </h3>
        <p>
          {show?.titleAr}
          {show && ' · '}
          {formatDuration(episode.durationSec)}
        </p>
        {position > 0 && (
          <div className="customer-progress">
            <progress
              value={Math.min(position, episode.durationSec)}
              max={Math.max(episode.durationSec, 1)}
              aria-label="تقدم الاستماع"
            />
            <span>
              {position >= episode.durationSec - 5
                ? 'اكتمل الاستماع'
                : `بقي ${formatDuration(Math.max(0, episode.durationSec - position))}`}
            </span>
          </div>
        )}
      </div>
      <div className="customer-episode-actions">
        {customer.config.apiOrigin && !episode.premium && (
          <PlayEpisodeButton
            variant="icon"
            episode={customerPlayerEpisode(episode, show, customer.config.apiOrigin)}
          />
        )}
        {episode.premium && <span className="customer-muted">للمشتركين</span>}
        <button
          type="button"
          className="customer-icon-button"
          aria-label={saved ? `إزالة ${episode.titleAr} من المحفوظات` : `حفظ ${episode.titleAr}`}
          aria-pressed={saved}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await customer.toggleSaved('episode', episode.id);
            } catch (failure) {
              customer.notify(customerError(failure));
            } finally {
              setBusy(false);
            }
          }}
        >
          <CustomerIcon name={saved ? 'check' : 'save'} />
        </button>
        {children}
      </div>
    </article>
  );
}

export function CustomerEpisodeList({
  episodeIds,
  onUnavailableRemove,
}: {
  episodeIds: string[];
  onUnavailableRemove?: (id: string) => void;
}) {
  const { episodes, shows, loading, error, unavailable } = useCustomerEpisodes(episodeIds);
  if (loading) return <ContentSkeleton label="تحميل الحلقات" variant="rows" />;
  if (error)
    return (
      <p className="customer-error" role="alert">
        {error}
      </p>
    );
  return (
    <div className="customer-episode-list">
      {episodes.map((episode) => (
        <CustomerEpisodeRow
          key={episode.id}
          episode={episode}
          show={shows.find((show) => show.id === episode.showId)}
        />
      ))}
      {unavailable.map((id) => (
        <div key={id} className="customer-picker-result">
          <p>هذه الحلقة غير متاحة الآن.</p>
          {onUnavailableRemove && (
            <button className="customer-text-button" onClick={() => onUnavailableRemove(id)}>
              إزالة
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function ContinueListening() {
  const customer = useCustomer();
  if (customer.loading) return <ContentSkeleton label="تحميل مكتبتك" variant="rows" />;
  if (!customer.user)
    return (
      <CustomerEmpty
        title="توقّف متى شئت، وعد من حيث توقفت"
        href="/login?next=%2Flibrary%3Ftab%3Dhistory"
        action="تسجيل الدخول"
      >
        احفظ تقدمك في حسابك، وأكمل الاستماع من أي جهاز.
      </CustomerEmpty>
    );
  const ids = [...customer.library.progress]
    .filter((item) => item.positionSec > 0)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 3)
    .map((item) => item.episodeId);
  if (!ids.length)
    return (
      <CustomerEmpty title="لم تبدأ الاستماع بعد" href="/episodes">
        اختر حلقتك الأولى، وستجد تقدمك هنا.
      </CustomerEmpty>
    );
  return <CustomerEpisodeList episodeIds={ids} />;
}
