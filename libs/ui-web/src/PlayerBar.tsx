import { translate, type Locale } from '@mukhtalif/i18n';

export interface PlayerBarProps {
  title: string;
  /** Formatted time labels — the caller formats (e.g. with @mukhtalif/utils). */
  positionLabel: string;
  durationLabel: string;
  playing: boolean;
  positionSec: number;
  durationSec: number;
  onToggle: () => void;
  onSeek: (positionSec: number) => void;
  locale?: Locale;
}

/** Minimal audio transport. State lives in the caller; this only renders it. */
export function PlayerBar({
  title,
  positionLabel,
  durationLabel,
  playing,
  positionSec,
  durationSec,
  onToggle,
  onSeek,
  locale = 'ar',
}: PlayerBarProps) {
  const toggleLabel = translate(locale, playing ? 'action.pause' : 'action.play');
  return (
    <div className="mk-player" dir="ltr">
      <button className="mk-player__toggle" onClick={onToggle} aria-label={toggleLabel}>
        {playing ? (
          <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden>
            <rect x="2.5" y="2" width="4" height="12" rx="1" />
            <rect x="9.5" y="2" width="4" height="12" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden>
            <path d="M4.5 2.7a1 1 0 0 1 1.53-.85l8 5.3a1 1 0 0 1 0 1.7l-8 5.3a1 1 0 0 1-1.53-.85z" />
          </svg>
        )}
      </button>
      <div className="mk-player__body">
        <p className="mk-player__title" dir="auto">
          {title}
        </p>
        <div className="mk-player__timeline">
          <span className="mk-player__time">{positionLabel}</span>
          <input
            type="range"
            min={0}
            max={Math.max(durationSec, 1)}
            value={Math.min(positionSec, durationSec)}
            onChange={(event) => onSeek(Number(event.target.value))}
            aria-label={title}
          />
          <span className="mk-player__time">{durationLabel}</span>
        </div>
      </div>
    </div>
  );
}
