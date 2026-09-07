import { describe, expect, it } from 'vitest';
import { dateTimeAttribute, formatDate, formatDuration, formatNumber } from './formatting';

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
