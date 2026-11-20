'use client';

import { useEffect, useState } from 'react';
import type { PlayerEpisode } from './player';
import { usePlayer } from './player';
import playerStyles from './player.module.css';

export function RetryContentButton() {
  return (
    <button type="button" className="public-primary" onClick={() => window.location.reload()}>
      حاول مرة أخرى
    </button>
  );
}

/**
 * Previous / next for a horizontal rail. The pair stays hidden until it knows
 * the rail overflows (and without JavaScript, where it could not scroll
 * anyway), and each button is unavailable at its own end of the rail.
 * `label` names what the rail holds, in the definite plural («الحلقات»).
 */
export function RailControls({ target, label = 'الحلقات' }: { target: string; label?: string }) {
  const [edges, setEdges] = useState<{ start: boolean; end: boolean } | null>(null);

  useEffect(() => {
    const rail = document.getElementById(target);
    if (!rail) return;
    // RTL scroll offsets run from 0 at the start towards negative values.
    const measure = () => {
      const offset = Math.abs(rail.scrollLeft);
      const max = rail.scrollWidth - rail.clientWidth;
      setEdges({ start: offset <= 1, end: offset >= max - 1 });
    };
    measure();
    rail.addEventListener('scroll', measure, { passive: true });
    const resize = new ResizeObserver(measure);
    resize.observe(rail);
    return () => {
      rail.removeEventListener('scroll', measure);
      resize.disconnect();
    };
  }, [target]);

  function scroll(direction: number) {
    const rail = document.getElementById(target);
    rail?.scrollBy({
      left: direction * rail.clientWidth * 0.75,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
  }

  const overflows = edges !== null && !(edges.start && edges.end);
  return (
    <div
      className="public-rail-controls"
      role="group"
      aria-label={`تصفح ${label}`}
      hidden={!overflows}
    >
      <button
        type="button"
        onClick={() => scroll(1)}
        aria-label={`${label} السابقة`}
        disabled={edges?.start}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m9 5 7 7-7 7" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => scroll(-1)}
        aria-label={`${label} التالية`}
        disabled={edges?.end}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m15 5-7 7 7 7" />
        </svg>
      </button>
    </div>
  );
}

export function ShareButton({ path }: { title: string; path: string }) {
  const [message, setMessage] = useState('');
  const [fallback, setFallback] = useState('');
  async function share() {
    const url = new URL(path, window.location.origin).href;
    try {
      await navigator.clipboard.writeText(url);
      setMessage('نُسخ الرابط.');
    } catch {
      setFallback(url);
    }
  }
  return (
    <span className="public-share">
      <button className="public-text-action" type="button" onClick={() => void share()}>
        شارك الرابط
      </button>
      {message ? <span role="status">{message}</span> : null}
      {fallback ? (
        <label className="public-share__fallback">
          انسخ الرابط
          <input
            readOnly
            value={fallback}
            dir="ltr"
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      ) : null}
    </span>
  );
}

export function ReadingSizeControl() {
  const [large, setLarge] = useState(false);
  return (
    <button
      type="button"
      className="public-text-action"
      aria-pressed={large}
      onClick={() => {
        const next = !large;
        document.getElementById('article-body')?.classList.toggle('public-reading-large', next);
        setLarge(next);
      }}
    >
      {large ? 'حجم النص المعتاد' : 'كبّر النص'}
    </button>
  );
}

export function LatestEpisodeAction({ episode }: { episode: PlayerEpisode }) {
  const player = usePlayer();
  const current = player.isCurrent(episode);
  const playing = current && player.isPlaying;
  const loading = current && player.status === 'loading';
  return (
    <button
      type="button"
      className="public-primary handoff-hero__play"
      aria-label={`${loading ? 'إلغاء تحميل الحلقة' : playing ? 'إيقاف مؤقت' : 'تشغيل آخر حلقة'}: ${episode.title}`}
      aria-pressed={playing}
      aria-busy={loading}
      onClick={() => player.toggle(episode)}
    >
      {loading ? (
        <span className={playerStyles.spinner} aria-hidden="true" />
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          {playing ? <path d="M6 5h4v14H6zm8 0h4v14h-4z" /> : <path d="M7 4.8v14.4L19 12z" />}
        </svg>
      )}
      <span>{loading ? 'إلغاء التحميل' : playing ? 'إيقاف مؤقت' : 'استمع لآخر حلقة'}</span>
    </button>
  );
}
