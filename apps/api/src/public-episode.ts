import type { Episode, PublicEpisodeRecord } from '@mukhtalif/types';

/**
 * Explicit anonymous-catalogue allowlist. Keeping this in one module ensures a
 * guest profile cannot accidentally reveal an audio source while `/episodes`
 * does not.
 */
export function toPublicEpisode(episode: Episode): PublicEpisodeRecord {
  return {
    id: episode.id,
    showId: episode.showId,
    titleAr: episode.titleAr,
    youtubeVideoId: episode.premium ? undefined : episode.youtubeVideoId,
    titleEn: episode.titleEn,
    showNotesAr: episode.showNotesAr,
    showNotesEn: episode.showNotesEn,
    durationSec: episode.durationSec,
    episodeNumber: episode.episodeNumber,
    premium: episode.premium,
    status: episode.status,
    publishAt: episode.publishAt,
    createdAt: episode.createdAt,
  };
}
