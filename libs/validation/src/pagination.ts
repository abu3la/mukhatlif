import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, type ListQuery } from '@mukhtalif/types';

const positiveInt = (max: number) =>
  z.coerce.number().int().min(1).max(max);

/**
 * Paging is opt-in. `page` and `perPage` stay optional so their absence can be
 * detected by the route and answered with the historical bare array.
 */
export const listQuerySchema = z.object({
  page: positiveInt(100_000).optional(),
  perPage: positiveInt(MAX_PAGE_SIZE).optional(),
  search: z.string().trim().min(1).max(200).optional(),
});
export type ListQueryInput = z.infer<typeof listQuerySchema>;

/** True when the caller asked for the paginated envelope rather than an array. */
export function isPaginatedRequest(input: ListQueryInput): boolean {
  return input.page !== undefined || input.perPage !== undefined;
}

export function resolveListQuery(input: ListQueryInput): ListQuery {
  return {
    page: input.page ?? 1,
    perPage: input.perPage ?? DEFAULT_PAGE_SIZE,
    search: input.search,
  };
}
