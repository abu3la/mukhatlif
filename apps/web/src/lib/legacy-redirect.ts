const MAX_PATH_LENGTH = 4_096;
const ENCODED_SEPARATOR = /%(?:2f|5c)/iu;
const REDIRECT_STATUS_CODES = new Set([301, 302, 307, 308]);

export type LegacyRedirectStatusCode = 301 | 302 | 307 | 308;

export interface LegacyRedirectResolution {
  destination: string;
  statusCode: LegacyRedirectStatusCode;
}

export interface ValidatedLegacyRedirect extends LegacyRedirectResolution {
  location: string;
}

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
  });
}

function hasDotSegment(pathname: string): boolean {
  try {
    return pathname
      .split('/')
      .some((segment) => ['.', '..'].includes(decodeURIComponent(segment)));
  } catch {
    return true;
  }
}

function upperCasePercentEscapes(value: string): string {
  return value.replace(/%[0-9a-f]{2}/giu, (token) => token.toUpperCase());
}

/**
 * Produces the exact key used by the reviewed `url_redirects` rows.
 *
 * The source is a pathname, never a complete URL. Ambiguous encodings are
 * rejected rather than decoded because different proxies can interpret them
 * differently before the request reaches Next.js.
 */
export function canonicalLegacyRequestPath(value: string): string | null {
  if (
    !value ||
    value === '/' ||
    value.length > MAX_PATH_LENGTH ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('?') ||
    value.includes('#') ||
    value.includes('\\') ||
    hasControlCharacter(value) ||
    ENCODED_SEPARATOR.test(value) ||
    hasDotSegment(value)
  ) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(value, 'https://legacy-path.invalid');
  } catch {
    return null;
  }
  if (url.origin !== 'https://legacy-path.invalid' || url.pathname === '/') return null;

  const encodedPathname = upperCasePercentEscapes(url.pathname);
  const pathname = encodedPathname.endsWith('/') ? encodedPathname : `${encodedPathname}/`;
  return pathname.length <= MAX_PATH_LENGTH ? pathname : null;
}

function canonicalDestinationPath(pathname: string): string | null {
  if (ENCODED_SEPARATOR.test(pathname) || hasDotSegment(pathname)) return null;
  if (pathname === '/') return '/';
  return canonicalLegacyRequestPath(pathname);
}

/**
 * Revalidates the API result at the last hop before emitting a Location header.
 * This keeps a malformed row from becoming an open redirect or redirect loop.
 */
export function validateLegacyRedirect(
  resolution: LegacyRedirectResolution,
  sourcePath: string,
  requestUrl: URL,
): ValidatedLegacyRedirect | null {
  const { destination, statusCode } = resolution;
  if (
    canonicalLegacyRequestPath(sourcePath) !== sourcePath ||
    !REDIRECT_STATUS_CODES.has(statusCode) ||
    !destination ||
    destination !== destination.trim() ||
    destination.length > MAX_PATH_LENGTH ||
    destination.includes('\\') ||
    destination.includes('#') ||
    hasControlCharacter(destination)
  ) {
    return null;
  }

  if (destination.startsWith('/')) {
    if (destination.startsWith('//')) return null;

    let target: URL;
    try {
      target = new URL(destination, 'https://redirect-target.invalid');
    } catch {
      return null;
    }
    if (target.origin !== 'https://redirect-target.invalid') return null;

    const targetPath = canonicalDestinationPath(target.pathname);
    if (!targetPath || targetPath === sourcePath) return null;

    // Keep the Location relative. That avoids trusting a forwarded Host header,
    // and intentionally drops the visitor's incoming query parameters. A query
    // explicitly reviewed in the stored destination remains intact.
    return {
      destination,
      statusCode,
      location: `${upperCasePercentEscapes(target.pathname)}${target.search}`,
    };
  }

  let target: URL;
  try {
    target = new URL(destination);
  } catch {
    return null;
  }
  if (
    target.protocol !== 'https:' ||
    target.username ||
    target.password ||
    target.hash ||
    !canonicalDestinationPath(target.pathname)
  ) {
    return null;
  }

  if (
    target.origin === requestUrl.origin &&
    canonicalDestinationPath(target.pathname) === sourcePath
  ) {
    return null;
  }

  return { destination, statusCode, location: target.toString() };
}

export function legacyRedirectResponse(
  resolution: LegacyRedirectResolution,
  sourcePath: string,
  requestUrl: URL,
): Response | null {
  const redirect = validateLegacyRedirect(resolution, sourcePath, requestUrl);
  if (!redirect) return null;

  return new Response(null, {
    status: redirect.statusCode,
    headers: {
      'Cache-Control': 'public, max-age=60',
      Location: redirect.location,
    },
  });
}
