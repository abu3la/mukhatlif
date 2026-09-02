import type { GuestSocial, SocialPlatform } from '@mukhtalif/types';
import { formatNumber } from './formatting';

export const GUEST_SEARCH_MAX_LENGTH = 200;

const SOCIAL_LABELS = {
  x: 'إكس',
  linkedin: 'لينكدإن',
  instagram: 'إنستغرام',
  youtube: 'يوتيوب',
  website: 'الموقع',
} as const satisfies Record<SocialPlatform, string>;

const SOCIAL_ORIGINS = {
  x: 'https://x.com/',
  linkedin: 'https://www.linkedin.com/',
  instagram: 'https://www.instagram.com/',
  youtube: 'https://www.youtube.com/',
} as const satisfies Record<Exclude<SocialPlatform, 'website'>, string>;

const SOCIAL_HOSTS: Record<Exclude<SocialPlatform, 'website'>, ReadonlySet<string>> = {
  x: new Set(['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com']),
  linkedin: new Set(['linkedin.com', 'www.linkedin.com']),
  instagram: new Set(['instagram.com', 'www.instagram.com']),
  youtube: new Set(['youtube.com', 'www.youtube.com', 'youtu.be']),
};

function safeHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

export function guestSocialLabel(platform: SocialPlatform): string {
  return SOCIAL_LABELS[platform];
}

/** Turns a Studio handle into a safe, absolute public profile URL. */
export function guestSocialHref(
  social: Pick<GuestSocial, 'platform' | 'handle'>,
): string | null {
  const handle = social.handle.trim();
  if (!handle) return null;

  if (social.platform === 'website') {
    const candidate = /^https?:\/\//i.test(handle)
      ? handle
      : `https://${handle.replace(/^\/+/, '')}`;
    return safeHttpUrl(candidate)?.toString() ?? null;
  }

  if (/^https?:\/\//i.test(handle)) {
    const url = safeHttpUrl(handle);
    return url && SOCIAL_HOSTS[social.platform].has(url.hostname.toLowerCase())
      ? url.toString()
      : null;
  }

  // A scheme-like value could escape the platform origin when resolved as a URL.
  if (/^[a-z][a-z\d+.-]*:/i.test(handle)) return null;
  const path = handle.replace(/^@/, '').replace(/^\/+/, '');
  return path ? new URL(path, SOCIAL_ORIGINS[social.platform]).toString() : null;
}

export function parseGuestSearch(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw ?? '').trim().replace(/\s+/g, ' ').slice(0, GUEST_SEARCH_MAX_LENGTH);
}

export function guestAppearanceLabel(value: number): string {
  const count = Number.isSafeInteger(value) && value > 0 ? value : 0;
  if (count === 0) return 'لا حلقات منشورة على يوتيوب';
  if (count === 1) return 'ظهر في حلقة واحدة على يوتيوب';
  if (count === 2) return 'ظهر في حلقتين على يوتيوب';
  if (count <= 10) return `ظهر في ${formatNumber(count)} حلقات على يوتيوب`;
  return `ظهر في ${formatNumber(count)} حلقة على يوتيوب`;
}

export function guestCountLabel(value: number): string {
  const count = Number.isSafeInteger(value) && value > 0 ? value : 0;
  if (count === 0) return 'لا ضيوف منشورون بعد';
  if (count === 1) return 'ضيف واحد';
  if (count === 2) return 'ضيفان';
  if (count <= 10) return `${formatNumber(count)} ضيوف`;
  if (count < 100) return `${formatNumber(count)} ضيفًا`;
  return `${formatNumber(count)} ضيف`;
}
