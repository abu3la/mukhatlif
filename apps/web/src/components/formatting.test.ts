import { describe, expect, it } from 'vitest';
import {
  EPISODES_NOUN,
  NEWSLETTERS_NOUN,
  PROGRAMMES_NOUN,
  RESULTS_NOUN,
  countInWords,
  dateTimeAttribute,
  formatDate,
  formatDuration,
  formatNumber,
} from './formatting';

describe('formatDuration', () => {
  it('renders handoff durations with hours and Latin digits', () => {
    expect(formatDuration(39 * 60)).toBe('39 دقيقة');
    expect(formatDuration(60 * 60)).toBe('1 س');
    expect(formatDuration(95 * 60)).toBe('1 س 35 د');
    expect(formatDuration(2 * 60 * 60)).toBe('2 س');
  });

  it('returns nothing for a missing or nonsensical duration', () => {
    expect(formatDuration(0)).toBe('');
    expect(formatDuration(-1)).toBe('');
    expect(formatDuration(Number.NaN)).toBe('');
  });
});

describe('formatDate', () => {
  it('uses Gregorian dates and Latin digits from the handoff', () => {
    expect(formatDate('2026-07-20T00:00:00Z')).toMatch(/2026/);
    expect(formatNumber(2026)).toBe('2026');
  });

  it('degrades to an empty string rather than rendering "Invalid Date"', () => {
    expect(formatDate(undefined)).toBe('');
    expect(formatDate('not-a-date')).toBe('');
    expect(dateTimeAttribute('not-a-date')).toBeUndefined();
  });

  it('emits a machine-readable datetime attribute', () => {
    expect(dateTimeAttribute('2026-07-20T10:30:00Z')).toBe('2026-07-20T10:30:00.000Z');
  });
});

describe('countInWords', () => {
  it('counts in words to ten, with the number taking the other gender', () => {
    expect(countInWords(1, PROGRAMMES_NOUN)).toBe('برنامج واحد');
    expect(countInWords(2, PROGRAMMES_NOUN)).toBe('برنامجان');
    expect(countInWords(9, PROGRAMMES_NOUN)).toBe('تسعة برامج');
    expect(countInWords(2, NEWSLETTERS_NOUN)).toBe('نشرتان');
    expect(countInWords(3, NEWSLETTERS_NOUN)).toBe('ثلاث نشرات');
    expect(countInWords(8, NEWSLETTERS_NOUN)).toBe('ثماني نشرات');
  });

  it('switches to digits after ten, with the noun the number asks for', () => {
    expect(countInWords(11, PROGRAMMES_NOUN)).toBe('11 برنامجًا');
    expect(countInWords(100, PROGRAMMES_NOUN)).toBe('100 برنامج');
    expect(countInWords(103, PROGRAMMES_NOUN)).toBe('103 برامج');
    expect(countInWords(27, NEWSLETTERS_NOUN)).toBe('27 نشرة');
  });

  it('counts episodes and search results', () => {
    expect(countInWords(847, EPISODES_NOUN)).toBe('847 حلقة');
    expect(countInWords(8, EPISODES_NOUN)).toBe('ثماني حلقات');
    expect(countInWords(1, EPISODES_NOUN)).toBe('حلقة واحدة');
    expect(countInWords(19, RESULTS_NOUN)).toBe('19 نتيجة');
    expect(countInWords(3, RESULTS_NOUN)).toBe('ثلاث نتائج');
    expect(countInWords(2, RESULTS_NOUN)).toBe('نتيجتان');
  });
});
