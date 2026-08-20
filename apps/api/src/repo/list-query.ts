import type { ListQuery, PageResult } from '@mukhtalif/types';

/** Case-insensitive substring match across the supplied fields. */
export function matchesSearch(search: string | undefined, ...fields: (string | undefined)[]) {
  if (!search) return true;
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return fields.some((field) => field?.toLowerCase().includes(needle));
}

/** Slices an already-filtered, already-sorted collection. */
export function paginate<T>(items: readonly T[], query: ListQuery): PageResult<T> {
  const start = (query.page - 1) * query.perPage;
  return { items: items.slice(start, start + query.perPage), total: items.length };
}

/** Inclusive PostgREST `range()` bounds for a 1-based page. */
export function pageRange(query: ListQuery): { from: number; to: number } {
  const from = (query.page - 1) * query.perPage;
  return { from, to: from + query.perPage - 1 };
}

/**
 * Escapes a search term for a PostgREST `or=(col.ilike.*term*)` filter.
 *
 * The term reaches PostgREST inside a comma-separated, parenthesized filter
 * string, so an unescaped comma, parenthesis, quote, or backslash would let a
 * caller inject extra filter clauses. LIKE wildcards are escaped as well so a
 * literal `%` searches for a percent sign instead of matching everything.
 */
export function escapeSearchPattern(search: string): string {
  return search
    .replace(/[\\%_]/g, (character) => `\\${character}`)
    .replace(/[,()"*]/g, ' ')
    .trim();
}
