'use client';
import { useSyncExternalStore } from 'react';
import styles from './site-navigation.module.css';
const KEY = 'mukhtalif-appearance';
function applyAppearance(next: 'first' | 'third') {
  document.documentElement.dataset.concept = next;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', next === 'third' ? '#1a1b19' : '#ffffff');
}
function current() {
  return document.documentElement.dataset.concept === 'third';
}
function subscribe(listener: () => void) {
  const update = () => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(KEY);
    } catch {
      /* Storage can be unavailable in private browsing. */
    }
    applyAppearance(saved === 'third' ? 'third' : 'first');
    listener();
  };
  window.addEventListener('mukhtalif:appearance', listener);
  window.addEventListener('storage', update);
  return () => {
    window.removeEventListener('mukhtalif:appearance', listener);
    window.removeEventListener('storage', update);
  };
}
export function ThemeControl() {
  const dark = useSyncExternalStore(subscribe, current, () => false);
  return (
    <button
      type="button"
      className={styles.themeControl}
      aria-label={dark ? 'تفعيل المظهر الفاتح' : 'تفعيل المظهر الداكن'}
      onClick={() => {
        const next = dark ? 'first' : 'third';
        applyAppearance(next);
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
      <span>{dark ? 'المظهر الفاتح' : 'المظهر الداكن'}</span>
    </button>
  );
}
