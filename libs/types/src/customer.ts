import type { PlaybackProgress } from './engagement';
import type { User } from './user';

export type CustomerGender = 'male' | 'female' | 'prefer_not_to_say';

/** Private customer data, returned only to the account owner. */
export interface CustomerProfile extends User {
  gender: CustomerGender | null;
  birthDate: string | null;
  interests: string[];
  onboarded: boolean;
}

export interface CustomerPlaylist {
  id: string;
  name: string;
  description: string;
  episodeIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CustomerBookmark {
  id: string;
  episodeId: string;
  positionSec: number;
  label: string;
  createdAt: string;
}

export interface CustomerLibraryDocument {
  savedEpisodeIds: string[];
  savedArticleIds: string[];
  playlists: CustomerPlaylist[];
  bookmarks: CustomerBookmark[];
  queueEpisodeIds: string[];
}

/** Content IDs resolve through the published catalogue; editorial data stays private. */
export interface CustomerLibrary extends CustomerLibraryDocument {
  followedShowIds: string[];
  progress: PlaybackProgress[];
}
