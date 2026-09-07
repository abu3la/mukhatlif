'use client';
import { useSyncExternalStore } from 'react';
const KEY = 'mukhtalif-appearance';
function current() {
  return document.documentElement.dataset.concept === 'third';
}
function subscribe(listener: () => void) {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const update = () => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(KEY);
    } catch {
      /* Storage can be unavailable in private browsing. */
    }
    document.documentElement.dataset.concept =
      saved === 'first' || saved === 'third' ? saved : media.matches ? 'third' : 'first';
    listener();
  };
  window.addEventListener('mukhtalif:appearance', listener);
  window.addEventListener('storage', update);
  media.addEventListener('change', update);
  return () => {
    window.removeEventListener('mukhtalif:appearance', listener);
    window.removeEventListener('storage', update);
    media.removeEventListener('change', update);
  };
}
export function ThemeControl() {
  const dark = useSyncExternalStore(subscribe, current, () => false);
  return (
    <button
      type="button"
      className="theme-control"
      aria-label={dark ? 'تفعيل المظهر الفاتح' : 'تفعيل المظهر الداكن'}
      onClick={() => {
        const next = dark ? 'first' : 'third';
        document.documentElement.dataset.concept = next;
        try {
          localStorage.setItem(KEY, next);
        } catch {
          /* Storage can be unavailable in private browsing. */
        }
        window.dispatchEvent(new Event('mukhtalif:appearance'));
      }}
    >
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10 2.5a7.5 7.5 0 0 1 0 15Z" fill="currentColor" />
      </svg>
      <span>{dark ? 'فاتح' : 'داكن'}</span>
    </button>
  );
}
