export interface Follow {
  userId: string;
  showId: string;
  /** ISO timestamp */
  createdAt: string;
}

export interface PlaybackProgress {
  userId: string;
  episodeId: string;
  positionSec: number;
  /** ISO timestamp */
  updatedAt: string;
}
