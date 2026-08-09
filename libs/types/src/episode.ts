export const EPISODE_STATUSES = ['draft', 'scheduled', 'published', 'archived'] as const;
export type EpisodeStatus = (typeof EPISODE_STATUSES)[number];

/**
 * The publishing lifecycle. One table drives both the server-side check
 * (422 on anything not listed here) and the admin UI's action buttons.
 */
export const EPISODE_TRANSITIONS: Record<EpisodeStatus, readonly EpisodeStatus[]> = {
  draft: ['scheduled', 'published'],
  scheduled: ['draft', 'published'],
  published: ['archived'],
  archived: ['published'],
};

export function canTransitionEpisode(from: EpisodeStatus, to: EpisodeStatus): boolean {
  return EPISODE_TRANSITIONS[from].includes(to);
}

export interface Episode {
  id: string;
  showId: string;
  titleAr: string;
  titleEn?: string;
  showNotesAr: string;
  showNotesEn?: string;
  /** Object key in the R2 audio bucket, when audio is hosted first-party. */
  audioKey?: string;
  /** Direct URL for externally hosted audio. */
  audioUrl?: string;
  durationSec: number;
  episodeNumber: number;
  /** Premium episodes require an active subscription to stream. */
  premium: boolean;
  status: EpisodeStatus;
  /** ISO timestamp; required while status is `scheduled`. */
  publishAt?: string;
  /** ISO timestamp */
  createdAt: string;
}
