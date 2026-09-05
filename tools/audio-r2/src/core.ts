import { createHash } from 'node:crypto';

export const APPROVED_CLOUDFLARE_ACCOUNT_ID = 'bb4abee6bf877ef411dc803b3be96373';
export const APPROVED_R2_BUCKET = 'mukhtalif-audio';
export const APPROVED_SUPABASE_PROJECT_REF = 'acomtixjibgkauzeltsn';
export const AUDIO_OBJECT_PREFIX = 'legacy/podcasts';

const AUDIO_MIME_EXTENSIONS = new Map([
  ['audio/mpeg', 'mp3'],
  ['audio/mp3', 'mp3'],
  ['audio/mp4', 'm4a'],
  ['audio/x-m4a', 'm4a'],
]);

export interface RssAudioEpisode {
  id: string;
  guid: string;
  title: string;
  durationSec: number | null;
  enclosure: {
    url: string;
    mimeType: string | null;
    lengthBytes: number | null;
  };
}

export interface RssAudioShow {
  id: string;
  slug: string;
  title: string;
  episodes: RssAudioEpisode[];
}

export interface RssAudioManifest {
  schemaVersion: number;
  snapshot: string;
  manifestChecksumSha256: string;
  shows: RssAudioShow[];
}

export interface DatabaseEpisode {
  id: string;
  show_id: string;
  rss_guid: string | null;
  audio_key: string | null;
  audio_url: string | null;
  source_url: string | null;
}

export type DatabasePlanState =
  | 'ready'
  | 'already-linked'
  | 'missing-database-row'
  | 'ambiguous-database-row'
  | 'studio-audio-key-preserved'
  | 'studio-audio-url-preserved'
  | 'source-provenance-conflict'
  | 'invalid-source';

export interface AudioMigrationPlanItem {
  showId: string;
  showSlug: string;
  showTitle: string;
  manifestEpisodeId: string;
  databaseEpisodeId: string | null;
  rssGuid: string;
  title: string;
  sourceUrl: string;
  sourceUrlSha256: string;
  mimeType: string;
  extension: string;
  expectedByteSize: number;
  durationSec: number | null;
  approximateBitrateKbps: number | null;
  key: string;
  databaseState: DatabasePlanState;
  databaseAudioKey: string | null;
  databaseAudioUrlMatches: boolean;
  databaseSourceUrlMatches: boolean;
}

export interface NumericDistribution {
  minimum: number;
  median: number;
  p95: number;
  maximum: number;
}

export interface AudioPlanStats {
  episodeCount: number;
  totalBytes: number;
  totalDurationSec: number;
  sizeBytes: NumericDistribution;
  durationSec: NumericDistribution;
  approximateBitrateKbps: NumericDistribution;
  formats: Array<{ mimeType: string; extension: string; count: number; bytes: number }>;
  databaseStates: Record<DatabasePlanState, number>;
  perShow: Array<{
    showId: string;
    showSlug: string;
    showTitle: string;
    episodeCount: number;
    totalBytes: number;
    totalDurationSec: number;
  }>;
  duplicateSourceUrls: Array<{ sourceUrlSha256: string; count: number; episodeIds: string[] }>;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function safeSegment(value: string, label: string): string {
  const normalized = value.trim().normalize('NFC');
  if (!/^[a-z0-9][a-z0-9_-]{0,127}$/i.test(normalized)) {
    throw new Error(`${label} is not a safe R2 key segment`);
  }
  return normalized;
}

export function canonicalAudioSource(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
    throw new Error('Audio source must be a credential-free HTTPS URL without a fragment');
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname !== 'anchor.fm' && !hostname.endsWith('.anchor.fm')) {
    throw new Error('Audio source is outside the approved anchor.fm feed origin');
  }
  return url;
}

function audioFormat(
  mimeTypeValue: string | null,
  source: URL,
): {
  mimeType: string;
  extension: string;
} {
  const mimeType = mimeTypeValue?.split(';')[0]?.trim().toLowerCase() ?? '';
  const extension = AUDIO_MIME_EXTENSIONS.get(mimeType);
  if (!extension) throw new Error(`Unsupported audio MIME type: ${mimeType || 'missing'}`);
  let decodedPath = source.pathname;
  try {
    decodedPath = decodeURIComponent(decodedPath);
  } catch {
    throw new Error('Audio source path has invalid percent encoding');
  }
  const pathExtension = decodedPath.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
  if (pathExtension && pathExtension !== extension) {
    throw new Error(`Audio MIME ${mimeType} conflicts with .${pathExtension} source path`);
  }
  return { mimeType, extension };
}

export function audioObjectKey(sourceUrl: string, extension: string): string {
  if (!/^(?:mp3|m4a)$/.test(extension)) throw new Error('Unsupported audio object extension');
  return `${AUDIO_OBJECT_PREFIX}/source/${sha256(sourceUrl)}.${extension}`;
}

function validManifest(value: unknown): asserts value is RssAudioManifest {
  if (!value || typeof value !== 'object') throw new Error('RSS manifest is not an object');
  const manifest = value as Partial<RssAudioManifest>;
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.shows)) {
    throw new Error('RSS manifest schema is unsupported');
  }
  if (!/^[a-f0-9]{64}$/.test(manifest.manifestChecksumSha256 ?? '')) {
    throw new Error('RSS manifest checksum is missing or invalid');
  }
}

export function buildAudioMigrationPlan(
  manifestValue: unknown,
  databaseEpisodes: DatabaseEpisode[],
): AudioMigrationPlanItem[] {
  validManifest(manifestValue);
  const manifest = manifestValue;
  const rowsByGuid = new Map<string, DatabaseEpisode[]>();
  for (const row of databaseEpisodes) {
    if (!row.rss_guid) continue;
    const rows = rowsByGuid.get(row.rss_guid) ?? [];
    rows.push(row);
    rowsByGuid.set(row.rss_guid, rows);
  }

  const seenGuids = new Set<string>();
  const items: AudioMigrationPlanItem[] = [];
  for (const show of manifest.shows) {
    safeSegment(show.id, 'show ID');
    safeSegment(show.slug, 'show slug');
    if (!Array.isArray(show.episodes)) throw new Error(`${show.slug}: episodes must be an array`);
    for (const episode of show.episodes) {
      if (!episode.guid?.trim()) throw new Error(`${show.slug}: episode GUID is missing`);
      if (seenGuids.has(episode.guid)) throw new Error(`Duplicate RSS GUID: ${episode.guid}`);
      seenGuids.add(episode.guid);

      let source: URL | null = null;
      let mimeType = episode.enclosure?.mimeType?.trim().toLowerCase() ?? '';
      let extension = '';
      const expectedByteSize = episode.enclosure?.lengthBytes ?? 0;
      let invalidSource = false;
      try {
        source = canonicalAudioSource(episode.enclosure?.url ?? '');
        ({ mimeType, extension } = audioFormat(episode.enclosure?.mimeType ?? null, source));
        if (!Number.isSafeInteger(expectedByteSize) || expectedByteSize <= 0) {
          throw new Error('Audio byte size is missing or invalid');
        }
      } catch {
        invalidSource = true;
      }
      const sourceUrl = source?.toString() ?? String(episode.enclosure?.url ?? '');
      const sourceUrlSha256 = sha256(sourceUrl);
      const key = extension
        ? audioObjectKey(sourceUrl, extension)
        : `${AUDIO_OBJECT_PREFIX}/rejected/${sourceUrlSha256}.bin`;

      const matches = rowsByGuid.get(episode.guid) ?? [];
      const row = matches.length === 1 ? matches[0] : null;
      const audioUrlMatches = row?.audio_url === sourceUrl;
      const sourceUrlMatches = row?.source_url === sourceUrl;
      let databaseState: DatabasePlanState;
      if (invalidSource) databaseState = 'invalid-source';
      else if (matches.length === 0) databaseState = 'missing-database-row';
      else if (matches.length > 1) databaseState = 'ambiguous-database-row';
      else if (row?.audio_key === key && audioUrlMatches && sourceUrlMatches)
        databaseState = 'already-linked';
      else if (row?.audio_key) databaseState = 'studio-audio-key-preserved';
      else if (!audioUrlMatches) databaseState = 'studio-audio-url-preserved';
      else if (!sourceUrlMatches) databaseState = 'source-provenance-conflict';
      else databaseState = 'ready';

      const durationSec =
        Number.isSafeInteger(episode.durationSec) && (episode.durationSec ?? 0) > 0
          ? episode.durationSec
          : null;
      items.push({
        showId: show.id,
        showSlug: show.slug,
        showTitle: show.title,
        manifestEpisodeId: episode.id,
        databaseEpisodeId: row?.id ?? null,
        rssGuid: episode.guid,
        title: episode.title,
        sourceUrl,
        sourceUrlSha256,
        mimeType,
        extension,
        expectedByteSize,
        durationSec,
        approximateBitrateKbps:
          durationSec === null ? null : Math.round((expectedByteSize * 8) / durationSec / 1000),
        key,
        databaseState,
        databaseAudioKey: row?.audio_key ?? null,
        databaseAudioUrlMatches: audioUrlMatches,
        databaseSourceUrlMatches: sourceUrlMatches,
      });
    }
  }
  return items;
}

function nearestRank(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.max(
    0,
    Math.min(ordered.length - 1, Math.ceil(percentile * ordered.length) - 1),
  );
  return ordered[index] ?? 0;
}

function distribution(values: number[]): NumericDistribution {
  return {
    minimum: nearestRank(values, 0),
    median: nearestRank(values, 0.5),
    p95: nearestRank(values, 0.95),
    maximum: nearestRank(values, 1),
  };
}

export function summarizeAudioPlan(items: AudioMigrationPlanItem[]): AudioPlanStats {
  const databaseStates: Record<DatabasePlanState, number> = {
    ready: 0,
    'already-linked': 0,
    'missing-database-row': 0,
    'ambiguous-database-row': 0,
    'studio-audio-key-preserved': 0,
    'studio-audio-url-preserved': 0,
    'source-provenance-conflict': 0,
    'invalid-source': 0,
  };
  const formats = new Map<
    string,
    { mimeType: string; extension: string; count: number; bytes: number }
  >();
  const shows = new Map<string, AudioPlanStats['perShow'][number]>();
  const sourceGroups = new Map<string, AudioMigrationPlanItem[]>();
  for (const item of items) {
    databaseStates[item.databaseState] += 1;
    const formatKey = `${item.mimeType}\0${item.extension}`;
    const format = formats.get(formatKey) ?? {
      mimeType: item.mimeType,
      extension: item.extension,
      count: 0,
      bytes: 0,
    };
    format.count += 1;
    format.bytes += item.expectedByteSize;
    formats.set(formatKey, format);
    const show = shows.get(item.showId) ?? {
      showId: item.showId,
      showSlug: item.showSlug,
      showTitle: item.showTitle,
      episodeCount: 0,
      totalBytes: 0,
      totalDurationSec: 0,
    };
    show.episodeCount += 1;
    show.totalBytes += item.expectedByteSize;
    show.totalDurationSec += item.durationSec ?? 0;
    shows.set(item.showId, show);
    const sourceItems = sourceGroups.get(item.sourceUrlSha256) ?? [];
    sourceItems.push(item);
    sourceGroups.set(item.sourceUrlSha256, sourceItems);
  }
  const sizes = items.map((item) => item.expectedByteSize).filter((value) => value > 0);
  const durations = items
    .map((item) => item.durationSec)
    .filter((value): value is number => value !== null);
  const bitrates = items
    .map((item) => item.approximateBitrateKbps)
    .filter((value): value is number => value !== null);
  return {
    episodeCount: items.length,
    totalBytes: sizes.reduce((total, value) => total + value, 0),
    totalDurationSec: durations.reduce((total, value) => total + value, 0),
    sizeBytes: distribution(sizes),
    durationSec: distribution(durations),
    approximateBitrateKbps: distribution(bitrates),
    formats: [...formats.values()].sort((left, right) => right.count - left.count),
    databaseStates,
    perShow: [...shows.values()].sort((left, right) => right.totalBytes - left.totalBytes),
    duplicateSourceUrls: [...sourceGroups.entries()]
      .filter(([, group]) => group.length > 1)
      .map(([sourceUrlSha256, group]) => ({
        sourceUrlSha256,
        count: group.length,
        episodeIds: group.map((item) => item.manifestEpisodeId).sort(),
      }))
      .sort((left, right) => right.count - left.count),
  };
}
