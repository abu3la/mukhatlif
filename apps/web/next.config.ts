import type { NextConfig } from 'next';

const isFinalPublicOrigin =
  process.env.PUBLIC_WEB_URL?.trim().replace(/\/$/, '') === 'https://mukhtalif.net';

const config: NextConfig = {
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
