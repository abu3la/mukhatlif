import type { PublicEpisodeRecord } from './episode';

/**
 * Guests are people who appear in episodes. They are Studio-managed editorial
 * records: a guest is neither an application user nor a Studio member, and a
 * guest record never carries authentication or authorization state.
 */
export const SOCIAL_PLATFORMS = ['x', 'linkedin', 'instagram', 'youtube', 'website'] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export function isSocialPlatform(value: string): value is SocialPlatform {
  return (SOCIAL_PLATFORMS as readonly string[]).includes(value);
}

/**
 * A guest is created empty from the Studio and filled in progressively, so
 * every editorial field is a possibly-empty string rather than optional. The
 * slug is server-owned and stable once assigned.
 */
export interface Guest {
  id: string;
  slug: string;
  name: string;
  role: string;
  city: string;
  email: string;
  bio: string;
  photoUrl?: string;
  /** ISO timestamp */
  createdAt: string;
}

export interface GuestSocial {
  id: string;
  guestId: string;
  platform: SocialPlatform;
  handle: string;
}

/** Public social projection. Storage identifiers stay inside the Studio API. */
export type PublicGuestSocial = Pick<GuestSocial, 'platform' | 'handle'>;

/** A guest's participation in one episode. The pair is unique. */
export interface GuestAppearance {
  guestId: string;
  episodeId: string;
}

/**
 * The three guest collections are read together because the Studio guest
 * directory renders a guest, its links, and its appearances as one view.
 */
export interface GuestDirectory {
  guests: Guest[];
  socials: GuestSocial[];
  appearances: GuestAppearance[];
}

/**
 * Public guest cards never expose editorial contact data or creation
 * metadata. A guest enters the public directory only through at least one
 * published episode, so the count is always greater than zero.
 */
export interface PublicGuest {
  id: string;
  slug: string;
  name: string;
  role: string;
  city: string;
  bio: string;
  photoUrl?: string;
  episodeCount: number;
}

/** A public guest and the published catalogue episodes they appeared in. */
export interface PublicGuestProfile {
  guest: PublicGuest;
  socials: PublicGuestSocial[];
  episodes: PublicEpisodeRecord[];
}
