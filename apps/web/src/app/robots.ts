import type { MetadataRoute } from 'next';
import { absoluteUrl, isSearchIndexingEnabled } from '@/lib/config';

/**
 * Account, sign-in and utility pages carry nothing a search result should
 * point to; everything public stays open.
 */
export const PRIVATE_PATHS = [
  '/account',
  '/auth',
  '/confirm',
  '/design-system',
  '/followed',
  '/forgot',
  '/history',
  '/interests',
  '/library',
  '/loading-preview',
  '/login',
  '/onboarding',
  '/playlists',
  '/reset',
  '/search',
  '/settings',
  '/signin',
  '/signup',
];

export default function robots(): MetadataRoute.Robots {
  // Staging and previews must never be crawled; only the final host is.
  if (!isSearchIndexingEnabled()) return { rules: { userAgent: '*', disallow: '/' } };
  return {
    rules: { userAgent: '*', allow: '/', disallow: PRIVATE_PATHS },
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
