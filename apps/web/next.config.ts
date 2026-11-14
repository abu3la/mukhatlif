import type { NextConfig } from 'next';
import { readdirSync } from 'node:fs';
import path from 'node:path';

const isFinalPublicOrigin =
  process.env.PUBLIC_WEB_URL?.trim().replace(/\/$/, '') === 'https://mukhtalif.net';

/**
 * First path segments that belong to this app (`/articles`, `/shows` …), read
 * from the app directory so a new section is covered without editing this file.
 */
function appSegments(): string[] {
  try {
    return readdirSync(path.join(__dirname, 'src/app'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^[a-z0-9-]+$/.test(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

const config: NextConfig = {
  ...(process.env.MUKHTALIF_HOSTINGER_BUILD === '1'
    ? {
        output: 'standalone' as const,
        outputFileTracingRoot: path.resolve(__dirname, '../..'),
        // Next's server can resolve either SWC export condition at runtime.
        // Trace both layouts used by pnpm (isolated locally, hoisted on hosting).
        outputFileTracingIncludes: {
          '/*': [
            '../../node_modules/.pnpm/@swc+helpers@*/node_modules/@swc/helpers/**/*',
            '../../node_modules/@swc/helpers/**/*',
            'node_modules/@swc/helpers/**/*',
          ],
        },
      }
    : {}),
  reactStrictMode: true,
  poweredByHeader: false,
  // Next would strip every trailing slash with its own redirect before any route
  // runs, so an old WordPress link (`/petroly/`) cost two redirects. The app's
  // own paths are normalised below; every other path reaches the legacy
  // catch-all route with its slash and is answered with one redirect.
  skipTrailingSlashRedirect: true,
  async redirects() {
    const segments = appSegments();
    if (!segments.length) return [];
    return [
      {
        source: `/:segment(${segments.join('|')})/:rest*/`,
        destination: '/:segment/:rest*',
        permanent: true,
      },
    ];
  },
  async headers() {
    if (isFinalPublicOrigin) return [];

    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow, noarchive',
          },
        ],
      },
    ];
  },
};

export default config;
