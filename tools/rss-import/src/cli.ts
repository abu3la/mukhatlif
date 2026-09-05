import { readFileSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checksumObject } from '../../wordpress-import/src/hash.ts';
import {
  buildRssImportManifest,
  type RssEpisodeManifest,
  type RssImportManifest,
  type RssShowManifest,
} from './core.ts';
import { mergeImportedRow } from './import-plan.ts';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DEFAULT_BACKUP_DIRECTORY = path.resolve(
  REPOSITORY_ROOT,
  '../../backups/wordpress/2026-09-02',
);
const IMPORTER_VERSION = 1;
const BATCH_SIZE = 100;

const SHOW_SELECT = [
  'id',
  'slug',
  'title_ar',
  'description_ar',
  'host_name',
  'category',
  'premium',
  'status',
  'artwork_url',
  'rss_url',
  'created_at',
].join(',');
const EPISODE_SELECT = [
  'id',
  'show_id',
  'title_ar',
  'show_notes_ar',
  'audio_url',
  'duration_sec',
  'episode_number',
  'premium',
  'status',
  'publish_at',
  'rss_guid',
  'legacy_url',
  'source_url',
  'artwork_url',
  'created_at',
].join(',');

interface CliOptions {
  apply: boolean;
  offline: boolean;
  help: boolean;
  rssDirectory: string;
  manifestPath: string;
  reportPath: string;
  snapshot: string;
}

type DatabaseRow = Record<string, unknown> & { id: string };

interface ImportRecordRow {
  source_id: string;
  entity_type: string;
  legacy_key: string;
  target_id: string | null;
  source_checksum_sha256: string;
  metadata: Record<string, unknown>;
}

interface Counts {
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
}

interface ImportError {
  sourceId: string;
  legacyKey: string;
  message: string;
}

export interface ImportReport {
  schemaVersion: 1;
  generatedAt: string;
  mode: 'dry-run' | 'apply';
  manifestChecksumSha256: string;
  shows: Counts;
  episodes: Counts;
  warnings: string[];
  errors: ImportError[];
}

const USAGE = `Usage:
  pnpm import:rss [--offline] [--apply] [options]

Options:
  --rss-dir PATH    RSS snapshot directory
  --manifest PATH   Deterministic JSON manifest output
  --report PATH     Dry-run/apply report output
  --snapshot LABEL  Snapshot label stored in the manifest
  --offline         Build the manifest without connecting to Supabase
  --apply           Explicitly write the reviewed reconciliation to Supabase
  --help            Show this help

The default database mode is a read-only dry run. No writes occur without
--apply. Credentials are loaded from the repository .env.local and never shown.
`;

function argumentValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseArguments(args: string[]): CliOptions {
  const result: CliOptions = {
    apply: false,
    offline: false,
    help: false,
    rssDirectory: path.join(DEFAULT_BACKUP_DIRECTORY, 'rss'),
    manifestPath: path.join(DEFAULT_BACKUP_DIRECTORY, 'rss-manifest.json'),
    reportPath: path.join(DEFAULT_BACKUP_DIRECTORY, 'rss-import-report.json'),
    snapshot: '2026-09-02',
  };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--') continue;
    if (flag === '--apply') result.apply = true;
    else if (flag === '--offline') result.offline = true;
    else if (flag === '--help' || flag === '-h') result.help = true;
    else if (flag === '--rss-dir')
      result.rssDirectory = path.resolve(argumentValue(args, index++, flag));
    else if (flag === '--manifest')
      result.manifestPath = path.resolve(argumentValue(args, index++, flag));
    else if (flag === '--report')
      result.reportPath = path.resolve(argumentValue(args, index++, flag));
    else if (flag === '--snapshot') result.snapshot = argumentValue(args, index++, flag);
    else throw new Error(`Unknown option: ${flag}`);
  }
  if (result.apply && result.offline) throw new Error('--apply and --offline cannot be combined');
  return result;
}

async function atomicJson(
  filePath: string,
  value: unknown,
): Promise<'created' | 'updated' | 'unchanged'> {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  let previous: string | null = null;
  try {
    previous = await readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (previous === serialized) return 'unchanged';
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, serialized, { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, filePath);
  return previous === null ? 'created' : 'updated';
}

function loadCredentials(): { url: string; serviceRoleKey: string } {
  const envPath = path.join(REPOSITORY_ROOT, '.env.local');
  if (typeof process.loadEnvFile === 'function') {
    try {
      process.loadEnvFile(envPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  } else {
    try {
      for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
        const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (!match || process.env[match[1]] !== undefined) continue;
        const raw = match[2];
        const value =
          (raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))
            ? raw.slice(1, -1)
            : raw;
        process.env[match[1]] = value;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env.local');
  }
  const parsed = new URL(url);
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('SUPABASE_URL must be a credential-free HTTP(S) origin');
  }
  return { url: parsed.toString(), serviceRoleKey };
}

class SupabaseRestClient {
  readonly #origin: URL;
  readonly #serviceRoleKey: string;

  constructor(origin: string, serviceRoleKey: string) {
    this.#origin = new URL(origin);
    this.#serviceRoleKey = serviceRoleKey;
  }

  async #request<Row>(
    table: string,
    options: {
      method?: 'GET' | 'POST';
      query?: Record<string, string>;
      body?: unknown;
      prefer?: string;
    } = {},
  ): Promise<Row> {
    const url = new URL(`/rest/v1/${table}`, this.#origin);
    for (const [name, value] of Object.entries(options.query ?? {})) {
      url.searchParams.set(name, value);
    }
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        apikey: this.#serviceRoleKey,
        authorization: `Bearer ${this.#serviceRoleKey}`,
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(options.prefer ? { prefer: options.prefer } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        const body = (await response.json()) as { message?: string; code?: string };
        message += body.message ? ` ${body.message}` : '';
        message += body.code ? ` (${body.code})` : '';
      } catch {
        // Status alone is safe and sufficient if PostgREST did not return JSON.
      }
      throw new Error(`${table}: ${message}`);
    }
    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return undefined as Row;
    }
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as Row;
  }

  select<Row>(
    table: string,
    columns: string,
    filters: Record<string, string> = {},
  ): Promise<Row[]> {
    return this.#request<Row[]>(table, {
      query: { select: columns, ...filters },
    });
  }

  async upsert(table: string, rows: Record<string, unknown>[], onConflict: string): Promise<void> {
    if (rows.length === 0) return;
    await this.#request(table, {
      method: 'POST',
      query: { on_conflict: onConflict },
      body: rows,
      prefer: 'resolution=merge-duplicates,return=minimal',
    });
  }
}

function chunks<T>(values: T[], size = BATCH_SIZE): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function postgrestTextIn(values: string[]): string {
  const quoted = values.map(
    (value) => `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`,
  );
  return `in.(${quoted.join(',')})`;
}

async function validateSchema(db: SupabaseRestClient): Promise<void> {
  try {
    await Promise.all([
      db.select('shows', SHOW_SELECT, { limit: '1' }),
      db.select('episodes', EPISODE_SELECT, { limit: '1' }),
      db.select(
        'legacy_import_sources',
        'id,source_kind,source_url,source_checksum_sha256,manifest_checksum_sha256,last_seen_at',
        { limit: '1' },
      ),
      db.select(
        'legacy_import_records',
        'source_id,entity_type,legacy_key,target_id,source_checksum_sha256,import_status,metadata,imported_at,last_seen_at',
        { limit: '1' },
      ),
    ]);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown schema error';
    throw new Error(
      `RSS import schema is not ready; apply reviewed migration 0016 first. ${reason}`,
    );
  }
}

function blankCounts(): Counts {
  return { inserted: 0, updated: 0, skipped: 0, errors: 0 };
}

function blankReport(manifest: RssImportManifest, apply: boolean): ImportReport {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode: apply ? 'apply' : 'dry-run',
    manifestChecksumSha256: manifest.manifestChecksumSha256,
    shows: blankCounts(),
    episodes: blankCounts(),
    warnings: [],
    errors: [],
  };
}

function increment(counts: Counts, action: 'inserted' | 'updated' | 'skipped' | 'errors'): void {
  counts[action] += 1;
}

function previousImportedValues(
  record: ImportRecordRow | undefined,
): Record<string, unknown> | null {
  const value = record?.metadata.importedValues;
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function importedValues(row: DatabaseRow): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([field]) => field !== 'id'));
}

function metadata(
  entity: RssShowManifest | RssEpisodeManifest,
  incoming: DatabaseRow,
  preservedFields: string[],
): Record<string, unknown> {
  return {
    importer: 'mukhtalif-podcast-rss',
    importerVersion: IMPORTER_VERSION,
    importedValues: importedValues(incoming),
    preservedStudioFields: preservedFields,
    ...('episodeType' in entity
      ? {
          episodeType: entity.episodeType,
          enclosure: {
            lengthBytes: entity.enclosure.lengthBytes,
            mimeType: entity.enclosure.mimeType,
          },
        }
      : {}),
  };
}

function showRow(show: RssShowManifest): DatabaseRow {
  return {
    id: show.id,
    slug: show.slug,
    title_ar: show.title,
    description_ar: show.description,
    host_name: 'فريق مختلف',
    category: show.categories.at(-1) ?? 'بودكاست',
    premium: false,
    status: 'published',
    artwork_url: show.artworkUrl,
    rss_url: show.rssUrl,
  };
}

export function episodeRow(showId: string, episode: RssEpisodeManifest): DatabaseRow {
  return {
    id: episode.id,
    show_id: showId,
    title_ar: episode.title,
    show_notes_ar: episode.description,
    audio_url: episode.enclosure.url,
    duration_sec: episode.durationSec,
    episode_number: episode.episodeNumber,
    premium: false,
    status: 'published',
    publish_at: episode.publishedAt,
    rss_guid: episode.guid,
    legacy_url: episode.link,
    source_url: episode.enclosure.url,
    artwork_url: episode.artworkUrl,
    created_at: episode.publishedAt ?? new Date(0).toISOString(),
  };
}

async function readImportRecords(
  db: SupabaseRestClient,
  sourceId: string,
): Promise<Map<string, ImportRecordRow>> {
  const records = await db.select<ImportRecordRow>(
    'legacy_import_records',
    'source_id,entity_type,legacy_key,target_id,source_checksum_sha256,metadata',
    { source_id: `eq.${sourceId}` },
  );
  return new Map(records.map((record) => [`${record.entity_type}:${record.legacy_key}`, record]));
}

async function readEpisodes(
  db: SupabaseRestClient,
  showId: string,
  episodes: RssEpisodeManifest[],
): Promise<DatabaseRow[]> {
  const rows = await db.select<DatabaseRow>('episodes', EPISODE_SELECT, {
    show_id: `eq.${showId}`,
  });
  const seen = new Set(rows.map((row) => row.id));
  for (const batch of chunks(episodes.map((episode) => episode.guid))) {
    const matches = await db.select<DatabaseRow>('episodes', EPISODE_SELECT, {
      rss_guid: postgrestTextIn(batch),
    });
    for (const match of matches) {
      if (!seen.has(match.id)) rows.push(match);
      seen.add(match.id);
    }
  }
  return rows;
}

async function upsertChunks(
  db: SupabaseRestClient,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
): Promise<void> {
  for (const batch of chunks(rows)) await db.upsert(table, batch, onConflict);
}

function showRecordChecksum(show: RssShowManifest): string {
  return checksumObject({
    title: show.title,
    description: show.description,
    artworkUrl: show.artworkUrl,
    rssUrl: show.rssUrl,
    siteUrl: show.siteUrl,
    author: show.author,
    language: show.language,
    categories: show.categories,
  });
}

export async function runImport(
  db: SupabaseRestClient,
  manifest: RssImportManifest,
  options: { apply: boolean },
): Promise<ImportReport> {
  await validateSchema(db);
  const report = blankReport(manifest, options.apply);

  for (const show of manifest.shows) {
    try {
      const records = await readImportRecords(db, show.source.id);
      const storedShows = await db.select<DatabaseRow>('shows', SHOW_SELECT, {
        slug: `eq.${show.slug}`,
        limit: '1',
      });
      if (storedShows.length === 0) {
        storedShows.push(
          ...(await db.select<DatabaseRow>('shows', SHOW_SELECT, {
            id: `eq.${show.id}`,
            limit: '1',
          })),
        );
      }
      const currentShow = storedShows[0] ?? null;
      if (currentShow && currentShow.slug !== show.slug) {
        throw new Error(
          `deterministic show ID ${show.id} is already assigned to slug ${String(currentShow.slug)}`,
        );
      }
      const currentShowRecord = records.get(`show:${show.slug}`);
      const incomingShow = showRow(show);
      incomingShow.id = currentShow?.id ?? incomingShow.id;
      const mergedShow = mergeImportedRow(
        currentShow,
        incomingShow,
        previousImportedValues(currentShowRecord),
        new Set(['slug', 'premium', 'status', 'created_at']),
      );
      const showAction = currentShow
        ? mergedShow.changedFields.length > 0
          ? 'updated'
          : 'skipped'
        : 'inserted';
      increment(report.shows, showAction);

      const storedEpisodes = await readEpisodes(db, incomingShow.id as string, show.episodes);
      const manifestIds = new Set(show.episodes.map((episode) => episode.id));
      const manifestGuids = new Set(show.episodes.map((episode) => episode.guid));
      const unmatchedExisting = storedEpisodes.filter(
        (episode) =>
          !manifestIds.has(episode.id) &&
          (typeof episode.rss_guid !== 'string' || !manifestGuids.has(episode.rss_guid)),
      );
      if (unmatchedExisting.length > 0) {
        report.warnings.push(
          `${show.slug}: preserved ${unmatchedExisting.length} existing episode(s) not identified by this RSS snapshot`,
        );
      }
      const episodesByGuid = new Map(
        storedEpisodes
          .filter((episode) => typeof episode.rss_guid === 'string')
          .map((episode) => [episode.rss_guid as string, episode]),
      );
      const episodesById = new Map(storedEpisodes.map((episode) => [episode.id, episode]));
      const episodeWrites: DatabaseRow[] = [];
      const importRecordWrites: Record<string, unknown>[] = [];
      const importedAt = new Date().toISOString();

      for (const episode of show.episodes) {
        try {
          const currentRecord = records.get(`episode:${episode.guid}`);
          const currentEpisode =
            episodesByGuid.get(episode.guid) ?? episodesById.get(episode.id) ?? null;
          if (
            currentEpisode &&
            (currentEpisode.show_id !== incomingShow.id ||
              (typeof currentEpisode.rss_guid === 'string' &&
                currentEpisode.rss_guid !== episode.guid))
          ) {
            throw new Error(
              `GUID or deterministic ID is already linked to a different episode/show (${currentEpisode.id})`,
            );
          }
          const incomingEpisode = episodeRow(incomingShow.id as string, episode);
          incomingEpisode.id = currentEpisode?.id ?? incomingEpisode.id;
          const mergedEpisode = mergeImportedRow(
            currentEpisode,
            incomingEpisode,
            previousImportedValues(currentRecord),
            new Set(['show_id', 'rss_guid', 'premium', 'status', 'created_at']),
          );
          const action = currentEpisode
            ? mergedEpisode.changedFields.length > 0
              ? 'updated'
              : 'skipped'
            : 'inserted';
          increment(report.episodes, action);
          if (action !== 'skipped') episodeWrites.push(mergedEpisode.row);
          importRecordWrites.push({
            source_id: show.source.id,
            entity_type: 'episode',
            legacy_key: episode.guid,
            legacy_numeric_id: null,
            legacy_slug: null,
            legacy_url: episode.link,
            target_kind: 'episode',
            target_id: incomingEpisode.id,
            source_checksum_sha256: episode.sourceChecksumSha256,
            import_status: 'imported',
            metadata: metadata(episode, incomingEpisode, mergedEpisode.preservedFields),
            imported_at: importedAt,
            last_seen_at: importedAt,
          });
        } catch (error) {
          increment(report.episodes, 'errors');
          report.errors.push({
            sourceId: show.source.id,
            legacyKey: episode.guid,
            message: error instanceof Error ? error.message : 'Unknown episode import error',
          });
        }
      }

      if (options.apply) {
        await db.upsert(
          'legacy_import_sources',
          [
            {
              id: show.source.id,
              source_kind: 'podcast_rss',
              source_url: show.rssUrl,
              source_checksum_sha256: show.source.sourceChecksumSha256,
              manifest_checksum_sha256: show.source.manifestChecksumSha256,
              last_seen_at: importedAt,
            },
          ],
          'id',
        );
        if (showAction !== 'skipped') await db.upsert('shows', [mergedShow.row], 'id');
        await upsertChunks(db, 'episodes', episodeWrites, 'id');
        await upsertChunks(
          db,
          'legacy_import_records',
          [
            {
              source_id: show.source.id,
              entity_type: 'show',
              legacy_key: show.slug,
              legacy_numeric_id: null,
              legacy_slug: show.slug,
              legacy_url: show.siteUrl,
              target_kind: 'show',
              target_id: incomingShow.id,
              source_checksum_sha256: showRecordChecksum(show),
              import_status: 'imported',
              metadata: metadata(show, incomingShow, mergedShow.preservedFields),
              imported_at: importedAt,
              last_seen_at: importedAt,
            },
            ...importRecordWrites,
          ],
          'source_id,entity_type,legacy_key',
        );
      }
    } catch (error) {
      increment(report.shows, 'errors');
      report.errors.push({
        sourceId: show.source.id,
        legacyKey: show.slug,
        message: error instanceof Error ? error.message : 'Unknown show import error',
      });
    }
  }

  return report;
}

function printSummary(
  manifest: RssImportManifest,
  manifestState: 'created' | 'updated' | 'unchanged',
  report?: ImportReport,
): void {
  const episodeCount = manifest.shows.reduce((total, show) => total + show.episodes.length, 0);
  process.stdout.write(
    `Manifest ${manifestState}: ${manifest.shows.length} shows, ${episodeCount} episodes.\n`,
  );
  process.stdout.write(`Manifest checksum: ${manifest.manifestChecksumSha256}\n`);
  if (!report) return;
  process.stdout.write(`Mode: ${report.mode}\n`);
  process.stdout.write(
    `Shows: inserted=${report.shows.inserted} updated=${report.shows.updated} skipped=${report.shows.skipped} errors=${report.shows.errors}\n`,
  );
  process.stdout.write(
    `Episodes: inserted=${report.episodes.inserted} updated=${report.episodes.updated} skipped=${report.episodes.skipped} errors=${report.episodes.errors}\n`,
  );
  for (const warning of report.warnings) process.stdout.write(`Warning: ${warning}\n`);
  for (const error of report.errors) {
    process.stderr.write(`[${error.sourceId}/${error.legacyKey}] ${error.message}\n`);
  }
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(USAGE);
    return;
  }
  const manifest = await buildRssImportManifest({
    rssDirectory: options.rssDirectory,
    snapshot: options.snapshot,
  });
  const manifestState = await atomicJson(options.manifestPath, manifest);
  if (options.offline) {
    printSummary(manifest, manifestState);
    return;
  }

  const credentials = loadCredentials();
  const db = new SupabaseRestClient(credentials.url, credentials.serviceRoleKey);
  const report = await runImport(db, manifest, { apply: options.apply });
  await atomicJson(options.reportPath, report);
  printSummary(manifest, manifestState, report);
  if (report.errors.length > 0) process.exitCode = 1;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'RSS import failed'}\n`);
    process.exitCode = 1;
  });
}
