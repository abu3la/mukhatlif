'use client';

import Link from 'next/link';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import styles from './player.module.css';
import {
  PLAYBACK_RATES,
  clampMediaTime,
  finiteMediaTime,
  formatPlaybackTime,
  type PlaybackRate,
} from './player-utils';

import { useCustomer } from './customer-provider';
import { BrandIcon } from './brand-icon';
import { isYouTubeVideoId, youtubeThumbnailUrl, type Episode } from '@mukhtalif/types';
/**
 * Plain serializable episode data. Build `audioSrc` in a Server Component and
 * pass the resulting string across the client boundary; this module never
 * imports server configuration.
 */
export interface PlayerEpisode {
  artworkUrl?: string;
  youtubeVideoId?: string | null;
  id: string;
  title: string;
  audioSrc: string;
  showTitle?: string;
  href?: string;
  durationSec?: number;
}

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';

interface PlayerContextValue {
  episode: PlayerEpisode | null;
  status: PlayerStatus;
  isPlaying: boolean;
  canSeek: boolean;
  currentTime: number;
  duration: number;
  playbackRate: PlaybackRate;
  error: string | null;
  isCurrent: (episode: PlayerEpisode) => boolean;
  toggle: (episode: PlayerEpisode) => void;
  playFrom: (episode: PlayerEpisode, seconds: number) => void;
  skip: (seconds: number) => void;
  seek: (seconds: number) => void;
  setPlaybackRate: (rate: PlaybackRate) => void;
  close: () => void;
  pause: () => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

function classes(...values: Array<string | null | undefined | false>): string {
  return values.filter(Boolean).join(' ');
}

function mediaErrorMessage(media: HTMLMediaElement): string {
  switch (media.error?.code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return 'توقف تحميل الحلقة قبل اكتماله.';
    case MediaError.MEDIA_ERR_NETWORK:
      return 'تعذّر الاتصال بملف الحلقة. تحقق من الشبكة وحاول مجددًا.';
    case MediaError.MEDIA_ERR_DECODE:
      return 'تعذّر تشغيل صيغة ملف الحلقة على هذا الجهاز.';
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return 'ملف الحلقة غير متاح أو أن صيغته غير مدعومة.';
    default:
      return 'تعذّر تشغيل الحلقة الآن.';
  }
}

function statusLabel(status: PlayerStatus, error: string | null): string {
  if (error) return error;
  switch (status) {
    case 'loading':
      return 'جارٍ تجهيز الصوت…';
    case 'playing':
      return 'قيد التشغيل';
    case 'paused':
      return 'متوقفة مؤقتًا';
    case 'ended':
      return 'انتهت الحلقة';
    case 'error':
      return 'تعذّر تشغيل الحلقة';
    case 'idle':
      return 'جاهزة للاستماع';
  }
}

export function usePlayer(): PlayerContextValue {
  const value = useContext(PlayerContext);
  if (!value) throw new Error('usePlayer must be used inside PlayerProvider');
  return value;
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const customer = useCustomer();
  const customerRef = useRef(customer);
  customerRef.current = customer;
  const pendingPosition = useRef<number | null>(null);
  const pendingEpisodeId = useRef<string | null>(null);
  const lastSynced = useRef(0);
  const playRequest = useRef(0);
  const wantsPlayback = useRef(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const episodeRef = useRef<PlayerEpisode | null>(null);
  const [episode, setEpisode] = useState<PlayerEpisode | null>(null);
  const [status, setStatus] = useState<PlayerStatus>('idle');
  const [isPlaying, setIsPlaying] = useState(false);
  const [canSeek, setCanSeek] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRateState] = useState<PlaybackRate>(1);
  const [error, setError] = useState<string | null>(null);

  const isCurrent = useCallback(
    (candidate: PlayerEpisode) =>
      episodeRef.current?.id === candidate.id && episodeRef.current.audioSrc === candidate.audioSrc,
    [],
  );

  const syncProgress = useCallback((audio: HTMLAudioElement, force = false) => {
    const current = episodeRef.current;
    const account = customerRef.current;
    if (!current || !account.user || !Number.isFinite(audio.currentTime) || audio.readyState === 0)
      return;
    if (audio.currentSrc !== new URL(current.audioSrc, window.location.href).href) return;
    const now = Date.now();
    if (!force && now - lastSynced.current < 1000) return;
    lastSynced.current = now;
    void account.saveProgress(current.id, Math.floor(audio.currentTime)).catch(() => {});
  }, []);

  const play = useCallback((audio: HTMLAudioElement) => {
    const sequence = ++playRequest.current;
    wantsPlayback.current = true;
    window.dispatchEvent(new Event('mukhtalif:audio-start'));
    setError(null);
    setStatus('loading');
    const request = audio.play();
    void request.catch((reason: unknown) => {
      if (sequence !== playRequest.current) return;
      if (reason instanceof DOMException && reason.name === 'AbortError') return;
      wantsPlayback.current = false;
      setIsPlaying(false);
      setStatus('error');
      setError(
        reason instanceof DOMException && reason.name === 'NotAllowedError'
          ? 'منع المتصفح التشغيل. اضغط زر التشغيل مرة أخرى.'
          : 'تعذّر بدء تشغيل الحلقة. حاول مجددًا.',
      );
    });
  }, []);

  const toggle = useCallback(
    (candidate: PlayerEpisode) => {
      const audio = audioRef.current;
      if (!audio) return;

      if (isCurrent(candidate)) {
        if (wantsPlayback.current || !audio.paused) {
          ++playRequest.current;
          wantsPlayback.current = false;
          audio.pause();
          setStatus('paused');
          setIsPlaying(false);
          return;
        }
        if (audio.ended) audio.currentTime = 0;
        play(audio);
        return;
      }

      syncProgress(audio, true);
      ++playRequest.current;
      wantsPlayback.current = false;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      lastSynced.current = 0;
      episodeRef.current = candidate;
      setEpisode(candidate);
      const resume =
        customerRef.current.library.progress.find((item) => item.episodeId === candidate.id)
          ?.positionSec ?? 0;
      pendingPosition.current =
        (pendingEpisodeId.current === candidate.id ? pendingPosition.current : null) ??
        (candidate.durationSec && resume >= candidate.durationSec - 5 ? 0 : resume);
      pendingEpisodeId.current = candidate.id;
      setCurrentTime(pendingPosition.current);
      setDuration(finiteMediaTime(candidate.durationSec));
      setIsPlaying(false);
      setCanSeek(false);
      setError(null);

      const source = candidate.audioSrc.trim();
      if (!source) {
        setStatus('error');
        setError('لا يوجد ملف صوتي متاح لهذه الحلقة.');
        return;
      }

      audio.src = source;
      audio.playbackRate = playbackRate;
      audio.load();
      play(audio);
    },
    [isCurrent, play, playbackRate, syncProgress],
  );

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio || !episodeRef.current) return;
    const knownDuration = finiteMediaTime(audio.duration);
    if (!knownDuration) return;
    const next = clampMediaTime(seconds, knownDuration);
    try {
      audio.currentTime = next;
      setCurrentTime(next);
    } catch {
      setStatus('error');
      setError('تعذّر الانتقال إلى هذا الموضع في الحلقة.');
    }
  }, []);

  const playFrom = useCallback(
    (candidate: PlayerEpisode, seconds: number) => {
      if (isCurrent(candidate) && audioRef.current) {
        if (Number.isFinite(audioRef.current.duration)) seek(seconds);
        else {
          pendingPosition.current = clampMediaTime(seconds, 0);
          pendingEpisodeId.current = candidate.id;
        }
        play(audioRef.current);
      } else {
        pendingPosition.current = clampMediaTime(seconds, 0);
        pendingEpisodeId.current = candidate.id;
        toggle(candidate);
      }
    },
    [isCurrent, play, seek, toggle],
  );

  const skip = useCallback(
    (seconds: number) => {
      const audio = audioRef.current;
      if (!audio || !episodeRef.current) return;
      seek(audio.currentTime + seconds);
    },
    [seek],
  );

  const setPlaybackRate = useCallback((rate: PlaybackRate) => {
    const audio = audioRef.current;
    if (audio) audio.playbackRate = rate;
    setPlaybackRateState(rate);
    try {
      localStorage.setItem('mukhtalif-playback-rate', String(rate));
    } catch {
      /* Storage can be unavailable in private browsing. */
    }
  }, []);

  const close = useCallback(() => {
    const audio = audioRef.current;
    ++playRequest.current;
    wantsPlayback.current = false;
    if (audio) {
      syncProgress(audio, true);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    pendingPosition.current = null;
    pendingEpisodeId.current = null;
    episodeRef.current = null;
    setEpisode(null);
    setStatus('idle');
    setIsPlaying(false);
    setCanSeek(false);
    setCurrentTime(0);
    setDuration(0);
    setError(null);
  }, [syncProgress]);

  const pause = useCallback(() => {
    ++playRequest.current;
    wantsPlayback.current = false;
    audioRef.current?.pause();
    if (episodeRef.current) setStatus('paused');
  }, []);

  const context = useMemo<PlayerContextValue>(
    () => ({
      episode,
      status,
      isPlaying,
      canSeek,
      currentTime,
      duration,
      playbackRate,
      error,
      isCurrent,
      toggle,
      playFrom,
      skip,
      seek,
      setPlaybackRate,
      close,
      pause,
    }),
    [
      pause,
      playFrom,
      close,
      canSeek,
      currentTime,
      duration,
      episode,
      error,
      isCurrent,
      isPlaying,
      playbackRate,
      seek,
      setPlaybackRate,
      skip,
      status,
      toggle,
    ],
  );

  useEffect(() => {
    let rate: number = 1;
    try {
      rate = Number(localStorage.getItem('mukhtalif-playback-rate') || 1);
    } catch {
      /* Storage can be unavailable in private browsing. */
    }
    const valid = PLAYBACK_RATES.find((item) => item === rate);
    if (valid && audioRef.current) audioRef.current.playbackRate = valid;
    const flush = () => {
      if (audioRef.current) syncProgress(audioRef.current, true);
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flush);
    };
  }, [syncProgress]);

  return (
    <PlayerContext.Provider value={context}>
      {children}
      <audio
        ref={audioRef}
        preload="metadata"
        onLoadStart={() => {
          if (episodeRef.current && wantsPlayback.current) setStatus('loading');
        }}
        onLoadedMetadata={(event) => {
          const reported = finiteMediaTime(event.currentTarget.duration);
          setDuration(reported || finiteMediaTime(episodeRef.current?.durationSec));
          setCanSeek(reported > 0);
          if (pendingPosition.current !== null && reported) {
            event.currentTarget.currentTime = clampMediaTime(pendingPosition.current, reported);
            setCurrentTime(event.currentTarget.currentTime);
            pendingPosition.current = null;
            pendingEpisodeId.current = null;
          }
        }}
        onDurationChange={(event) => {
          const reported = finiteMediaTime(event.currentTarget.duration);
          if (reported) {
            setDuration(reported);
            setCanSeek(true);
          }
        }}
        onTimeUpdate={(event) => {
          setCurrentTime(event.currentTarget.currentTime);
          syncProgress(event.currentTarget);
        }}
        onPlaying={(event) => {
          if (!wantsPlayback.current) {
            event.currentTarget.pause();
            return;
          }
          setIsPlaying(true);
          setStatus('playing');
          setError(null);
        }}
        onPause={(event) => {
          syncProgress(event.currentTarget, true);
          setIsPlaying(false);
          if (!event.currentTarget.ended && episodeRef.current && !wantsPlayback.current)
            setStatus('paused');
        }}
        onWaiting={() => {
          if (wantsPlayback.current) setStatus('loading');
        }}
        onEnded={(event) => {
          wantsPlayback.current = false;
          setIsPlaying(false);
          setCurrentTime(finiteMediaTime(event.currentTarget.duration));
          setStatus('ended');
          syncProgress(event.currentTarget, true);
          const account = customerRef.current;
          const nextId = account.library.queueEpisodeIds[0];
          if (nextId && episodeRef.current) {
            const expected = episodeRef.current.id;
            void account
              .publicRead<Episode>(`/episodes/${encodeURIComponent(nextId)}`)
              .then(async (next) => {
                const latest = customerRef.current;
                if (
                  episodeRef.current?.id !== expected ||
                  !audioRef.current?.ended ||
                  latest.user?.id !== account.user?.id ||
                  latest.library.queueEpisodeIds[0] !== nextId
                )
                  return;
                if (next.premium) throw new Error('Unavailable public audio');
                await latest.updateQueue(
                  latest.library.queueEpisodeIds.filter((id) => id !== nextId),
                );
                if (
                  episodeRef.current?.id !== expected ||
                  !audioRef.current?.ended ||
                  customerRef.current.user?.id !== account.user?.id
                )
                  return;
                toggle({
                  id: next.id,
                  title: next.titleAr,
                  durationSec: next.durationSec,
                  artworkUrl: youtubeThumbnailUrl(next.youtubeVideoId) ?? undefined,
                  youtubeVideoId: next.youtubeVideoId,
                  audioSrc: `${account.config.apiOrigin}/episodes/${encodeURIComponent(next.id)}/audio`,
                  href: `/episodes/${encodeURIComponent(next.id)}`,
                });
              })
              .catch(() => setError('تعذّر تشغيل الحلقة التالية. حاول من قائمة الانتظار.'));
          }
        }}
        onRateChange={(event) => {
          const rate = PLAYBACK_RATES.find((value) => value === event.currentTarget.playbackRate);
          if (rate) setPlaybackRateState(rate);
        }}
        onError={(event) => {
          if (!episodeRef.current) return;
          wantsPlayback.current = false;
          setIsPlaying(false);
          setCanSeek(false);
          setStatus('error');
          setError(mediaErrorMessage(event.currentTarget));
        }}
      />
      <PlaybackFailureDialog />
      {episode ? (
        <>
          <div className={styles.spacer} aria-hidden="true" />
          <PlayerBar />
        </>
      ) : null}
    </PlayerContext.Provider>
  );
}

function PlayIcon({ paused }: { paused: boolean }) {
  return paused ? (
    <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5.8v12.4L18 12 8 5.8Z" fill="currentColor" />
    </svg>
  ) : (
    <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6.5" y="5.5" width="4" height="13" rx="1" fill="currentColor" />
      <rect x="13.5" y="5.5" width="4" height="13" rx="1" fill="currentColor" />
    </svg>
  );
}

export interface PlayEpisodeButtonProps {
  episode: PlayerEpisode;
  variant?: 'label' | 'icon';
  className?: string;
  initialSeconds?: number;
}

export function PlayEpisodeButton({
  episode,
  variant = 'label',
  className,
  initialSeconds = 0,
}: PlayEpisodeButtonProps) {
  const player = usePlayer();
  const customer = useCustomer();
  const current = player.isCurrent(episode);
  const resume =
    customer.library.progress.find((item) => item.episodeId === episode.id)?.positionSec ?? 0;
  const loading = current && player.status === 'loading';
  const playing = current && player.isPlaying;
  const label = loading
    ? 'إلغاء تحميل الحلقة'
    : playing
      ? 'إيقاف الحلقة مؤقتًا'
      : current
        ? 'متابعة الحلقة'
        : resume >= 15 && (!episode.durationSec || resume < episode.durationSec - 5)
          ? `أكمل ${episode.title} من ${formatPlaybackTime(resume)}`
          : `تشغيل ${episode.title}`;

  return (
    <button
      type="button"
      className={classes(
        styles.playButton,
        variant === 'label' && styles.labelButton,
        'mukhtalif-player-button',
        className,
      )}
      aria-label={label}
      aria-pressed={playing}
      aria-busy={loading}
      onClick={() =>
        !current && initialSeconds > 0
          ? player.playFrom(episode, initialSeconds)
          : player.toggle(episode)
      }
    >
      {loading ? (
        <span className={styles.spinner} aria-hidden="true" />
      ) : (
        <PlayIcon paused={!playing} />
      )}
      {variant === 'label' ? (
        <span>
          {loading ? 'جارٍ التحميل' : playing ? 'إيقاف مؤقت' : current ? 'متابعة' : 'استمع الآن'}
        </span>
      ) : null}
    </button>
  );
}

function Transport({
  episode,
  playVariant = 'icon',
  initialSeconds = 0,
}: {
  episode: PlayerEpisode;
  playVariant?: PlayEpisodeButtonProps['variant'];
  initialSeconds?: number;
}) {
  const player = usePlayer();
  const current = player.isCurrent(episode);
  const canSeek = current && player.canSeek;
  return (
    <div className={styles.transport} role="group" aria-label="التحكم في التشغيل">
      <button
        type="button"
        className={styles.button}
        aria-label="الرجوع 15 ثانية"
        disabled={!canSeek}
        onClick={() => player.skip(-15)}
      >
        −15
      </button>
      <PlayEpisodeButton episode={episode} variant={playVariant} initialSeconds={initialSeconds} />
      <button
        type="button"
        className={styles.button}
        aria-label="التقديم 15 ثانية"
        disabled={!canSeek}
        onClick={() => player.skip(15)}
      >
        +15
      </button>
    </div>
  );
}

function Timeline({ episode }: { episode: PlayerEpisode }) {
  const player = usePlayer();
  const current = player.isCurrent(episode);
  const duration = current ? player.duration : finiteMediaTime(episode.durationSec);
  const position = current ? clampMediaTime(player.currentTime, duration) : 0;

  return (
    <div className={styles.timeline}>
      <time className={styles.time} dateTime={`PT${Math.floor(position)}S`}>
        {formatPlaybackTime(position)}
      </time>
      <input
        className={styles.range}
        type="range"
        min={0}
        max={duration || 0}
        step={1}
        value={position}
        disabled={!current || !player.canSeek}
        aria-label="موضع التشغيل"
        aria-valuetext={`${formatPlaybackTime(position)} من ${formatPlaybackTime(duration)}`}
        style={{
          background: `linear-gradient(to left, #38df82 ${duration ? (position / duration) * 100 : 0}%, #454b8a ${duration ? (position / duration) * 100 : 0}%)`,
        }}
        onChange={(event) => player.seek(Number(event.currentTarget.value))}
      />
      <time className={styles.time} dateTime={`PT${Math.floor(duration)}S`}>
        {formatPlaybackTime(duration)}
      </time>
    </div>
  );
}

function RateControl({ disabled = false }: { disabled?: boolean }) {
  const player = usePlayer();
  return (
    <label className={styles.rateField}>
      <span>السرعة</span>
      <select
        className={styles.rateSelect}
        value={player.playbackRate}
        disabled={disabled}
        aria-label="سرعة التشغيل"
        onChange={(event) => {
          const value = Number(event.currentTarget.value);
          const rate = PLAYBACK_RATES.find((candidate) => candidate === value);
          if (rate) player.setPlaybackRate(rate);
        }}
      >
        {PLAYBACK_RATES.map((rate) => (
          <option key={rate} value={rate}>
            {rate}×
          </option>
        ))}
      </select>
    </label>
  );
}

export function PlayerBar({ className }: { className?: string }) {
  const player = usePlayer();
  if (!player.episode) return null;
  const { episode } = player;
  const message = statusLabel(player.status, player.error);

  return (
    <section
      className={classes(styles.bar, 'mukhtalif-player-bar', className)}
      aria-label="مشغل مختلف"
      onKeyDown={(event) => {
        if (event.target instanceof HTMLElement && event.target.closest('dialog')) return;
        if (
          event.target instanceof HTMLSelectElement ||
          (event.target instanceof HTMLInputElement && event.target.type !== 'range')
        )
          return;
        if (event.key === ' ' && !(event.target instanceof HTMLButtonElement)) {
          event.preventDefault();
          player.toggle(episode);
        } else if (event.key === 'ArrowRight') {
          event.preventDefault();
          player.skip(15);
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault();
          player.skip(-15);
        }
      }}
      tabIndex={0}
    >
      <div className={styles.barInner}>
        <div className={styles.episodeInfo}>
          {episode.artworkUrl ? (
            <img
              className={styles.artwork}
              src={episode.artworkUrl}
              width="48"
              height="48"
              alt=""
            />
          ) : null}
          {episode.href ? (
            <Link className={styles.episodeLink} href={episode.href}>
              {episode.title}
            </Link>
          ) : (
            <strong className={styles.episodeTitle}>{episode.title}</strong>
          )}
          {episode.showTitle ? <span className={styles.showTitle}>{episode.showTitle}</span> : null}
          <span
            className={classes(styles.status, player.error && styles.error)}
            role={player.error ? 'alert' : 'status'}
            aria-live="polite"
          >
            {message}
          </span>
        </div>
        <Transport episode={episode} />
        <Timeline episode={episode} />
        <PlayerTools />
        <button
          type="button"
          className={styles.closeButton}
          aria-label="إغلاق المشغل"
          onClick={player.close}
        >
          <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="m6.8 6.8 10.4 10.4m0-10.4L6.8 17.2"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </section>
  );
}

export function InlineEpisodePlayer({
  episode,
  className,
  initialSeconds = 0,
}: {
  episode: PlayerEpisode;
  className?: string;
  initialSeconds?: number;
}) {
  const player = usePlayer();
  const current = player.isCurrent(episode);
  const message = current ? statusLabel(player.status, player.error) : 'جاهزة للاستماع';

  return (
    <section
      className={classes(styles.inline, 'mukhtalif-player-inline', className)}
      aria-label={`الاستماع إلى ${episode.title}`}
    >
      <div className={styles.inlineHead}>
        <div>
          <h2 className={styles.inlineTitle}>{episode.title}</h2>
          <p
            className={classes(styles.inlineStatus, current && player.error && styles.error)}
            role={current && player.error ? 'alert' : 'status'}
            aria-live="polite"
          >
            {message}
          </p>
        </div>
      </div>
      <div className={styles.inlineControls}>
        <Transport episode={episode} playVariant="label" initialSeconds={initialSeconds} />
        <Timeline episode={episode} />
        <RateControl disabled={!current} />
      </div>
    </section>
  );
}

function PlaybackFailureDialog() {
  const player = usePlayer();
  const dialog = useRef<HTMLDialogElement>(null);
  const lastFailure = useRef('');
  const episode = player.episode;
  useEffect(() => {
    if (!player.error || !episode) {
      lastFailure.current = '';
      return;
    }
    const key = `${episode.id}:${player.error}`;
    if (isYouTubeVideoId(episode.youtubeVideoId) && lastFailure.current !== key) {
      lastFailure.current = key;
      dialog.current?.showModal();
    }
  }, [episode, player.error]);
  return (
    <dialog ref={dialog} className="customer-dialog" aria-labelledby="playback-error-title">
      <div className="customer-dialog__head">
        <h2 id="playback-error-title">الصوت غير متاح الآن</h2>
        <button className="icon-action" aria-label="إغلاق" onClick={() => dialog.current?.close()}>
          <BrandIcon name="close" />
        </button>
      </div>
      <p>{player.error}</p>
      {episode && isYouTubeVideoId(episode.youtubeVideoId) && (
        <Link
          className="customer-primary"
          href={`${episode.href || `/episodes/${encodeURIComponent(episode.id)}`}#episode-video`}
          onClick={() => dialog.current?.close()}
        >
          شاهد الحلقة
        </Link>
      )}
      <button
        className="customer-text-button"
        onClick={() => {
          dialog.current?.close();
          if (episode) player.toggle(episode);
        }}
      >
        حاول تشغيل الصوت مجددًا
      </button>
    </dialog>
  );
}

function PlayerTools() {
  const customer = useCustomer();
  const player = usePlayer();
  const queueDialog = useRef<HTMLDialogElement>(null);
  const bookmarkDialog = useRef<HTMLDialogElement>(null);
  const [titles, setTitles] = useState<Record<string, Episode>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [note, setNote] = useState('');
  const [moment, setMoment] = useState<{ episode: PlayerEpisode; seconds: number } | null>(null);
  const openQueue = async () => {
    if (!customer.requireAccount()) return;
    queueDialog.current?.showModal();
    setMessage('');
    setBusy(true);
    try {
      const values = await Promise.allSettled(
        customer.library.queueEpisodeIds.map(
          async (id) =>
            [
              id,
              await customer.publicRead<Episode>(`/episodes/${encodeURIComponent(id)}`),
            ] as const,
        ),
      );
      setTitles(
        Object.fromEntries(
          values.flatMap((value) => (value.status === 'fulfilled' ? [value.value] : [])),
        ),
      );
      if (values.some((value) => value.status === 'rejected'))
        setMessage('تعذّر تحميل بعض الحلقات. أعد المحاولة أو أزل الحلقة من الانتظار.');
    } catch {
      setMessage('تعذّر تحميل بعض الحلقات. حاول مرة أخرى.');
    } finally {
      setBusy(false);
    }
  };
  const update = async (ids: string[]) => {
    setBusy(true);
    setMessage('');
    try {
      await customer.updateQueue(ids);
      customer.notify('حدّثنا قائمة الانتظار.');
    } catch {
      setMessage('تعذّر تحديث الانتظار. حاول مرة أخرى.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={styles.tools}>
      <RateControl />
      <button
        className={styles.button}
        aria-label="قائمة الانتظار"
        onClick={() => void openQueue()}
      >
        <BrandIcon name="queue" />
      </button>
      <button
        className={styles.button}
        aria-label="احفظ اللحظة"
        onClick={() => {
          if (customer.requireAccount()) {
            setMessage('');
            setNote('');
            if (player.episode)
              setMoment({ episode: player.episode, seconds: Math.floor(player.currentTime) });
            bookmarkDialog.current?.showModal();
          }
        }}
      >
        <BrandIcon name="save" />
      </button>
      <dialog ref={queueDialog} className="customer-dialog" aria-labelledby="player-queue-title">
        <div className="customer-dialog__head">
          <h2 id="player-queue-title">قائمة الانتظار</h2>
          <button
            className="icon-action"
            aria-label="إغلاق الانتظار"
            onClick={() => queueDialog.current?.close()}
          >
            <BrandIcon name="close" />
          </button>
        </div>
        {message && <p role="alert">{message}</p>}
        {message && !busy && (
          <button className="customer-text-button" onClick={() => void openQueue()}>
            أعد تحميل القائمة
          </button>
        )}
        {busy && <p role="status">جارٍ التحميل...</p>}
        {!customer.library.queueEpisodeIds.length ? (
          <p>قائمة الانتظار فارغة. أضف حلقة من زر الانتظار بجانبها.</p>
        ) : (
          <ol className="queue-list">
            {customer.library.queueEpisodeIds.map((id, index) => (
              <li key={id}>
                <button
                  className="queue-list__title"
                  disabled={busy || !titles[id] || titles[id].premium}
                  onClick={() => {
                    const item = titles[id];
                    if (!item) return;
                    player.toggle({
                      id,
                      title: item.titleAr,
                      durationSec: item.durationSec,
                      artworkUrl: youtubeThumbnailUrl(item.youtubeVideoId) ?? undefined,
                      youtubeVideoId: item.youtubeVideoId,
                      audioSrc: `${customer.config.apiOrigin}/episodes/${encodeURIComponent(id)}/audio`,
                      href: `/episodes/${encodeURIComponent(id)}`,
                    });
                    void update(customer.library.queueEpisodeIds.filter((value) => value !== id));
                    queueDialog.current?.close();
                  }}
                >
                  {titles[id]?.titleAr ?? (busy ? 'جارٍ تحميل الحلقة' : 'الحلقة غير متاحة')}
                </button>
                <div className="queue-list__tools">
                  <button
                    className="icon-action"
                    aria-label="تقديم الحلقة في الانتظار"
                    disabled={busy || index === 0}
                    onClick={() => {
                      const ids = [...customer.library.queueEpisodeIds];
                      [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
                      void update(ids);
                    }}
                  >
                    <BrandIcon name="up" />
                  </button>
                  <button
                    className="icon-action"
                    aria-label="تأخير الحلقة في الانتظار"
                    disabled={busy || index === customer.library.queueEpisodeIds.length - 1}
                    onClick={() => {
                      const ids = [...customer.library.queueEpisodeIds];
                      [ids[index + 1], ids[index]] = [ids[index], ids[index + 1]];
                      void update(ids);
                    }}
                  >
                    <BrandIcon name="down" />
                  </button>
                  <button
                    className="icon-action"
                    aria-label="إزالة من الانتظار"
                    disabled={busy}
                    onClick={() =>
                      void update(customer.library.queueEpisodeIds.filter((value) => value !== id))
                    }
                  >
                    <BrandIcon name="close" />
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </dialog>
      <dialog
        ref={bookmarkDialog}
        className="customer-dialog"
        aria-labelledby="player-moment-title"
      >
        <div className="customer-dialog__head">
          <h2 id="player-moment-title">احفظ اللحظة</h2>
          <button
            className="icon-action"
            aria-label="إغلاق حفظ اللحظة"
            onClick={() => bookmarkDialog.current?.close()}
          >
            <BrandIcon name="close" />
          </button>
        </div>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (!moment) return;
            setBusy(true);
            try {
              await customer.addBookmark(moment.episode.id, moment.seconds, note);
              setMessage('حُفظت اللحظة في مكتبتك.');
              bookmarkDialog.current?.close();
            } catch {
              setMessage('تعذّر حفظ اللحظة. حاول مرة أخرى.');
            } finally {
              setBusy(false);
            }
          }}
        >
          <p>
            {moment?.episode.title} · <bdi>{formatPlaybackTime(moment?.seconds ?? 0)}</bdi>
          </p>
          <label>
            ملاحظة (اختياري)
            <input value={note} maxLength={300} onChange={(event) => setNote(event.target.value)} />
          </label>
          {message && <p role="status">{message}</p>}
          <button type="submit" disabled={busy}>
            احفظ اللحظة
          </button>
        </form>
      </dialog>
    </div>
  );
}
