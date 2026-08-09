import type { FormatLocale } from './money';

const INTL_LOCALES = { ar: 'ar-SA', en: 'en-US' } as const;

/** Formats an ISO timestamp as a localized long date, e.g. "٩ أغسطس ٢٠٢٦". */
export function formatDate(iso: string, locale: FormatLocale = 'ar'): string {
  return new Intl.DateTimeFormat(INTL_LOCALES[locale], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));
}

/** Formats an ISO timestamp as date plus time, for schedules and audit rows. */
export function formatDateTime(iso: string, locale: FormatLocale = 'ar'): string {
  return new Intl.DateTimeFormat(INTL_LOCALES[locale], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}
