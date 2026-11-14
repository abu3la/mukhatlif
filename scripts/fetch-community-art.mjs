/**
 * Copies the published community logos and programme covers into the web app,
 * so pages never hotlink YouTube's signed, expiring image URLs.
 *
 *   node scripts/fetch-community-art.mjs
 *
 * Sources are the channels and playlists listed in
 * apps/web/src/lib/communities.ts (brief of 9 November 2026, sections 23-24).
 * Existing files are kept; delete one to fetch it again.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../apps/web/public/communities/', import.meta.url).href);
mkdirSync(`${root}programmes`, { recursive: true });

const logos = {
  idhaa:
    'https://yt3.googleusercontent.com/73c3-iw_Lubnz8tI6uxN17s1p8kOvwwsF5tatPe3JYAw_SRKeJfjprdH2wxHGPz3UHBM9NDxzs0=s400-c-k-c0x00ffffff-no-rj',
  tayyar:
    'https://yt3.googleusercontent.com/8bVwL9STy24QNjnaZwcT_1fUo_4LJaUmMwhPNsAe2trKSkxcntmfSKiTGGkr9GE9Y9TD7EV4=s400-c-k-c0x00ffffff-no-rj',
  jinai:
    'https://yt3.googleusercontent.com/x4R2x2enLLk8W_Jx1YuU7AWQEP5unvGbLzwSka0ZgKDay41cY5tOWLwb13cW4MV8J3Mzd0iVGQ=s400-c-k-c0x00ffffff-no-rj',
  riyadi:
    'https://yt3.googleusercontent.com/uXLpJdO2pbekLQAR1xYeMUustG5tga5zYi8dRisi246-7S79eb3AkHFHsCyikYnB7Of6fljitg=s400-c-k-c0x00ffffff-no-rj',
  nafsi:
    'https://yt3.googleusercontent.com/8boeRudThX59sctOUrWkHgJ3j81iTXnP6wkTLiY2rdVhs4qWi3uxMh2F4-fPqoqvqq1tCEnRrg=s400-c-k-c0x00ffffff-no-rj',
  tarbawi:
    'https://yt3.googleusercontent.com/Kk7JGpwz_v-uOncrtF9G-Gyd5IfqVQkecr-LkvULagioKbUHVIMNxBkou6g7UL__ApInRSYMjr4=s400-c-k-c0x00ffffff-no-rj',
  thakali:
    'https://yt3.googleusercontent.com/tIpGBsUTThJ0NgFytTk-IGxOjxvc4umEDh1EkoVSo8NpzBLCJJsrfB-0X1WSc8nJaRAVt9bw=s400-c-k-c0x00ffffff-no-rj',
  comedian:
    'https://yt3.googleusercontent.com/gXv2KKDg7S0XviAfMHkK4VESPfmwmzj9sSKLTTzAdW0zXdSIcNNk9fY_YgP8QKS3tziccaHtvC0=s400-c-k-c0x00ffffff-no-rj',
  mohandis:
    'https://yt3.googleusercontent.com/xnVHDJc5GpD-qt5klUoUYHMXFVupTkKX9EhXfBnn8dj6bC3JBg_FpIhiHrBE1t44EI2Twk4tmg=s400-c-k-c0x00ffffff-no-rj',
};

const playlists = {
  shaqla: 'PLRJcweuRKcSOGR6AbTzkKxZB1bnMjCJi_',
  petroly: 'PLRJcweuRKcSNLQvq3g1guO92LVLyXxUOM',
  munagasha: 'PLRJcweuRKcSMPK7Ray3zelvGq5dQREqXy',
  munawib: 'PLRJcweuRKcSPrhhvWuKaobWwelwW7lrlk',
  gilaf: 'PLRJcweuRKcSMcuYa508WJvxTbsRZqy3dM',
  awalim: 'PLRJcweuRKcSOQYEV2egy6v10_hIIUjGhV',
  bokra: 'PLRJcweuRKcSOuv_Ob6yzTRacNBH3bAKpf',
  arwiqah: 'PLRJcweuRKcSPmQ8udaH-uCaQL1IC2rhfq',
  seera: 'PLRJcweuRKcSMsTbkcLfLu1539YRB5kUR-',
  amyal: 'PL-28-P9s2PZc4QiX00CZ6kzoKOmJNWVc8',
  qatim: 'PLtjzb52dT4MIjlosk7s9yn1vNPBd8czZn',
  qadiyah: 'PLtjzb52dT4MJjlIES9HMoj9L-qxidAger',
  tashreeh: 'PLWS3NI6KVLHk',
  nitaq: 'PLd33IutakM4A',
  khuzama: 'PLCny2dQQYdDg',
  wakala: 'PLT7JvkOHJK_MzrOFcw6lXKGYvo9lTvbxg',
  deal: 'PLT7JvkOHJK_Ofttt-To72hzv937u6UqHu',
  menu: 'PLBVu9Ks3sVNE',
  fintech525: 'PLQdipFk8Q11A',
  unicorn: 'PLT7JvkOHJK_P8tL4xLPYzrs6P2mkulwQG',
  anfus: 'PLGJmko3NLK9E',
  'majlis-raim': 'PLAbtAhwczLSQ',
  'mafi-shay-yidahhik': 'PLlY6ueCModR8lLS_zlIEqIX51jvybg2Ag',
  muqawil: 'PLdL61_6LWcfA',
  dynamica: 'PLCw5OYAnbZ9wOI9sL24kTrBPEhvnjXUr6',
  salasil: 'PLCw5OYAnbZ9xW1AU-bWP8q38Ii8oaT8F1',
  handas: 'PLCw5OYAnbZ9xPoYTyaSDYh9yFNQWf7aFQ',
};

async function save(path, url) {
  if (existsSync(path)) return 'kept';
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) {
    throw new Error(`${url} answered ${response.status}`);
  }
  writeFileSync(path, Buffer.from(await response.arrayBuffer()));
  return 'saved';
}

/** The playlist page names its current square cover in og:image (signed, short-lived). */
async function coverUrl(list) {
  const html = await (
    await fetch(`https://www.youtube.com/playlist?list=${list}`, {
      signal: AbortSignal.timeout(30000),
    })
  ).text();
  const urls = [...html.matchAll(/<meta property="og:image" content="([^"]+)"/g)].map((m) =>
    m[1].replaceAll('&amp;', '&'),
  );
  // Prefer the 480px rendition, then the largest offered.
  return urls.find((url) => url.includes('CICADEOAD')) ?? urls.at(-1);
}

for (const [slug, url] of Object.entries(logos)) {
  console.log(slug, await save(`${root}${slug}.jpg`, url));
}
for (const [slug, list] of Object.entries(playlists)) {
  const path = `${root}programmes/${slug}.jpg`;
  if (existsSync(path)) {
    console.log(slug, 'kept');
    continue;
  }
  const url = await coverUrl(list);
  if (!url) throw new Error(`no cover published for ${slug}`);
  console.log(slug, await save(path, url));
}
