const EXTERNAL_IMAGE_LINK_HOSTS = new Set([
  'goodreads.com',
  'www.goodreads.com',
  'apps.apple.com',
  'youtube.com',
  'www.youtube.com',
  'youtu.be',
]);

const INTERNAL_IMAGE_ROUTES = new Map([
  ['/listen', '/shows'],
  ['/sponsor', '/sponsor'],
  ['/suggest', '/suggest'],
]);

function query(value: URLSearchParams): string {
  const result = value.toString();
  return result ? `?${result}` : '';
}

function normalizedPath(value: string): string {
  const path = value.replace(/\/{2,}/g, '/').replace(/\/$/, '');
  return path || '/';
}

export function rewriteArticleLink(value: string): string | null {
  const trimmed = value.trim().replaceAll('&amp;', '&');
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
  if (trimmed.startsWith('#')) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.username || url.password) return null;
    if (['mukhtalif.net', 'www.mukhtalif.net'].includes(url.hostname)) {
      const pathname = url.pathname.replace(/\/(?:%E2%86%97|↗)\/?$/i, '') || '/';
      return `${pathname}${query(url.searchParams)}${url.hash}`;
    }
    if (url.protocol === 'https:' || url.protocol === 'mailto:') return url.toString();
    return null;
  } catch {
    return null;
  }
}

export function rewriteLegacyImageLink(value: string): {
  linkUrl: string | null;
  disposition: 'internal-rewritten' | 'external-https' | 'rejected';
} {
  const trimmed = value.trim().replaceAll('&amp;', '&');
  try {
    const url =
      trimmed.startsWith('/') && !trimmed.startsWith('//')
        ? new URL(trimmed, 'https://mukhtalif.net')
        : new URL(trimmed);
    if (url.username || url.password) return { linkUrl: null, disposition: 'rejected' };
    if (['mukhtalif.net', 'www.mukhtalif.net'].includes(url.hostname)) {
      const route = INTERNAL_IMAGE_ROUTES.get(normalizedPath(url.pathname));
      if (!route) return { linkUrl: null, disposition: 'rejected' };
      return {
        linkUrl: `${route}${query(url.searchParams)}`,
        disposition: 'internal-rewritten',
      };
    }
    if (url.protocol === 'https:' && EXTERNAL_IMAGE_LINK_HOSTS.has(url.hostname)) {
      return { linkUrl: url.toString(), disposition: 'external-https' };
    }
    return { linkUrl: null, disposition: 'rejected' };
  } catch {
    return { linkUrl: null, disposition: 'rejected' };
  }
}
