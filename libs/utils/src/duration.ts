import type { FormatLocale } from './money';

/** Formats a duration in seconds as `"١ س ٥ د"` (ar) or `"1h 5m"` (en). */
export function formatDuration(totalSec: number, locale: FormatLocale = 'ar'): string {
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.round((totalSec % 3600) / 60);
  const parts: string[] = [];
  if (locale === 'ar') {
    const digits = new Intl.NumberFormat('ar-SA');
    if (hours > 0) parts.push(`${digits.format(hours)} س`);
    if (minutes > 0 || hours === 0) parts.push(`${digits.format(minutes)} د`);
  } else {
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0 || hours === 0) parts.push(`${minutes}m`);
  }
  return parts.join(' ');
}
