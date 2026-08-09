import type { EpisodeStatus, SubscriptionStatus } from '@mukhtalif/types';

/**
 * Mukhtalif's palette is taken from the real brand (mukhtalif.net):
 * a deep indigo ink lifted from the official wordmark, the vivid
 * "on-air" green the station uses on indigo, and the coral red of its
 * calls to action. Grounds are tinted toward the indigo so every
 * surface belongs to the same world; nothing is a neutral default.
 */
export const color = {
  // Light grounds
  /** Primary text and the wordmark — the logo's exact ink. */
  ink: '#171A56',
  inkSoft: '#4A4E7C',
  inkFaint: '#888CB0',
  /** Page ground: off-white tinted toward the brand indigo. */
  paper: '#F3F4F9',
  surface: '#FFFFFF',
  surfaceSunken: '#E9EBF4',
  line: '#D9DCEA',

  // Dark grounds (the wordmark ink deepened, not a generic slate)
  night: '#0D0F2E',
  nightSurface: '#151845',
  nightRaised: '#1D2154',
  inkOnNight: '#EAEBF6',
  mutedOnNight: '#9FA3C8',
  lineOnNight: '#2C3060',

  // Accent — the station's green, in three tones
  /** Vivid brand green: reserved for "on air" moments, best on indigo. */
  green: '#38DF82',
  /** Mid tone for fills on light grounds. */
  greenDeep: '#1FA85D',
  /** Dark enough for text on light grounds. */
  greenInk: '#14713E',

  // Semantics (kept separate from the accent)
  danger: '#F74D4B',
  dangerInk: '#C22F2D',
  warning: '#D08A2E',
} as const;

/** Episode lifecycle → badge color. White text passes on all of these. */
export const episodeStatusColor: Record<EpisodeStatus, string> = {
  draft: color.inkFaint,
  scheduled: '#3D4FB5',
  published: color.greenDeep,
  archived: '#5C5F80',
};

export const subscriptionStatusColor: Record<SubscriptionStatus, string> = {
  active: color.greenDeep,
  past_due: color.warning,
  canceled: color.dangerInk,
};
