import { describe, expect, it } from 'vitest';

import {
  formatAdditionalEpisodeCount,
  formatArticleTimeline,
  formatArabicDate,
  formatArabicDateTime,
  formatArabicInteger,
  formatArabicNumber,
  formatArabicTime,
  formatEpisodeCount,
  formatEpisodeTimeline,
  formatGuestAppearanceSummary,
  formatGuestCount,
  formatPageCount,
  formatRoleCount,
  formatResultCount,
  formatSarHalalas,
  formatSubscriptionDetail,
  formatUserCount,
  isoToRiyadhLocalInput,
  matchesArabicSearch,
  normalizeArabicIndicDigits,
  normalizeArabicSearch,
  plural,
  pluralArabic,
  riyadhLocalInputToIso,
} from './arabic';
import { demoData } from './demo-data';

const NON_ASCII_ARABIC_DIGITS = /[٠-٩۰-۹]/u;

function expectOnlyAsciiDigits(value: string): void {
  expect(value).toMatch(/[0-9]/u);
  expect(value).not.toMatch(NON_ASCII_ARABIC_DIGITS);
}

describe('Arabic digit normalization', () => {
  it('normalizes Arabic-Indic and Eastern Arabic digits to ASCII', () => {
    expect(normalizeArabicIndicDigits('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789');
    expect(normalizeArabicIndicDigits('۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789');
    expect(normalizeArabicIndicDigits('الحلقة ١۲ من ٣۰')).toBe('الحلقة 12 من 30');
  });

  it('formats integers, decimals, and halalas with Latin ASCII digits', () => {
    expect(formatArabicInteger(1234)).toBe('1,234');
    expect(formatArabicNumber(29.5, { minimumFractionDigits: 2 })).toBe('29.50');
    expect(formatSarHalalas(2900)).toBe('29.00 ر.س.');
  });
});

describe('access-directory Arabic counts', () => {
  it.each([
    [1, 'دور واحد'],
    [2, 'دوران'],
    [3, '3 أدوار'],
    [11, '11 دورًا'],
  ])('formats %i roles', (count, expected) => {
    expect(formatRoleCount(count)).toBe(expected);
  });

  it.each([
    [1, 'صفحة واحدة'],
    [2, 'صفحتان'],
    [3, '3 صفحات'],
    [11, '11 صفحة'],
  ])('formats %i pages', (count, expected) => {
    expect(formatPageCount(count)).toBe(expected);
  });
});

describe('Arabic search normalization', () => {
  it('folds diacritics, tatweel, alef variants, hamza carriers, ya, and ta marbuta', () => {
    expect(normalizeArabicSearch('  إِدَارَة ـ مُؤَسَّسَات ۰١  ')).toBe('اداره موسسات 01');
    expect(normalizeArabicSearch('آلاء وإيمان فى بيئة')).toBe('الاء وايمان في بييه');
  });

  it('collapses whitespace and safely handles empty values', () => {
    expect(normalizeArabicSearch('  حلقة\n\t  جديدة  ')).toBe('حلقه جديده');
    expect(normalizeArabicSearch(null)).toBe('');
    expect(normalizeArabicSearch(undefined)).toBe('');
  });

  it('matches normalized terms across separate fields', () => {
    expect(matchesArabicSearch('اداره ١٢', 'الإِدَارَة', 'غلاف', 12)).toBe(true);
    expect(matchesArabicSearch('تقنيه طبيبه', 'طبيبة غيّرت مسارها إلى التقنية')).toBe(true);
    expect(matchesArabicSearch('بترولي ۲۲', 'الهيدروجين الأخضر', 'بترولي', 22)).toBe(true);
  });

  it('requires every query term and treats a blank query as unfiltered', () => {
    expect(matchesArabicSearch('النفط السوق', 'أسعار النفط', 'بترولي')).toBe(false);
    expect(matchesArabicSearch('   ', null, undefined)).toBe(true);
  });
});

describe('simplified Arabic plural agreement', () => {
  const forms = {
    zero: 'لا عناصر',
    one: 'عنصر واحد',
    two: 'عنصران',
    few: 'عناصر',
    many: 'عنصرًا',
  } as const;

  it.each([
    [0, 'لا عناصر'],
    [1, 'عنصر واحد'],
    [2, 'عنصران'],
    [3, '3 عناصر'],
    [10, '10 عناصر'],
    [11, '11 عنصرًا'],
    [100, '100 عنصرًا'],
  ])('formats count %s using its defined agreement bucket', (count: number, expected: string) => {
    expect(plural(count, forms)).toBe(expected);
  });

  it('uses the many form for zero when no exact-zero copy is supplied', () => {
    expect(plural(0, { one: 'واحد', two: 'اثنان', few: 'قليل', many: 'عنصر' })).toBe('0 عنصر');
  });

  it('applies the documented integer buckets to fractional counts', () => {
    expect(plural(2.9, forms)).toBe('عنصران');
    expect(plural(10.9, forms)).toBe('10 عناصر');
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects invalid count %s',
    (count: number) => {
      expect(() => plural(count, forms)).toThrow(RangeError);
    },
  );

  it('exposes pluralArabic as the same canonical implementation', () => {
    expect(pluralArabic).toBe(plural);
  });

  it.each([
    [formatGuestCount, 1, 'ضيف واحد'],
    [formatGuestCount, 2, 'ضيفان'],
    [formatGuestCount, 7, '7 ضيوف'],
    [formatGuestCount, 11, '11 ضيفًا'],
    [formatEpisodeCount, 1, 'حلقة واحدة'],
    [formatEpisodeCount, 2, 'حلقتان'],
    [formatEpisodeCount, 3, '3 حلقات'],
    [formatUserCount, 12, '12 مستخدمًا'],
    [formatResultCount, 0, 'لا نتائج مطابقة'],
    [formatAdditionalEpisodeCount, 2, 'حلقتين أخريين'],
  ] as const)(
    'keeps domain copy stable for count %s',
    (formatter: (value: number) => string, count: number, expected: string) => {
      expect(formatter(count)).toBe(expected);
    },
  );

  it.each([
    [0, 'لم يظهر بعد'],
    [1, 'ظهر في حلقة واحدة'],
    [2, 'ظهر في حلقتين'],
    [4, 'ظهر في 4 حلقات'],
  ])('formats guest appearance summary for %s appearances', (count: number, expected: string) => {
    expect(formatGuestAppearanceSummary(count)).toBe(expected);
  });
});

describe('Riyadh date and time formatting', () => {
  const instant = '2026-08-16T00:00:00.000Z';

  it('uses the Gregorian calendar, Latin ASCII digits, and the Riyadh time zone', () => {
    expect(formatArabicDate(instant)).toBe('16 أغسطس 2026');
    expect(formatArabicTime(instant)).toBe('3:00 ص');
    expect(formatArabicDateTime(instant)).toBe('16 أغسطس 2026 · 3:00 ص');
  });

  it('rejects invalid dates instead of rendering an invalid label', () => {
    expect(() => formatArabicDate('not-a-date')).toThrow(RangeError);
    expect(() => formatArabicTime('not-a-date')).toThrow(RangeError);
  });

  it('converts datetime-local input, including Arabic digits, from Riyadh to UTC', () => {
    expect(riyadhLocalInputToIso('٢٠٢٦-٠٨-١٦T١٢:٣٠')).toBe('2026-08-16T09:30:00.000Z');
    expect(riyadhLocalInputToIso(' 2026-08-16T00:15 ')).toBe('2026-08-15T21:15:00.000Z');
  });

  it('round-trips ISO instants through Riyadh datetime-local values', () => {
    expect(isoToRiyadhLocalInput('2026-08-16T09:30:00.000Z')).toBe('2026-08-16T12:30');
    expect(isoToRiyadhLocalInput('2026-08-15T21:15:00.000Z')).toBe('2026-08-16T00:15');
    expect(riyadhLocalInputToIso(isoToRiyadhLocalInput('2026-08-16T09:30:00.000Z'))).toBe(
      '2026-08-16T09:30:00.000Z',
    );
  });

  it.each(['', '2026-8-16T12:30', '2026-08-16 12:30', 'not-a-date'])(
    'rejects malformed datetime-local value %s',
    (value: string) => {
      expect(() => riyadhLocalInputToIso(value)).toThrow(RangeError);
    },
  );
});

describe('Latin ASCII digit output invariant', () => {
  const instant = '2026-08-16T00:00:00.000Z';
  const pluralForms = {
    one: 'عنصر واحد',
    two: 'عنصران',
    few: 'عناصر',
    many: 'عنصرًا',
  } as const;

  it.each([
    ['number', formatArabicNumber(1234.5, { minimumFractionDigits: 1 })],
    ['integer', formatArabicInteger(1234)],
    ['duration', `${formatArabicInteger(45)} د`],
    ['currency', formatSarHalalas(2900)],
    ['date', formatArabicDate(instant)],
    ['time', formatArabicTime(instant)],
    ['date and time', formatArabicDateTime(instant)],
    ['plural', plural(7, pluralForms)],
    ['plural alias', pluralArabic(11, pluralForms)],
    ['guest count', formatGuestCount(7)],
    ['episode count', formatEpisodeCount(7)],
    ['user count', formatUserCount(11)],
    ['role count', formatRoleCount(11)],
    ['page count', formatPageCount(11)],
    ['result count', formatResultCount(12)],
    ['guest appearance summary', formatGuestAppearanceSummary(4)],
    ['additional episode count', formatAdditionalEpisodeCount(12)],
    ['episode timeline', formatEpisodeTimeline(demoData.episodes[0])],
    ['article timeline', formatArticleTimeline(demoData.articles[0])],
    ['subscription detail', formatSubscriptionDetail(demoData.subscriptions[0])],
    ['Riyadh local input', isoToRiyadhLocalInput(instant)],
    ['ISO instant', riyadhLocalInputToIso('٢٠٢٦-٠٨-١٦T١٢:٣٠')],
  ])('%s contains ASCII digits and no Arabic-script digits', (_label, value) => {
    expectOnlyAsciiDigits(value);
  });
});
