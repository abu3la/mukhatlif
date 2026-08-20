import type {
  Episode,
  HomeSummary,
  PaginatedList,
  PublishedArticle,
  Show,
} from '@mukhtalif/types';
import { connection } from 'next/server';
import { apiOrigin } from './config';

/**
 * Read-only API access for server components.
 *
 * Every call runs on the server. The browser never talks to the API, so no
 * origin, credential, or Supabase key reaches the client bundle.
 */
export class ApiUnavailableError extends Error {
  constructor(readonly detail: string) {
    super('The content API is unavailable');
    this.name = 'ApiUnavailableError';
  }
}

/** Distinguishes "no such thing" from "could not ask", which render differently. */
export class NotFoundError extends Error {
  constructor() {
    super('Not found');
    this.name = 'NotFoundError';
  }
}

const REVALIDATE_SECONDS = 60;

/**
 * Fails a read without letting the failure become static output.
 *
 * `connection()` resolves normally at request time, but during a prerender it
 * throws Next's bail-out signal, which marks the route dynamic instead. Every
 * unavailability path goes through here, so a build run against an absent or
 * unreachable API cannot bake an error page that would then be served to real
 * readers until it revalidates. A 404 is deliberately not routed through this:
 * "no such article" is a real, cacheable answer, not a fault.
 */
async function unavailable(detail: string): Promise<never> {
  await connection();
  throw new ApiUnavailableError(detail);
}

async function read<T>(path: string): Promise<T> {
  const origin = apiOrigin();
  if (!origin) return unavailable('MUKHTALIF_API_URL is not configured');

  let response: Response;
  try {
    response = await fetch(new URL(path, `${origin}/`), {
      headers: { accept: 'application/json' },
      next: { revalidate: REVALIDATE_SECONDS },
    });
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : 'Network error');
  }

  if (response.status === 404) throw new NotFoundError();
  if (!response.ok) return unavailable(`API responded ${response.status}`);
  try {
    return (await response.json()) as T;
  } catch {
    return unavailable('API returned a malformed response');
  }
}

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const serialized = search.toString();
  return serialized ? `?${serialized}` : '';
}

export function getHomeSummary(): Promise<HomeSummary> {
  return read<HomeSummary>('/home');
}

export function listShows(): Promise<Show[]> {
  return read<Show[]>('/shows');
}

export function getShow(idOrSlug: string): Promise<Show> {
  return read<Show>(`/shows/${encodeURIComponent(idOrSlug)}`);
}

/**
 * Published episodes only. The API decides this from the caller's permissions
 * and this client is always anonymous, so a draft can never be requested here.
 */
export function listEpisodes(options: {
  page?: number;
  perPage?: number;
  search?: string;
  showId?: string;
}): Promise<PaginatedList<Episode>> {
  return read<PaginatedList<Episode>>(
    `/episodes${query({
      page: options.page ?? 1,
      perPage: options.perPage ?? 12,
      search: options.search,
      showId: options.showId,
    })}`,
  );
}

export function getEpisode(id: string): Promise<Episode> {
  return read<Episode>(`/episodes/${encodeURIComponent(id)}`);
}

export function listArticles(options: {
  page?: number;
  perPage?: number;
  search?: string;
}): Promise<PaginatedList<PublishedArticle>> {
  return read<PaginatedList<PublishedArticle>>(
    `/articles${query({
      page: options.page ?? 1,
      perPage: options.perPage ?? 9,
      search: options.search,
    })}`,
  );
}

export function getArticle(slug: string): Promise<PublishedArticle> {
  return read<PublishedArticle>(`/articles/${encodeURIComponent(slug)}`);
}
