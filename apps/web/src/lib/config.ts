/**
 * Server-side configuration.
 *
 * Neither value carries a NEXT_PUBLIC_ prefix. Content reads stay in Server
 * Components. A resolved public API origin is passed only to anonymous public
 * form components; no token or credential is ever shipped to the client.
 */
function origin(value: string | undefined, name: string): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`${name} must be an absolute URL.`);
  }
  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error(`${name} must be an HTTP(S) origin without credentials.`);
  }
  if (url.protocol !== 'https:' && !isLocal) {
    throw new Error(`${name} must use HTTPS outside local development.`);
  }
  return url.toString().replace(/\/$/, '');
}

export function apiOrigin(): string | null {
  return origin(process.env.MUKHTALIF_API_URL, 'MUKHTALIF_API_URL');
}

/**
 * The canonical public origin. It must match the Worker's PUBLIC_WEB_URL, which
 * is what a sent newsletter uses to build absolute article links: if the two
 * disagree, an already-delivered email points at pages this site does not serve.
 */
export function publicWebUrl(): string {
  return origin(process.env.PUBLIC_WEB_URL, 'PUBLIC_WEB_URL') ?? 'http://localhost:3000';
}

/** Only the final public hostname may be indexed. Preview and staging stay private to search. */
export function isSearchIndexingEnabled(): boolean {
  return publicWebUrl() === 'https://mukhtalif.net';
}

export function absoluteUrl(path: string): string {
  return new URL(path, `${publicWebUrl()}/`).toString();
}
