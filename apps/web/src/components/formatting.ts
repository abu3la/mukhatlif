/**
 * Arabic-locale formatting.
 *
 * The listener handoff uses Latin digits and Gregorian dates throughout public editorial
 * dates, episode numbers, and durations.
 */
const LOCALE = 'ar-SA-u-ca-gregory-nu-latn';

const DATE_FORMAT = new Intl.DateTimeFormat(LOCALE, {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'Asia/Riyadh',
});

export function formatDate(iso: string | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : DATE_FORMAT.format(date);
}

/** Machine-readable value for a <time> element. */
export function dateTimeAttribute(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/*
 * Grouping is off: every number this renders is an ordinal or a count — an
 * episode number, a page number, a minute total — where a thousands separator
 * is wrong ("الحلقة 1,024") rather than helpful.
 */
const NUMBER_FORMAT = new Intl.NumberFormat(LOCALE, { useGrouping: false });

export function formatNumber(value: number): string {
  return NUMBER_FORMAT.format(value);
}

/** Compact episode duration from the listener handoff, e.g. "52 دقيقة". */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) return `${formatNumber(totalMinutes)} دقيقة`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours} س ${minutes} د` : `${hours} س`;
}
