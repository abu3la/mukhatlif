import { apiOrigin } from './config';

/**
 * Builds the anonymous streaming endpoint on the server.
 *
 * The returned URL is deliberately passed to the Client Component as plain
 * data. Player code must not import environment-backed configuration.
 */
export function publicEpisodeAudioSrc(episodeId: string): string | null {
  const origin = apiOrigin();
  if (!origin) return null;
  return new URL(`/episodes/${encodeURIComponent(episodeId)}/audio`, `${origin}/`).toString();
}
