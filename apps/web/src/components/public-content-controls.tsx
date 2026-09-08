'use client';

import { useState } from 'react';
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

export function RailControls({ target }: { target: string }) {
  function scroll(direction: number) {
    const rail = document.getElementById(target);
    rail?.scrollBy({
      left: direction * rail.clientWidth * 0.75,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
  }
  return (
    <div className="public-rail-controls" aria-label="تصفح الحلقات">
      <button type="button" onClick={() => scroll(1)} aria-label="الحلقات السابقة">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m9 5 7 7-7 7" />
        </svg>
      </button>
      <button type="button" onClick={() => scroll(-1)} aria-label="الحلقات التالية">
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
