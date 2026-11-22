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

/** A noun in each form an Arabic count asks for. */
export interface CountedNoun {
  /** «برنامج واحد» */
  one: string;
  /** «برنامجان» */
  two: string;
  /** After 3 to 10: «برامج». */
  plural: string;
  /** After 11 to 99: «برنامجًا». */
  accusative: string;
  /** After a round hundred: «برنامج». */
  single: string;
  /** The noun's gender; the numbers 3 to 10 take the other one. */
  gender: 'masculine' | 'feminine';
}

const UNITS_FOR = {
  masculine: ['ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة'],
  feminine: ['ثلاث', 'أربع', 'خمس', 'ست', 'سبع', 'ثماني', 'تسع', 'عشر'],
} as const;

/** «تسعة برامج», «نشرتان»: a count in words up to ten, then in digits. */
export function countInWords(count: number, noun: CountedNoun): string {
  if (count === 1) return noun.one;
  if (count === 2) return noun.two;
  if (count >= 3 && count <= 10) return `${UNITS_FOR[noun.gender][count - 3]} ${noun.plural}`;
  const tens = count % 100;
  const form = tens >= 3 && tens <= 10 ? noun.plural : tens >= 11 ? noun.accusative : noun.single;
  return `${formatNumber(count)} ${form}`;
}

export const PROGRAMMES_NOUN: CountedNoun = {
  one: 'برنامج واحد',
  two: 'برنامجان',
  plural: 'برامج',
  accusative: 'برنامجًا',
  single: 'برنامج',
  gender: 'masculine',
};

export const NEWSLETTERS_NOUN: CountedNoun = {
  one: 'نشرة واحدة',
  two: 'نشرتان',
  plural: 'نشرات',
  accusative: 'نشرة',
  single: 'نشرة',
  gender: 'feminine',
};

export const EPISODES_NOUN: CountedNoun = {
  one: 'حلقة واحدة',
  two: 'حلقتان',
  plural: 'حلقات',
  accusative: 'حلقة',
  single: 'حلقة',
  gender: 'feminine',
};

export const RESULTS_NOUN: CountedNoun = {
  one: 'نتيجة واحدة',
  two: 'نتيجتان',
  plural: 'نتائج',
  accusative: 'نتيجة',
  single: 'نتيجة',
  gender: 'feminine',
};

/** «389 حلقة», «5 حلقات»: the counted noun after a number, by its last two digits. */
export function episodesNoun(count: number) {
  const tens = count % 100;
  return tens >= 3 && tens <= 10 ? 'حلقات' : 'حلقة';
}
