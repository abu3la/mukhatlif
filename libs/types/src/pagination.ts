/**
 * List endpoints have one uniform paging contract.
 *
 * A request that supplies neither `page` nor `perPage` receives the historical
 * bare array. A request that supplies either one receives `PaginatedList`.
 * `search` may be combined with either mode and never changes the shape, so
 * one query parameter decides the response body and callers written before
 * paging existed keep working unchanged.
 */
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export interface PageInfo {
  /** 1-based. */
  page: number;
  perPage: number;
  /** Total matching records before paging. */
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginatedList<T> {
  items: T[];
  pageInfo: PageInfo;
}

/** Normalized paging and search request, resolved by the API from the query. */
export interface ListQuery {
  page: number;
  perPage: number;
  search?: string;
}

/** What a repository returns: the requested slice plus the unpaged total. */
export interface PageResult<T> {
  items: T[];
  total: number;
}

export function toPageInfo(query: ListQuery, total: number): PageInfo {
  const totalPages = total === 0 ? 0 : Math.ceil(total / query.perPage);
  return {
    page: query.page,
    perPage: query.perPage,
    total,
    totalPages,
    hasNextPage: query.page < totalPages,
    hasPreviousPage: query.page > 1 && total > 0,
  };
}

export function toPaginatedList<T>(result: PageResult<T>, query: ListQuery): PaginatedList<T> {
  return { items: result.items, pageInfo: toPageInfo(query, result.total) };
}
