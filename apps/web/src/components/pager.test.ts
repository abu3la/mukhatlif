import { describe, expect, it } from 'vitest';
import { parsePage } from './pager';

describe('parsePage', () => {
  it('defaults to the first page for anything a reader might paste', () => {
    for (const value of [undefined, '', '0', '-3', 'abc', '1.5', '1e9999']) {
      expect(parsePage(value)).toBe(1);
    }
  });

  it('accepts a valid page and the first value of a repeated parameter', () => {
    expect(parsePage('4')).toBe(4);
    expect(parsePage(['7', '9'])).toBe(7);
  });
});
