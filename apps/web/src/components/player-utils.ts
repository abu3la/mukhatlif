export const PLAYBACK_RATES = [1, 1.25, 1.5, 2] as const;
export type PlaybackRate = (typeof PLAYBACK_RATES)[number];

/** Keeps media values finite before they reach an input or the audio element. */
export function finiteMediaTime(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

export function clampMediaTime(value: number, duration: number): number {
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
  const safeDuration = finiteMediaTime(duration);
  return safeDuration > 0 ? Math.min(safeValue, safeDuration) : safeValue;
}

/** Compact, language-neutral clock notation used beside the seek control. */
export function formatPlaybackTime(value: number): string {
  const totalSeconds = Math.floor(Math.max(0, Number.isFinite(value) ? value : 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
