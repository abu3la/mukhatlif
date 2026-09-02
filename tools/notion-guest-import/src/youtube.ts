import type { YouTubeEvidence } from './core.ts';

export interface YouTubeOEmbedCacheEntry {
  videoId: string;
  status: 'ok' | 'not_found' | 'error';
  httpStatus: number | null;
  title: string | null;
  authorName: string | null;
  checkedAt: string;
}

export interface YouTubeOEmbedCache {
  schemaVersion: 1;
  entries: YouTubeOEmbedCacheEntry[];
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

export function parseYouTubeOEmbedCache(value: unknown): YouTubeOEmbedCache {
  const source = objectValue(value, 'YouTube oEmbed cache');
  if (Object.keys(source).sort().join(',') !== 'entries,schemaVersion') {
    throw new Error('YouTube oEmbed cache contains unknown fields');
  }
  if (source.schemaVersion !== 1 || !Array.isArray(source.entries)) {
    throw new Error('Unsupported YouTube oEmbed cache schema');
  }
  const entries = source.entries.map((item) => {
    const entry = objectValue(item, 'YouTube oEmbed cache entry');
    const keys = Object.keys(entry).sort().join(',');
    if (keys !== 'authorName,checkedAt,httpStatus,status,title,videoId') {
      throw new Error('YouTube oEmbed cache entry contains unknown fields');
    }
    if (
      typeof entry.videoId !== 'string' ||
      !/^[A-Za-z0-9_-]{6,32}$/.test(entry.videoId) ||
      !['ok', 'not_found', 'error'].includes(String(entry.status)) ||
      (entry.httpStatus !== null && typeof entry.httpStatus !== 'number') ||
      (entry.title !== null && typeof entry.title !== 'string') ||
      (entry.authorName !== null && typeof entry.authorName !== 'string') ||
      typeof entry.checkedAt !== 'string'
    ) {
      throw new Error('Invalid YouTube oEmbed cache entry');
    }
    if (
      (entry.status === 'ok' &&
        (entry.httpStatus !== 200 || !entry.title?.trim() || !entry.authorName?.trim())) ||
      (entry.status === 'not_found' &&
        (entry.httpStatus !== 404 || entry.title !== null || entry.authorName !== null)) ||
      (entry.status === 'error' && (entry.title !== null || entry.authorName !== null))
    ) {
      throw new Error('YouTube oEmbed cache entry status does not match its evidence fields');
    }
    return entry as unknown as YouTubeOEmbedCacheEntry;
  });
  if (new Set(entries.map((entry) => entry.videoId)).size !== entries.length) {
    throw new Error('YouTube oEmbed cache contains duplicate video IDs');
  }
  return { schemaVersion: 1, entries: entries.sort((a, b) => a.videoId.localeCompare(b.videoId)) };
}

async function fetchEntry(
  videoId: string,
  fetcher: typeof fetch,
): Promise<YouTubeOEmbedCacheEntry> {
  const checkedAt = new Date().toISOString();
  try {
    const endpoint = new URL('https://www.youtube.com/oembed');
    endpoint.searchParams.set('url', `https://www.youtube.com/watch?v=${videoId}`);
    endpoint.searchParams.set('format', 'json');
    const response = await fetcher(endpoint, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      return {
        videoId,
        status: response.status === 404 ? 'not_found' : 'error',
        httpStatus: response.status,
        title: null,
        authorName: null,
        checkedAt,
      };
    }
    const payload = objectValue(await response.json(), 'YouTube oEmbed response');
    const title = typeof payload.title === 'string' ? payload.title.trim() : '';
    const authorName = typeof payload.author_name === 'string' ? payload.author_name.trim() : '';
    if (!title || !authorName)
      throw new Error('YouTube oEmbed response is missing title or author');
    return { videoId, status: 'ok', httpStatus: 200, title, authorName, checkedAt };
  } catch {
    return {
      videoId,
      status: 'error',
      httpStatus: null,
      title: null,
      authorName: null,
      checkedAt,
    };
  }
}

export async function enrichYouTubeOEmbedCache(
  videoIds: Iterable<string>,
  existing: YouTubeOEmbedCache,
  options: { concurrency?: number; fetcher?: typeof fetch } = {},
): Promise<YouTubeOEmbedCache> {
  const requested = [...new Set(videoIds)].sort();
  const entries = new Map(existing.entries.map((entry) => [entry.videoId, entry]));
  // Retry transient failures. Successful and definitive 404 evidence remains
  // cached, so the reviewed evidence hash becomes stable once errors clear.
  const missing = requested.filter((videoId) => {
    const entry = entries.get(videoId);
    return !entry || entry.status === 'error';
  });
  const concurrency = Math.max(1, Math.min(12, options.concurrency ?? 6));
  const fetcher = options.fetcher ?? fetch;
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, missing.length) }, async () => {
      while (cursor < missing.length) {
        const index = cursor;
        cursor += 1;
        const videoId = missing[index];
        entries.set(videoId, await fetchEntry(videoId, fetcher));
      }
    }),
  );
  return {
    schemaVersion: 1,
    entries: [...entries.values()]
      .filter((entry) => requested.includes(entry.videoId))
      .sort((a, b) => a.videoId.localeCompare(b.videoId)),
  };
}

export function youtubeEvidenceMap(cache: YouTubeOEmbedCache): Map<string, YouTubeEvidence> {
  return new Map(
    cache.entries
      .filter(
        (entry): entry is YouTubeOEmbedCacheEntry & { title: string; authorName: string } =>
          entry.status === 'ok' && Boolean(entry.title) && Boolean(entry.authorName),
      )
      .map((entry) => [
        entry.videoId,
        { videoId: entry.videoId, title: entry.title, authorName: entry.authorName },
      ]),
  );
}
