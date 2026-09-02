import { Hono } from 'hono';
import type { AppEnv } from '../auth';
import { getRepository, type LegacyRedirectResolution } from '../repo';

const MAX_PATH_LENGTH = 4_096;
const ENCODED_SEPARATOR = /%(?:2f|5c)/iu;

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
  });
}

export function canonicalLegacySourcePath(value: string | undefined): string | null {
  const candidate = value?.trim();
  if (
    !candidate ||
    candidate === '/' ||
    candidate.length > MAX_PATH_LENGTH ||
    !candidate.startsWith('/') ||
    candidate.startsWith('//') ||
    candidate.includes('?') ||
    candidate.includes('#') ||
    candidate.includes('\\') ||
    hasControlCharacter(candidate) ||
    ENCODED_SEPARATOR.test(candidate)
  ) {
    return null;
  }

  let url: URL;
  const segments = candidate.split('/');
  try {
    if (segments.some((segment) => ['.', '..'].includes(decodeURIComponent(segment)))) {
      return null;
    }
  } catch {
    return null;
  }
  try {
    url = new URL(candidate, 'https://legacy-path.invalid');
  } catch {
    return null;
  }
  if (url.origin !== 'https://legacy-path.invalid' || url.pathname === '/') return null;
  const encodedPathname = url.pathname.replace(/%[0-9a-f]{2}/giu, (token) => token.toUpperCase());
  const pathname = encodedPathname.endsWith('/') ? encodedPathname : `${encodedPathname}/`;
  return pathname.length <= MAX_PATH_LENGTH ? pathname : null;
}

function safeResolution(
  resolution: LegacyRedirectResolution | null,
  sourcePath: string,
): LegacyRedirectResolution | null {
  if (!resolution) return null;
  const { destination, statusCode } = resolution;
  if (![301, 302, 307, 308].includes(statusCode) || destination.length > MAX_PATH_LENGTH) {
    return null;
  }
  if (destination.startsWith('/')) {
    if (
      destination.startsWith('//') ||
      destination.includes('\\') ||
      destination.includes('#') ||
      hasControlCharacter(destination)
    ) {
      return null;
    }
    const destinationPath = new URL(destination, 'https://redirect-target.invalid').pathname;
    if (canonicalLegacySourcePath(destinationPath) === sourcePath) return null;
    return resolution;
  }
  try {
    const url = new URL(destination);
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash
      ? resolution
      : null;
  } catch {
    return null;
  }
}

export const publicRedirectsRoute = new Hono<AppEnv>().get('/resolve', async (c) => {
  const sourcePath = canonicalLegacySourcePath(c.req.query('path'));
  if (!sourcePath) return c.json({ error: 'Not found' }, 404);
  const resolution = safeResolution(
    await getRepository(c.env).resolveLegacyRedirect(sourcePath),
    sourcePath,
  );
  if (!resolution) {
    return c.json({ error: 'Not found' }, 404);
  }
  c.header('Cache-Control', 'public, max-age=60');
  return c.json(resolution);
});
