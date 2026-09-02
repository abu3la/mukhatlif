import type { Article } from '@mukhtalif/types';
import { mediaAssetIdSchema } from '@mukhtalif/validation';

/**
 * Origins that were deliberately persisted by the reviewed development import.
 * Keep this allowlist exact: an arbitrary workers.dev URL must never be turned
 * into a first-party API URL merely because its path happens to look familiar.
 */
const TRUSTED_STORED_MEDIA_ORIGINS = new Set([
  'https://mukhtalif-api.mukhtalif-development.workers.dev',
  'https://api.mukhtalif.net',
]);

function exactOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Re-homes a previously imported first-party media URL for the current runtime.
 * This is an output-only projection; callers must never persist the result.
 */
export function rebaseTrustedMediaUrl(
  value: string | undefined,
  mediaPublicOrigin: string | null | undefined,
): string | undefined {
  if (!value || !mediaPublicOrigin) return value;
  const targetOrigin = exactOrigin(mediaPublicOrigin);
  if (!targetOrigin) return value;

  let source: URL;
  try {
    source = new URL(value);
  } catch {
    return value;
  }
  if (
    source.username ||
    source.password ||
    source.search ||
    source.hash ||
    (source.origin !== targetOrigin && !TRUSTED_STORED_MEDIA_ORIGINS.has(source.origin))
  ) {
    return value;
  }

  const match = /^\/media\/([^/]+)$/.exec(source.pathname);
  if (!match) return value;
  let mediaId: string;
  try {
    mediaId = decodeURIComponent(match[1]);
  } catch {
    return value;
  }
  if (!mediaAssetIdSchema.safeParse(mediaId).success) return value;

  return new URL(`/media/${encodeURIComponent(mediaId)}`, `${targetOrigin}/`).toString();
}

/**
 * Studio sends its complete form state on update. If a trusted URL was only
 * projected onto the current runtime origin, keep the exact stored value so an
 * unrelated edit cannot silently rewrite the shared database.
 */
export function preserveStoredMediaUrl(
  value: string | null | undefined,
  storedValue: string | undefined,
  mediaPublicOrigin: string | null | undefined,
): string | null | undefined {
  if (typeof value !== 'string' || !storedValue || !mediaPublicOrigin) return value;
  const targetOrigin = exactOrigin(mediaPublicOrigin);
  if (!targetOrigin) return value;

  const mediaId = (candidate: string, allowedOrigins: ReadonlySet<string>): string | null => {
    let url: URL;
    try {
      url = new URL(candidate);
    } catch {
      return null;
    }
    if (url.username || url.password || url.search || url.hash || !allowedOrigins.has(url.origin)) {
      return null;
    }
    const match = /^\/media\/([^/]+)$/.exec(url.pathname);
    if (!match) return null;
    try {
      const decoded = decodeURIComponent(match[1]);
      return mediaAssetIdSchema.safeParse(decoded).success ? decoded : null;
    } catch {
      return null;
    }
  };

  const projectedOrigins = new Set([targetOrigin]);
  const storedOrigins = new Set([...TRUSTED_STORED_MEDIA_ORIGINS, targetOrigin]);
  const projectedId = mediaId(value, projectedOrigins);
  const storedId = mediaId(storedValue, storedOrigins);
  return projectedId && projectedId === storedId ? storedValue : value;
}

/** Returns a response-safe clone without changing the repository-owned record. */
export function rebaseArticleMediaUrls(
  article: Article,
  mediaPublicOrigin: string | null | undefined,
): Article {
  const coverUrl = rebaseTrustedMediaUrl(article.coverUrl, mediaPublicOrigin);
  const socialImageUrl = rebaseTrustedMediaUrl(article.seo.socialImageUrl, mediaPublicOrigin);
  if (coverUrl === article.coverUrl && socialImageUrl === article.seo.socialImageUrl)
    return article;
  return {
    ...article,
    coverUrl,
    seo: { ...article.seo, socialImageUrl },
  };
}
