import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { checksumObject, sha256 } from '../../wordpress-import/src/hash.ts';
import { parsePodcastRss } from '../../wordpress-import/src/rss.ts';
import { extractStartTags, firstElement, firstText } from '../../wordpress-import/src/xml.ts';

export const RSS_IMPORT_MANIFEST_VERSION = 1 as const;

export interface RssEpisodeManifest {
  id: string;
  guid: string;
  title: string;
  description: string;
  link: string | null;
  enclosure: {
    url: string | null;
    mimeType: string | null;
    lengthBytes: number | null;
  };
  durationSec: number;
  publishedAt: string | null;
  artworkUrl: string | null;
  episodeType: 'full' | 'trailer' | 'bonus';
  episodeNumber: number;
  sourceChecksumSha256: string;
}

export interface RssShowManifest {
  id: string;
  slug: string;
  title: string;
  description: string;
  artworkUrl: string | null;
  rssUrl: string;
  siteUrl: string | null;
  author: string | null;
  language: string | null;
  categories: string[];
  lastBuildAt: string | null;
  source: {
    id: string;
    kind: 'podcast_rss';
    file: string;
    url: string;
    sourceChecksumSha256: string;
    manifestChecksumSha256: string;
  };
  episodes: RssEpisodeManifest[];
}

export interface RssImportManifest {
  schemaVersion: typeof RSS_IMPORT_MANIFEST_VERSION;
  sourceKind: 'podcast_rss';
  snapshot: string;
  shows: RssShowManifest[];
  manifestChecksumSha256: string;
}

const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  hellip: '…',
  laquo: '«',
  ldquo: '“',
  lsquo: '‘',
  lt: '<',
  mdash: '—',
  nbsp: ' ',
  ndash: '–',
  quot: '"',
  raquo: '»',
  rdquo: '”',
  rsquo: '’',
};

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z][\da-z]+);/gi, (entity, body: string) => {
    if (body[0] === '#') {
      const hexadecimal = body[1]?.toLowerCase() === 'x';
      const numeric = Number.parseInt(body.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      if (!Number.isSafeInteger(numeric) || numeric < 0 || numeric > 0x10ffff) return entity;
      try {
        return String.fromCodePoint(numeric);
      } catch {
        return entity;
      }
    }
    return HTML_ENTITIES[body.toLowerCase()] ?? entity;
  });
}

/**
 * Episode notes are plain text in the current domain model. RSS publisher HTML
 * is therefore reduced to readable paragraphs instead of being trusted as UI.
 */
export function htmlToPlainText(input: string): string {
  const decoded = decodeHtmlEntities(
    input
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|template|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/\s*(p|div|section|article|h[1-6]|blockquote|ul|ol)\s*>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '• ')
      .replace(/<\/\s*li\s*>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  );
  const withoutControls = [...decoded]
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
    })
    .join('');
  return withoutControls
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function httpUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function isoDate(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function episodeType(value: string | null): 'full' | 'trailer' | 'bonus' {
  return value === 'trailer' || value === 'bonus' ? value : 'full';
}

export function deterministicEpisodeId(showSlug: string, guid: string): string {
  return `ep-rss-${showSlug}-${sha256(`${showSlug}\0${guid}`).slice(0, 16)}`;
}

function canonicalRssUrl(channelXml: string): string | null {
  const link = extractStartTags(channelXml, 'atom:link').find(
    (candidate) => candidate.attributes.rel === 'self',
  );
  const normalized = httpUrl(link?.attributes.href);
  return normalized?.startsWith('https://') ? normalized : null;
}

function channelCategories(channelXml: string): string[] {
  return [
    ...new Set(
      extractStartTags(channelXml, 'itunes:category')
        .map((category) => category.attributes.text?.trim())
        .filter((category): category is string => Boolean(category)),
    ),
  ];
}

export function parseRssSnapshot(options: {
  xml: string;
  slug: string;
  sourceFile: string;
  sourceChecksumSha256?: string;
}): RssShowManifest {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(options.slug)) {
    throw new Error(`${options.sourceFile}: invalid show slug ${options.slug}`);
  }
  const channel = firstElement(options.xml, 'channel');
  if (!channel) throw new Error(`${options.sourceFile}: missing RSS channel`);
  const rssUrl = canonicalRssUrl(channel.inner);
  if (!rssUrl) throw new Error(`${options.sourceFile}: missing canonical atom:link RSS URL`);
  const parsed = parsePodcastRss(options.xml, {
    showSlug: options.slug,
    source: rssUrl,
  });
  if (!parsed.title.trim()) throw new Error(`${options.sourceFile}: missing channel title`);

  const channelArtwork = httpUrl(parsed.imageUrl);
  const seenGuids = new Set<string>();
  const parsedEpisodes = parsed.episodes.map((episode, index) => {
    if (!episode.legacyGuid || episode.legacyGuid === `missing-guid-${index + 1}`) {
      throw new Error(`${options.sourceFile}: item ${index + 1} has no GUID`);
    }
    if (episode.legacyGuid.length > 2048) {
      throw new Error(
        `${options.sourceFile}: item ${index + 1} GUID is longer than 2048 characters`,
      );
    }
    if (seenGuids.has(episode.legacyGuid)) {
      throw new Error(`${options.sourceFile}: duplicate GUID ${episode.legacyGuid}`);
    }
    seenGuids.add(episode.legacyGuid);
    const withoutChecksum = {
      id: deterministicEpisodeId(options.slug, episode.legacyGuid),
      guid: episode.legacyGuid,
      title: htmlToPlainText(episode.title),
      description: htmlToPlainText(episode.contentHtml || episode.descriptionHtml),
      link: httpUrl(episode.link),
      enclosure: {
        url: httpUrl(episode.enclosureUrl),
        mimeType: episode.enclosureMimeType,
        lengthBytes: episode.enclosureByteSize,
      },
      durationSec: episode.durationSeconds ?? 0,
      publishedAt: episode.publishedAt,
      artworkUrl: httpUrl(episode.imageUrl) ?? channelArtwork,
      episodeType: episodeType(episode.episodeType?.toLowerCase() ?? null),
      explicitEpisodeNumber: episode.episodeNumber,
    };
    if (!withoutChecksum.title) {
      throw new Error(`${options.sourceFile}: item ${episode.legacyGuid} has no title`);
    }
    return {
      ...withoutChecksum,
      sourceChecksumSha256: checksumObject(withoutChecksum),
    };
  });

  const chronological = [...parsedEpisodes].sort((left, right) => {
    const dateOrder = (left.publishedAt ?? '').localeCompare(right.publishedAt ?? '');
    return dateOrder || left.guid.localeCompare(right.guid);
  });
  const derivedEpisodeNumber = new Map(
    chronological.map((episode, index) => [episode.guid, index + 1]),
  );
  const episodes: RssEpisodeManifest[] = parsedEpisodes
    .map(({ explicitEpisodeNumber, ...episode }) => ({
      ...episode,
      episodeNumber: explicitEpisodeNumber ?? derivedEpisodeNumber.get(episode.guid) ?? 0,
    }))
    .sort((left, right) => {
      const dateOrder = (right.publishedAt ?? '').localeCompare(left.publishedAt ?? '');
      return dateOrder || left.guid.localeCompare(right.guid);
    });

  const sourceChecksumSha256 = options.sourceChecksumSha256 ?? sha256(options.xml);
  const showWithoutManifestChecksum = {
    id: `shw-${options.slug}`,
    slug: options.slug,
    title: htmlToPlainText(parsed.title),
    description: htmlToPlainText(parsed.description),
    artworkUrl: channelArtwork,
    rssUrl,
    siteUrl: httpUrl(firstText(channel.inner, 'link')),
    author: parsed.author,
    language: parsed.language,
    categories: channelCategories(channel.inner),
    lastBuildAt: isoDate(firstText(channel.inner, 'lastBuildDate')),
    source: {
      id: `rss:${options.slug}`,
      kind: 'podcast_rss' as const,
      file: options.sourceFile,
      url: rssUrl,
      sourceChecksumSha256,
    },
    episodes,
  };
  return {
    ...showWithoutManifestChecksum,
    source: {
      ...showWithoutManifestChecksum.source,
      manifestChecksumSha256: checksumObject(showWithoutManifestChecksum),
    },
  };
}

export async function buildRssImportManifest(options: {
  rssDirectory: string;
  snapshot: string;
}): Promise<RssImportManifest> {
  const files = (await readdir(options.rssDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.xml'))
    .map((entry) => entry.name)
    .sort();
  if (files.length === 0) throw new Error(`No RSS snapshots in ${options.rssDirectory}`);

  const shows: RssShowManifest[] = [];
  for (const file of files) {
    const bytes = await readFile(path.join(options.rssDirectory, file));
    shows.push(
      parseRssSnapshot({
        xml: bytes.toString('utf8'),
        slug: path.basename(file, path.extname(file)),
        sourceFile: file,
        sourceChecksumSha256: sha256(bytes),
      }),
    );
  }
  const withoutChecksum = {
    schemaVersion: RSS_IMPORT_MANIFEST_VERSION,
    sourceKind: 'podcast_rss' as const,
    snapshot: options.snapshot,
    shows,
  };
  return {
    ...withoutChecksum,
    manifestChecksumSha256: checksumObject(withoutChecksum),
  };
}
