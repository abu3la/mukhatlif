import type { Article, Episode, Subscription } from './models';

const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const EASTERN_ARABIC_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_WITH_LATIN_DIGITS_LOCALE = 'ar-SA-u-ca-gregory-nu-latn';
const RIYADH_TIME_ZONE = 'Asia/Riyadh';
const RIYADH_UTC_OFFSET = '+03:00';

export interface ArabicPluralForms {
  /** Optional copy used for an exact zero count. */
  zero?: string;
  /** Complete singular phrase, for example: ضيف واحد. */
  one: string;
  /** Complete dual phrase, for example: ضيفان. */
  two: string;
  /** Plural noun used after counts from 3 through 10, for example: ضيوف. */
  few: string;
  /** Accusative singular used after 11 or more, for example: ضيفًا. */
  many: string;
}

/** Accepts both Arabic-Indic sets and returns ASCII digits for matching and parsing. */
export function normalizeArabicIndicDigits(value: string | number): string {
  return String(value).replace(/[٠-٩۰-۹]/g, (digit) => {
    const arabicIndex = ARABIC_INDIC_DIGITS.indexOf(digit);
    if (arabicIndex >= 0) return String(arabicIndex);

    const easternIndex = EASTERN_ARABIC_DIGITS.indexOf(digit);
    return easternIndex >= 0 ? String(easternIndex) : digit;
  });
}

/**
 * Normalizes user-entered Arabic for forgiving dashboard search. It removes
 * diacritics and tatweel, folds common alef variants, and normalizes digits.
 */
export function normalizeArabicSearch(value: string | number | null | undefined): string {
  return normalizeArabicIndicDigits(String(value ?? ''))
    .normalize('NFKC')
    .replace(/\u0640/g, '')
    .replace(/\p{Mark}/gu, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .trim()
    .toLocaleLowerCase('ar')
    .replace(/\s+/g, ' ');
}

/** Every whitespace-separated query term must match at least one supplied field. */
export function matchesArabicSearch(
  query: string,
  ...fields: ReadonlyArray<string | number | null | undefined>
): boolean {
  const normalizedQuery = normalizeArabicSearch(query);
  if (!normalizedQuery) return true;

  const haystack = normalizeArabicSearch(fields.filter((field) => field != null).join(' '));
  return normalizedQuery.split(' ').every((term) => haystack.includes(term));
}

export function formatArabicNumber(
  value: number | bigint,
  options: Intl.NumberFormatOptions = {},
): string {
  const formatted = new Intl.NumberFormat(ARABIC_WITH_LATIN_DIGITS_LOCALE, options).format(value);
  return normalizeArabicIndicDigits(formatted);
}

export function formatArabicInteger(value: number | bigint): string {
  return formatArabicNumber(value, { maximumFractionDigits: 0 });
}

/** Formats a halala value with the dashboard's Latin-digit convention, for example: 29.00 ر.س. */
export function formatSarHalalas(halalas: number): string {
  const amount = formatArabicNumber(halalas / 100, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${amount} ر.س.`;
}

function asValidDate(value: string | number | Date): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`Invalid date value: ${String(value)}`);
  }
  return date;
}

export function formatArabicDate(value: string | number | Date): string {
  const formatted = new Intl.DateTimeFormat(ARABIC_WITH_LATIN_DIGITS_LOCALE, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: RIYADH_TIME_ZONE,
  }).format(asValidDate(value));
  return normalizeArabicIndicDigits(formatted);
}

export function formatArabicTime(value: string | number | Date): string {
  const formatted = new Intl.DateTimeFormat(ARABIC_WITH_LATIN_DIGITS_LOCALE, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: RIYADH_TIME_ZONE,
  }).format(asValidDate(value));
  return normalizeArabicIndicDigits(formatted);
}

export function formatArabicDateTime(value: string | number | Date): string {
  return `${formatArabicDate(value)} · ${formatArabicTime(value)}`;
}

/** Converts a datetime-local control value into an explicit Riyadh timestamp. */
export function riyadhLocalInputToIso(value: string): string {
  const normalized = normalizeArabicIndicDigits(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)) {
    throw new RangeError('Riyadh datetime values must use YYYY-MM-DDTHH:mm.');
  }
  return asValidDate(`${normalized}:00${RIYADH_UTC_OFFSET}`).toISOString();
}

/** Converts an ISO instant to the value expected by a Riyadh datetime-local control. */
export function isoToRiyadhLocalInput(value: string | number | Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: RIYADH_TIME_ZONE,
  }).formatToParts(asValidDate(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value;
  const year = part('year');
  const month = part('month');
  const day = part('day');
  const hour = part('hour');
  const minute = part('minute');
  if (!year || !month || !day || !hour || !minute) {
    throw new RangeError('Unable to format the Riyadh datetime value.');
  }
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

/** Implements the exact simplified number agreement specified by the handoff. */
export function plural(count: number, forms: ArabicPluralForms): string {
  if (!Number.isFinite(count) || count < 0) {
    throw new RangeError('Arabic plural counts must be finite, non-negative numbers.');
  }

  const integer = Math.trunc(count);
  if (integer === 0 && forms.zero) return forms.zero;
  if (integer === 1) return forms.one;
  if (integer === 2) return forms.two;
  if (integer >= 3 && integer <= 10) return `${formatArabicInteger(integer)} ${forms.few}`;
  return `${formatArabicInteger(integer)} ${forms.many}`;
}

export const pluralArabic = plural;

export function formatGuestCount(count: number): string {
  return plural(count, {
    one: 'ضيف واحد',
    two: 'ضيفان',
    few: 'ضيوف',
    many: 'ضيفًا',
  });
}

export function formatEpisodeCount(count: number): string {
  return plural(count, {
    one: 'حلقة واحدة',
    two: 'حلقتان',
    few: 'حلقات',
    many: 'حلقة',
  });
}

export function formatUserCount(count: number): string {
  return plural(count, {
    one: 'مستخدم واحد',
    two: 'مستخدمان',
    few: 'مستخدمين',
    many: 'مستخدمًا',
  });
}

export function formatRoleCount(count: number): string {
  return plural(count, {
    one: 'دور واحد',
    two: 'دوران',
    few: 'أدوار',
    many: 'دورًا',
  });
}

export function formatPageCount(count: number): string {
  return plural(count, {
    one: 'صفحة واحدة',
    two: 'صفحتان',
    few: 'صفحات',
    many: 'صفحة',
  });
}

export function formatResultCount(count: number): string {
  return plural(count, {
    zero: 'لا نتائج مطابقة',
    one: 'نتيجة واحدة',
    two: 'نتيجتان',
    few: 'نتائج',
    many: 'نتيجة',
  });
}

export function formatGuestAppearanceSummary(count: number): string {
  if (count === 0) return 'لم يظهر بعد';
  return `ظهر في ${plural(count, {
    one: 'حلقة واحدة',
    two: 'حلقتين',
    few: 'حلقات',
    many: 'حلقة',
  })}`;
}

export function formatAdditionalEpisodeCount(count: number): string {
  return plural(count, {
    one: 'حلقة أخرى',
    two: 'حلقتين أخريين',
    few: 'حلقات أخرى',
    many: 'حلقة أخرى',
  });
}

export function formatEpisodeTimeline(episode: Episode): string {
  switch (episode.status) {
    case 'draft':
      return `آخر تعديل ${formatArabicDate(episode.updatedAt)}`;
    case 'scheduled':
      return episode.scheduledAt ? `تُنشر ${formatArabicDateTime(episode.scheduledAt)}` : 'مجدولة';
    case 'published':
      return formatArabicDate(episode.publishedAt ?? episode.updatedAt);
    case 'archived':
      return `أُرشفت ${formatArabicDate(episode.archivedAt ?? episode.updatedAt)}`;
  }
}

export function formatArticleTimeline(article: Article): string {
  if (article.status === 'draft') return `آخر تعديل ${formatArabicDate(article.updatedAt)}`;
  return formatArabicDate(article.publishedAt ?? article.updatedAt);
}

export function formatSubscriptionDetail(subscription: Subscription): string {
  switch (subscription.status) {
    case 'active':
      return subscription.renewAt ? `يتجدد في ${formatArabicDate(subscription.renewAt)}` : 'نشط';
    case 'past_due':
      return subscription.paymentFailedAt
        ? `تعذّر السداد في ${formatArabicDate(subscription.paymentFailedAt)}`
        : 'متأخر السداد';
    case 'canceled':
      return subscription.canceledAt
        ? `أُلغي في ${formatArabicDate(subscription.canceledAt)}`
        : 'ملغى';
  }
}
