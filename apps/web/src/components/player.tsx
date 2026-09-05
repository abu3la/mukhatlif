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

/**
 * Plain serializable episode data. Build `audioSrc` in a Server Component and
 * pass the resulting string across the client boundary; this module never
 * imports server configuration.
 */
export interface PlayerEpisode {
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
  skip: (seconds: number) => void;
  seek: (seconds: number) => void;
  setPlaybackRate: (rate: PlaybackRate) => void;
  setDockSuppressed: (suppressed: boolean) => void;
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
  const [dockSuppressed, setDockSuppressedState] = useState(false);

  const isCurrent = useCallback(
    (candidate: PlayerEpisode) =>
      episodeRef.current?.id === candidate.id && episodeRef.current.audioSrc === candidate.audioSrc,
    [],
  );

  const play = useCallback((audio: HTMLAudioElement) => {
    window.dispatchEvent(new Event('mukhtalif:audio-start'));
    setError(null);
    setStatus('loading');
    const request = audio.play();
    void request.catch((reason: unknown) => {
      if (reason instanceof DOMException && reason.name === 'AbortError') return;
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
        if (!audio.paused) {
          audio.pause();
          return;
        }
        if (audio.ended) audio.currentTime = 0;
        play(audio);
        return;
      }

      episodeRef.current = candidate;
      setEpisode(candidate);
      setCurrentTime(0);
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
    [isCurrent, play, playbackRate],
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
  }, []);

  const setDockSuppressed = useCallback((suppressed: boolean) => {
    setDockSuppressedState(suppressed);
  }, []);

  const close = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    episodeRef.current = null;
    setEpisode(null);
    setStatus('idle');
    setIsPlaying(false);
    setCanSeek(false);
    setCurrentTime(0);
    setDuration(0);
    setError(null);
  }, []);

  const pause = useCallback(() => {
    audioRef.current?.pause();
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
      skip,
      seek,
      setPlaybackRate,
      setDockSuppressed,
      close,
      pause,
    }),
    [
      pause,
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
      setDockSuppressed,
      skip,
      status,
      toggle,
    ],
  );

  return (
    <PlayerContext.Provider value={context}>
      {children}
      <audio
        ref={audioRef}
        preload="metadata"
        onLoadStart={() => {
          if (episodeRef.current) setStatus('loading');
        }}
        onLoadedMetadata={(event) => {
          const reported = finiteMediaTime(event.currentTarget.duration);
          setDuration(reported || finiteMediaTime(episodeRef.current?.durationSec));
          setCanSeek(reported > 0);
        }}
        onDurationChange={(event) => {
          const reported = finiteMediaTime(event.currentTarget.duration);
          if (reported) {
            setDuration(reported);
            setCanSeek(true);
          }
        }}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPlaying={() => {
          setIsPlaying(true);
          setStatus('playing');
          setError(null);
        }}
        onPause={(event) => {
          setIsPlaying(false);
          if (!event.currentTarget.ended && episodeRef.current) setStatus('paused');
        }}
        onWaiting={() => setStatus('loading')}
        onEnded={(event) => {
          setIsPlaying(false);
          setCurrentTime(finiteMediaTime(event.currentTarget.duration));
          setStatus('ended');
        }}
        onRateChange={(event) => {
          const rate = PLAYBACK_RATES.find((value) => value === event.currentTarget.playbackRate);
          if (rate) setPlaybackRateState(rate);
        }}
        onError={(event) => {
          if (!episodeRef.current) return;
          setIsPlaying(false);
          setCanSeek(false);
          setStatus('error');
          setError(mediaErrorMessage(event.currentTarget));
        }}
      />
      {episode && !dockSuppressed ? (
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
}

export function PlayEpisodeButton({
  episode,
  variant = 'label',
  className,
}: PlayEpisodeButtonProps) {
  const player = usePlayer();
  const current = player.isCurrent(episode);
  const playing = current && player.isPlaying;
  const label = playing
    ? 'إيقاف الحلقة مؤقتًا'
    : current
      ? 'متابعة الحلقة'
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
      onClick={() => player.toggle(episode)}
    >
      <PlayIcon paused={!playing} />
      {variant === 'label' ? (
        <span>{playing ? 'إيقاف مؤقت' : current ? 'متابعة' : 'استمع الآن'}</span>
      ) : null}
    </button>
  );
}

function Transport({
  episode,
  playVariant = 'icon',
}: {
  episode: PlayerEpisode;
  playVariant?: PlayEpisodeButtonProps['variant'];
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
      <PlayEpisodeButton episode={episode} variant={playVariant} />
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
    >
      <div className={styles.barInner}>
        <div className={styles.episodeInfo}>
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
        <RateControl />
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
}: {
  episode: PlayerEpisode;
  className?: string;
}) {
  const player = usePlayer();
  const { setDockSuppressed } = player;
  const current = player.isCurrent(episode);
  const message = current ? statusLabel(player.status, player.error) : 'جاهزة للاستماع';

  useEffect(() => {
    setDockSuppressed(true);
    return () => setDockSuppressed(false);
  }, [setDockSuppressed]);

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
        <Transport episode={episode} playVariant="label" />
        <Timeline episode={episode} />
        <RateControl disabled={!current} />
      </div>
    </section>
  );
}
