import type { Episode, Show } from '@mukhtalif/types';
import { listEpisodes, listShows } from '@/lib/api';

/**
 * The newest public episodes across the given catalogue programmes, newest
 * first. Returns null when the catalogue cannot be read, so the caller hides
 * the section instead of showing an empty one.
 */
export async function latestEpisodesOf(
  showSlugs: string[],
  limit = 6,
): Promise<{ episodes: Episode[]; shows: Map<string, Show> } | null> {
  if (!showSlugs.length) return { episodes: [], shows: new Map() };
  try {
    const shows = (await listShows()).filter((show) => showSlugs.includes(show.slug));
    const pages = await Promise.all(
      shows.map((show) => listEpisodes({ showId: show.id, perPage: limit })),
    );
    const episodes = pages
      .flatMap((page) => page.items)
      .filter((episode) => !episode.premium)
      .sort((a, b) => (b.publishAt ?? '').localeCompare(a.publishAt ?? ''))
      .slice(0, limit);
    return { episodes, shows: new Map(shows.map((show) => [show.id, show])) };
  } catch {
    return null;
  }
}
