/** Canonical IDs only: arbitrary URLs must never reach an iframe or image src. */
export function isYouTubeVideoId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{11}$/.test(value);
}

export function parseYouTubeVideoId(value: string): string | null {
  const input = value.trim();
  if (isYouTubeVideoId(input)) return input;
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    let id: string | null = null;
    if (host === 'youtu.be' && /^\/[A-Za-z0-9_-]{11}\/?$/.test(url.pathname))
      id = url.pathname.split('/')[1] ?? null;
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(host)) {
      if (url.pathname === '/watch') id = url.searchParams.get('v');
      else if (/^\/(?:embed|live)\/[A-Za-z0-9_-]{11}\/?$/.test(url.pathname))
        id = url.pathname.split('/')[2] ?? null;
    }
    return isYouTubeVideoId(id) ? id : null;
  } catch {
    return null;
  }
}

export function youtubeThumbnailUrl(id: unknown): string | null {
  return isYouTubeVideoId(id) ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}
