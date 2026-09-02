import { describe, expect, it } from 'vitest';
import { pageHref, parsePage } from './pager';

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

describe('pageHref', () => {
  it('keeps the first page canonical when no filters are active', () => {
    expect(pageHref('/guests', 1)).toBe('/guests');
    expect(pageHref('/guests', 3)).toBe('/guests?page=3');
  });

  it('preserves and encodes an active search while paging', () => {
    expect(pageHref('/guests', 1, { search: 'إدارة المنتجات' })).toBe(
      '/guests?search=%D8%A5%D8%AF%D8%A7%D8%B1%D8%A9+%D8%A7%D9%84%D9%85%D9%86%D8%AA%D8%AC%D8%A7%D8%AA',
    );
    expect(pageHref('/guests', 2, { search: 'نورة' })).toContain('&page=2');
  });
});
