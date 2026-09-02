import { checksumObject } from './hash.ts';
import type { PodcastEpisodeManifest, PodcastFeedManifest } from './types.ts';
import { extractElements, extractStartTags, firstElement, firstText } from './xml.ts';

function blankToNull(value: string): string | null {
  return value.trim() ? value : null;
}

function integer(value: string): number | null {
  const normalized = value.trim();
  return /^\d+$/.test(normalized) ? Number.parseInt(normalized, 10) : null;
}

function date(value: string): string | null {
  if (!value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
}

export function podcastDurationSeconds(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) return null;
  if (/^\d+$/.test(normalized)) return Number.parseInt(normalized, 10);
  const segments = normalized.split(':');
  if (segments.length < 2 || segments.length > 3 || segments.some((part) => !/^\d+$/.test(part))) {
    return null;
  }
  const values = segments.map((part) => Number.parseInt(part, 10));
  if (values.slice(1).some((part) => part > 59)) return null;
  return values.reduce((total, part) => total * 60 + part, 0);
}

function imageUrl(xml: string): string | null {
  return blankToNull(extractStartTags(xml, 'itunes:image')[0]?.attributes.href ?? '');
}

function parseEpisode(itemXml: string, index: number): PodcastEpisodeManifest {
  const enclosure = extractStartTags(itemXml, 'enclosure')[0];
  const guid =
    firstText(itemXml, 'guid') || firstText(itemXml, 'link') || `missing-guid-${index + 1}`;
  const withoutChecksum = {
    legacyGuid: guid,
    title: firstText(itemXml, 'title'),
    descriptionHtml: firstText(itemXml, 'description'),
    contentHtml: firstText(itemXml, 'content:encoded'),
    link: blankToNull(firstText(itemXml, 'link')),
    publishedAt: date(firstText(itemXml, 'pubDate')),
    enclosureUrl: blankToNull(enclosure?.attributes.url ?? ''),
    enclosureMimeType: blankToNull(enclosure?.attributes.type ?? ''),
    enclosureByteSize: integer(enclosure?.attributes.length ?? ''),
    durationSeconds: podcastDurationSeconds(firstText(itemXml, 'itunes:duration')),
    episodeNumber: integer(firstText(itemXml, 'itunes:episode')),
    seasonNumber: integer(firstText(itemXml, 'itunes:season')),
    episodeType: blankToNull(firstText(itemXml, 'itunes:episodeType')),
    imageUrl: imageUrl(itemXml),
    explicit: blankToNull(firstText(itemXml, 'itunes:explicit')),
  };
  return { ...withoutChecksum, checksumSha256: checksumObject(withoutChecksum) };
}

export function parsePodcastRss(
  xml: string,
  options: { showSlug: string; source: string },
): PodcastFeedManifest {
  const channel = firstElement(xml, 'channel');
  if (!channel) throw new Error(`Invalid podcast RSS for ${options.showSlug}: missing channel`);
  const episodes = extractElements(channel.inner, 'item').map((item, index) =>
    parseEpisode(item.inner, index),
  );
  const withoutChecksum = {
    schemaVersion: 1 as const,
    showSlug: options.showSlug,
    source: options.source,
    title: firstText(channel.inner, 'title'),
    description: firstText(channel.inner, 'description'),
    language: blankToNull(firstText(channel.inner, 'language')),
    author: blankToNull(firstText(channel.inner, 'itunes:author')),
    imageUrl: imageUrl(channel.inner),
    episodes,
  };
  return { ...withoutChecksum, checksumSha256: checksumObject(withoutChecksum) };
}
