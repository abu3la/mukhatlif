import { ar } from './catalogs/ar';
import { en } from './catalogs/en';
import type { MessageKey } from './catalogs/ar';

export type Locale = 'ar' | 'en';
export type { MessageKey };

const catalogs: Record<Locale, Record<MessageKey, string>> = { ar, en };

export function translate(locale: Locale, key: MessageKey): string {
  return catalogs[locale][key] ?? ar[key];
}

export function isRtl(locale: Locale): boolean {
  return locale === 'ar';
}

export { ar, en };
