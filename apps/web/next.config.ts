import type { NextConfig } from 'next';
import path from 'node:path';

const isFinalPublicOrigin =
  process.env.PUBLIC_WEB_URL?.trim().replace(/\/$/, '') === 'https://mukhtalif.net';

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
