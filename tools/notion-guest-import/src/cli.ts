import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  DEVELOPMENT_SUPABASE_PROJECT_REF,
  buildGuestImportPlan,
  parseSanitizedNotionSnapshot,
  youtubeVideoId,
  type GuestImportPlan,
  type SupabasePublishedEpisode,
} from './core.ts';
import {
  assertPlanApplied,
  auditSocialSources,
  computeApplyDelta,
  type ExistingGuestData,
  type GuestAppearanceDatabaseRow,
  type GuestDatabaseRow,
  type GuestSocialDatabaseRow,
} from './apply.ts';
import {
  enrichYouTubeOEmbedCache,
  parseYouTubeOEmbedCache,
  youtubeEvidenceMap,
  type YouTubeOEmbedCache,
} from './youtube.ts';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DEFAULT_BACKUP_DIRECTORY = path.resolve(REPOSITORY_ROOT, '../../backups/notion/2026-09-02');
const DEVELOPMENT_SUPABASE_HOSTNAME = `${DEVELOPMENT_SUPABASE_PROJECT_REF}.supabase.co`;
const DEVELOPMENT_POOLER_HOSTNAME = 'aws-0-eu-central-1.pooler.supabase.com';
const PSQL_PATH = '/opt/homebrew/opt/libpq/bin/psql';

export interface Options {
  apply: boolean;
  help: boolean;
  inputPath: string;
  planPath: string;
  reportPath: string;
  youtubeCachePath: string;
  applyReportPath: string;
  confirmProject?: string;
  confirmPlanSha256?: string;
}

const USAGE = `Usage:
  pnpm import:guests:notion:dry-run [options]
  pnpm import:guests:notion:apply --apply \\
    --confirm-project ${DEVELOPMENT_SUPABASE_PROJECT_REF} \\
    --confirm-plan-sha256 SHA256

Options:
  --input PATH                 Sanitized Notion snapshot
  --plan PATH                  Detailed reviewed plan
  --report PATH                Compact dry-run report
  --youtube-cache PATH         YouTube oEmbed evidence cache
  --apply-report PATH          Apply verification report
  --apply                      Apply the reviewed plan; never deletes or updates
  --confirm-project REF        Required exact development project confirmation
  --confirm-plan-sha256 SHA256 Required exact reviewed-plan file hash
  --help                       Show this help

Dry-run is the default. Apply is locked to the canonical development Supabase
hostname, requires both confirmations, verifies snapshot and oEmbed cache
hashes, rechecks published episode targets, and never touches production.
`;

function argumentValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseArguments(args: string[]): Options {
  const result: Options = {
    apply: false,
    help: false,
    inputPath: path.join(DEFAULT_BACKUP_DIRECTORY, 'guest-library-sanitized.json'),
    planPath: path.join(DEFAULT_BACKUP_DIRECTORY, 'guest-library-import-plan.json'),
    reportPath: path.join(DEFAULT_BACKUP_DIRECTORY, 'guest-library-dry-run-report.json'),
    youtubeCachePath: path.join(
      DEFAULT_BACKUP_DIRECTORY,
      'guest-library-youtube-oembed-cache.json',
    ),
    applyReportPath: path.join(DEFAULT_BACKUP_DIRECTORY, 'guest-library-apply-report.json'),
  };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--') continue;
    if (flag === '--help' || flag === '-h') result.help = true;
    else if (flag === '--apply') result.apply = true;
    else if (flag === '--input')
      result.inputPath = path.resolve(argumentValue(args, index++, flag));
    else if (flag === '--plan') result.planPath = path.resolve(argumentValue(args, index++, flag));
    else if (flag === '--report')
      result.reportPath = path.resolve(argumentValue(args, index++, flag));
    else if (flag === '--youtube-cache') {
      result.youtubeCachePath = path.resolve(argumentValue(args, index++, flag));
    } else if (flag === '--apply-report') {
      result.applyReportPath = path.resolve(argumentValue(args, index++, flag));
    } else if (flag === '--confirm-project') {
      result.confirmProject = argumentValue(args, index++, flag);
    } else if (flag === '--confirm-plan-sha256') {
      result.confirmPlanSha256 = argumentValue(args, index++, flag).toLowerCase();
    } else throw new Error(`Unknown option: ${flag}`);
  }
  return result;
}

function loadLocalEnvironment(): void {
  const envPath = path.join(REPOSITORY_ROOT, '.env.local');
  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile(envPath);
    return;
  }
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    const raw = match[2];
    process.env[match[1]] =
      (raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))
        ? raw.slice(1, -1)
        : raw;
  }
}

export function assertDevelopmentSupabaseOrigin(rawUrl: string): URL {
  let origin: URL;
  try {
    origin = new URL(rawUrl);
  } catch {
    throw new Error(`Importer is locked to https://${DEVELOPMENT_SUPABASE_HOSTNAME}`);
  }
  if (
    origin.protocol !== 'https:' ||
    origin.username ||
    origin.password ||
    origin.hostname.toLowerCase() !== DEVELOPMENT_SUPABASE_HOSTNAME ||
    (origin.pathname !== '/' && origin.pathname !== '') ||
    origin.search ||
    origin.hash
  ) {
    throw new Error(`Importer is locked to https://${DEVELOPMENT_SUPABASE_HOSTNAME}`);
  }
  return origin;
}

function developmentCredentials(): { origin: URL; key: string; projectRef: string } {
  loadLocalEnvironment();
  const rawUrl = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!rawUrl || !key) throw new Error('Development Supabase credentials are unavailable');
  const origin = assertDevelopmentSupabaseOrigin(rawUrl);
  return { origin, key, projectRef: DEVELOPMENT_SUPABASE_PROJECT_REF };
}

async function publishedEpisodes(origin: URL, key: string): Promise<SupabasePublishedEpisode[]> {
  const rows: SupabasePublishedEpisode[] = [];
  const select = [
    'id',
    'show_id',
    'title_ar',
    'show_notes_ar',
    'publish_at',
    'legacy_url',
    'source_url',
    'audio_url',
    'status',
  ].join(',');
  for (let offset = 0; ; offset += 1000) {
    const url = new URL('/rest/v1/episodes', origin);
    url.searchParams.set('select', select);
    url.searchParams.set('status', 'eq.published');
    url.searchParams.set('order', 'id');
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('limit', '1000');
    const response = await fetch(url, {
      method: 'GET',
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!response.ok) throw new Error(`Supabase episode read failed (${response.status})`);
    const batch = (await response.json()) as SupabasePublishedEpisode[];
    if (batch.some((episode) => episode.status !== 'published')) {
      throw new Error('Supabase returned an unpublished episode to the published-only query');
    }
    rows.push(...batch);
    if (batch.length < 1000) return rows;
  }
}

async function atomicJson(filePath: string, value: unknown): Promise<void> {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, serialized, { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, filePath);
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

function storedPlan(value: unknown): {
  core: GuestImportPlan;
  snapshotSha256: string;
  youtubeEvidenceSha256: string;
  supabaseProjectRef: string;
} {
  const source = objectValue(value, 'Plan');
  const allowedKeys = new Set([
    'schemaVersion',
    'mode',
    'source',
    'guests',
    'appearances',
    'issues',
    'counts',
    'generatedAt',
    'snapshotSha256',
    'youtubeEvidenceSha256',
    'supabaseProjectRef',
  ]);
  if (Object.keys(source).some((key) => !allowedKeys.has(key))) {
    throw new Error('Plan contains unknown fields');
  }
  if (
    source.schemaVersion !== 1 ||
    source.mode !== 'dry-run' ||
    source.source !== 'notion-guest-library' ||
    !Array.isArray(source.guests) ||
    !Array.isArray(source.appearances) ||
    !Array.isArray(source.issues) ||
    !source.counts
  ) {
    throw new Error('Plan has an unsupported or incomplete schema');
  }
  for (const field of ['snapshotSha256', 'youtubeEvidenceSha256'] as const) {
    if (typeof source[field] !== 'string' || !/^[a-f\d]{64}$/.test(source[field])) {
      throw new Error(`Plan is missing ${field}`);
    }
  }
  if (typeof source.supabaseProjectRef !== 'string') {
    throw new Error('Plan is missing its Supabase project reference');
  }
  return {
    core: {
      schemaVersion: 1,
      mode: 'dry-run',
      source: 'notion-guest-library',
      guests: source.guests,
      appearances: source.appearances,
      issues: source.issues,
      counts: source.counts,
    } as GuestImportPlan,
    snapshotSha256: source.snapshotSha256 as string,
    youtubeEvidenceSha256: source.youtubeEvidenceSha256 as string,
    supabaseProjectRef: source.supabaseProjectRef,
  };
}

async function readCache(filePath: string): Promise<YouTubeOEmbedCache> {
  try {
    return parseYouTubeOEmbedCache(JSON.parse((await readFile(filePath)).toString('utf8')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return { schemaVersion: 1, entries: [] };
    throw error;
  }
}

async function allRows<T>(
  origin: URL,
  key: string,
  table: string,
  select: string,
  order: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const url = new URL(`/rest/v1/${table}`, origin);
    url.searchParams.set('select', select);
    url.searchParams.set('order', order);
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('limit', '1000');
    const response = await fetch(url, {
      method: 'GET',
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!response.ok) throw new Error(`Supabase ${table} read failed (${response.status})`);
    const batch = (await response.json()) as T[];
    rows.push(...batch);
    if (batch.length < 1000) return rows;
  }
}

async function existingGuestData(origin: URL, key: string): Promise<ExistingGuestData> {
  const [guests, socials, appearances] = await Promise.all([
    allRows<GuestDatabaseRow>(
      origin,
      key,
      'guests',
      'id,slug,name,role,city,email,bio,photo_url',
      'id.asc',
    ),
    allRows<GuestSocialDatabaseRow>(
      origin,
      key,
      'guest_socials',
      'id,guest_id,platform,handle',
      'id.asc',
    ),
    allRows<GuestAppearanceDatabaseRow>(
      origin,
      key,
      'guest_appearances',
      'guest_id,episode_id',
      'guest_id.asc,episode_id.asc',
    ),
  ]);
  return { guests, socials, appearances };
}

interface DatabaseCredentials {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
}

function databaseCredentials(): DatabaseCredentials {
  const raw = process.env.SUPABASE_DB_URL?.trim();
  if (!raw) throw new Error('SUPABASE_DB_URL is required for transactional apply');
  const url = new URL(raw);
  const expectedUser = `postgres.${DEVELOPMENT_SUPABASE_PROJECT_REF}`;
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    url.hostname.toLowerCase() !== DEVELOPMENT_POOLER_HOSTNAME ||
    url.port !== '5432' ||
    decodeURIComponent(url.username) !== expectedUser ||
    !url.password ||
    url.pathname !== '/postgres' ||
    url.search ||
    url.hash
  ) {
    throw new Error('SUPABASE_DB_URL does not match the locked development pooler target');
  }
  return {
    host: DEVELOPMENT_POOLER_HOSTNAME,
    port: '5432',
    user: expectedUser,
    password: decodeURIComponent(url.password),
    database: 'postgres',
  };
}

function sqlText(value: string): string {
  if (value.includes('\0')) throw new Error('Plan contains a null byte that PostgreSQL rejects');
  return `'${value.replaceAll("'", "''")}'`;
}

function insertStatement(
  table: string,
  columns: string[],
  rows: Array<Record<string, string | null>>,
): string {
  if (!rows.length) return '';
  const values = rows
    .map(
      (row) =>
        `(${columns.map((column) => (row[column] === null ? 'NULL' : sqlText(row[column]!))).join(', ')})`,
    )
    .join(',\n');
  return `INSERT INTO public.${table} (${columns.join(', ')}) VALUES\n${values};`;
}

function publishedEpisodeGuard(plan: GuestImportPlan): string {
  const episodeIds = [
    ...new Set(plan.appearances.map((appearance) => appearance.episodeId)),
  ].sort();
  if (!episodeIds.length) return '';
  const expectedRows = episodeIds.map((episodeId) => `(${sqlText(episodeId)})`).join(', ');
  return `DO $mukhtalif_guest_guard$
DECLARE
  missing_count integer;
BEGIN
  SELECT count(*) INTO missing_count
  FROM (VALUES ${expectedRows}) AS expected(id)
  LEFT JOIN public.episodes AS episode
    ON episode.id = expected.id AND episode.status = 'published'
  WHERE episode.id IS NULL;
  IF missing_count <> 0 THEN
    RAISE EXCEPTION 'Guest import target episode is absent or unpublished';
  END IF;
END
$mukhtalif_guest_guard$;`;
}

function existingStateGuard(
  plan: GuestImportPlan,
  delta: ReturnType<typeof computeApplyDelta>,
): string {
  if (!plan.guests.length) return '';
  const guestIds = plan.guests.map((guest) => sqlText(guest.id)).join(', ');
  const slugs = plan.guests.map((guest) => sqlText(guest.slug)).join(', ');
  const guestValues = plan.guests
    .map(
      (guest) =>
        `(${[guest.id, guest.slug, guest.name, guest.role, guest.city, '', guest.bio]
          .map(sqlText)
          .join(', ')}, NULL::text)`,
    )
    .join(',\n');
  const socialValues = delta.socialAudit.rows
    .map(
      (social) =>
        `(${[social.id, social.guest_id, social.platform, social.handle].map(sqlText).join(', ')})`,
    )
    .join(',\n');
  const appearanceValues = plan.appearances
    .map((appearance) => `(${sqlText(appearance.guestId)}, ${sqlText(appearance.episodeId)})`)
    .join(',\n');
  const socialGuard = socialValues
    ? `IF EXISTS (
    SELECT 1 FROM public.guest_socials AS actual
    WHERE actual.guest_id IN (${guestIds})
      AND NOT EXISTS (
        SELECT 1
        FROM (VALUES ${socialValues}) AS expected(id, guest_id, platform, handle)
        WHERE actual.id = expected.id
          AND actual.guest_id = expected.guest_id
          AND actual.platform = expected.platform
          AND actual.handle = expected.handle
      )
  ) THEN
    RAISE EXCEPTION 'Unexpected existing guest social state';
  END IF;`
    : `IF EXISTS (
    SELECT 1 FROM public.guest_socials WHERE guest_id IN (${guestIds})
  ) THEN
    RAISE EXCEPTION 'Unexpected existing guest social state';
  END IF;`;
  const appearanceGuard = appearanceValues
    ? `IF EXISTS (
    SELECT 1 FROM public.guest_appearances AS actual
    WHERE actual.guest_id IN (${guestIds})
      AND NOT EXISTS (
        SELECT 1
        FROM (VALUES ${appearanceValues}) AS expected(guest_id, episode_id)
        WHERE actual.guest_id = expected.guest_id
          AND actual.episode_id = expected.episode_id
      )
  ) THEN
    RAISE EXCEPTION 'Unexpected existing guest appearance state';
  END IF;`
    : `IF EXISTS (
    SELECT 1 FROM public.guest_appearances WHERE guest_id IN (${guestIds})
  ) THEN
    RAISE EXCEPTION 'Unexpected existing guest appearance state';
  END IF;`;
  return `DO $mukhtalif_state_guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.guests AS actual
    WHERE (actual.id IN (${guestIds}) OR actual.slug IN (${slugs}))
      AND NOT EXISTS (
        SELECT 1
        FROM (VALUES ${guestValues}) AS expected(id, slug, name, role, city, email, bio, photo_url)
        WHERE actual.id = expected.id
          AND actual.slug = expected.slug
          AND actual.name = expected.name
          AND actual.role = expected.role
          AND actual.city = expected.city
          AND actual.email = expected.email
          AND actual.bio = expected.bio
          AND actual.photo_url IS NOT DISTINCT FROM expected.photo_url
      )
  ) THEN
    RAISE EXCEPTION 'Unexpected existing guest ID, slug, or field state';
  END IF;
  ${socialGuard}
  ${appearanceGuard}
END
$mukhtalif_state_guard$;`;
}

export function transactionalSql(
  plan: GuestImportPlan,
  delta: ReturnType<typeof computeApplyDelta>,
): string {
  const guestRows = delta.guests.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    role: row.role,
    city: row.city,
    email: row.email,
    bio: row.bio,
    photo_url: row.photo_url,
  }));
  const socialRows = delta.socials.map((row) => ({
    id: row.id,
    guest_id: row.guest_id,
    platform: row.platform,
    handle: row.handle,
  }));
  const appearanceRows = delta.appearances.map((row) => ({
    guest_id: row.guest_id,
    episode_id: row.episode_id,
  }));
  return [
    '\\set ON_ERROR_STOP on',
    'BEGIN;',
    "SET LOCAL lock_timeout = '10s';",
    "SET LOCAL statement_timeout = '120s';",
    'SET LOCAL standard_conforming_strings = on;',
    'LOCK TABLE public.episodes IN SHARE MODE;',
    'LOCK TABLE public.guests, public.guest_socials, public.guest_appearances IN SHARE ROW EXCLUSIVE MODE;',
    publishedEpisodeGuard(plan),
    existingStateGuard(plan, delta),
    insertStatement(
      'guests',
      ['id', 'slug', 'name', 'role', 'city', 'email', 'bio', 'photo_url'],
      guestRows,
    ),
    insertStatement('guest_socials', ['id', 'guest_id', 'platform', 'handle'], socialRows),
    insertStatement('guest_appearances', ['guest_id', 'episode_id'], appearanceRows),
    'COMMIT;',
    '',
  ]
    .filter(Boolean)
    .join('\n');
}

async function runTransactionalApply(
  plan: GuestImportPlan,
  delta: ReturnType<typeof computeApplyDelta>,
): Promise<void> {
  if (!delta.guests.length && !delta.socials.length && !delta.appearances.length) return;
  const credentials = databaseCredentials();
  const directory = await mkdtemp(path.join(tmpdir(), 'mukhtalif-guest-import-'));
  const sqlPath = path.join(directory, 'apply.sql');
  try {
    await writeFile(sqlPath, transactionalSql(plan, delta), { encoding: 'utf8', mode: 0o600 });
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        PSQL_PATH,
        ['--no-psqlrc', '--quiet', '--set', 'ON_ERROR_STOP=1', '--file', sqlPath],
        {
          stdio: ['ignore', 'ignore', 'ignore'],
          env: {
            ...process.env,
            PGHOST: credentials.host,
            PGPORT: credentials.port,
            PGUSER: credentials.user,
            PGPASSWORD: credentials.password,
            PGDATABASE: credentials.database,
            PGSSLMODE: 'require',
          },
        },
      );
      child.once('error', () => reject(new Error('Could not start the locked psql client')));
      child.once('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Transactional guest import failed (psql exit ${code ?? 'signal'})`));
      });
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export function validateOptions(options: Options): void {
  const artifactPaths = [
    options.inputPath,
    options.planPath,
    options.reportPath,
    options.youtubeCachePath,
    options.applyReportPath,
  ].map((value) => path.resolve(value));
  if (new Set(artifactPaths).size !== artifactPaths.length) {
    throw new Error('Importer input, plan, cache, and report paths must all be distinct');
  }
  if (!options.apply) {
    if (options.confirmProject || options.confirmPlanSha256) {
      throw new Error('Confirmation flags are valid only with --apply');
    }
    return;
  }
  if (options.confirmProject !== DEVELOPMENT_SUPABASE_PROJECT_REF) {
    throw new Error(`--confirm-project must equal ${DEVELOPMENT_SUPABASE_PROJECT_REF}`);
  }
  if (!options.confirmPlanSha256 || !/^[a-f\d]{64}$/.test(options.confirmPlanSha256)) {
    throw new Error('--confirm-plan-sha256 must be an exact 64-character SHA-256');
  }
}

export function verifyReviewedHashes(
  planBytes: Uint8Array,
  snapshotBytes: Uint8Array,
  youtubeCacheBytes: Uint8Array,
  expectedPlanSha256: string,
): ReturnType<typeof storedPlan> {
  const planSha256 = sha256(planBytes);
  if (planSha256 !== expectedPlanSha256) {
    throw new Error('Reviewed plan SHA-256 does not match --confirm-plan-sha256');
  }
  const stored = storedPlan(JSON.parse(Buffer.from(planBytes).toString('utf8')));
  if (sha256(snapshotBytes) !== stored.snapshotSha256) {
    throw new Error('Sanitized snapshot no longer matches the reviewed plan');
  }
  if (sha256(youtubeCacheBytes) !== stored.youtubeEvidenceSha256) {
    throw new Error('YouTube oEmbed evidence no longer matches the reviewed plan');
  }
  return stored;
}

export function assertReviewedPlanMatchesCatalogue(
  reviewed: GuestImportPlan,
  rebuilt: GuestImportPlan,
): void {
  if (JSON.stringify(reviewed) !== JSON.stringify(rebuilt)) {
    throw new Error('Reviewed plan is stale or does not match the current published catalogue');
  }
}

async function applyReviewedPlan(
  options: Options,
  credentials: { origin: URL; key: string; projectRef: string },
): Promise<void> {
  const [planBytes, sourceBytes, youtubeCacheBytes] = await Promise.all([
    readFile(options.planPath),
    readFile(options.inputPath),
    readFile(options.youtubeCachePath),
  ]);
  const planSha256 = sha256(planBytes);
  const snapshotSha256 = sha256(sourceBytes);
  const youtubeEvidenceSha256 = sha256(youtubeCacheBytes);
  const stored = verifyReviewedHashes(
    planBytes,
    sourceBytes,
    youtubeCacheBytes,
    options.confirmPlanSha256!,
  );
  if (stored.supabaseProjectRef !== credentials.projectRef) {
    throw new Error('Reviewed plan targets a different Supabase project');
  }
  const snapshot = parseSanitizedNotionSnapshot(JSON.parse(sourceBytes.toString('utf8')));
  const youtubeCache = parseYouTubeOEmbedCache(JSON.parse(youtubeCacheBytes.toString('utf8')));
  const episodes = await publishedEpisodes(credentials.origin, credentials.key);
  const rebuilt = buildGuestImportPlan(snapshot, episodes, youtubeEvidenceMap(youtubeCache));
  assertReviewedPlanMatchesCatalogue(stored.core, rebuilt);
  const publishedEpisodeIds = new Set(episodes.map((episode) => episode.id));
  if (rebuilt.appearances.some((appearance) => !publishedEpisodeIds.has(appearance.episodeId))) {
    throw new Error('Reviewed plan contains an episode that is not currently published');
  }

  const before = await existingGuestData(credentials.origin, credentials.key);
  const delta = computeApplyDelta(rebuilt, before);
  await runTransactionalApply(rebuilt, delta);
  const guestsWritten = delta.guests.length;
  const socialsWritten = delta.socials.length;
  const appearancesWritten = delta.appearances.length;
  const after = await existingGuestData(credentials.origin, credentials.key);
  assertPlanApplied(rebuilt, after);
  const afterEpisodes = await publishedEpisodes(credentials.origin, credentials.key);
  const afterPublishedEpisodeIds = new Set(afterEpisodes.map((episode) => episode.id));
  if (
    rebuilt.appearances.some((appearance) => !afterPublishedEpisodeIds.has(appearance.episodeId))
  ) {
    throw new Error('Post-apply verification found an absent or unpublished target episode');
  }

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode: 'apply',
    supabaseProjectRef: credentials.projectRef,
    planSha256,
    snapshotSha256,
    youtubeEvidenceSha256,
    planned: {
      guests: rebuilt.guests.length,
      socials: delta.plannedSocialCount,
      appearances: rebuilt.appearances.length,
      skippedUnsafeSocials: delta.skippedSocialCount,
    },
    socialAudit: delta.socialAudit,
    writes: {
      guests: guestsWritten,
      socials: socialsWritten,
      appearances: appearancesWritten,
      total: guestsWritten + socialsWritten + appearancesWritten,
    },
    verified: {
      guestIds: rebuilt.guests.length,
      socialRows: delta.plannedSocialCount,
      appearancePairs: rebuilt.appearances.length,
    },
  };
  await atomicJson(options.applyReportPath, report);
  console.log(JSON.stringify(report, null, 2));
  console.log(`Apply report: ${options.applyReportPath}`);
}

async function runDryRun(
  options: Options,
  credentials: { origin: URL; key: string; projectRef: string },
): Promise<void> {
  const sourceBytes = await readFile(options.inputPath);
  const snapshotSha256 = sha256(sourceBytes);
  const snapshot = parseSanitizedNotionSnapshot(JSON.parse(sourceBytes.toString('utf8')));
  const requestedVideoIds = snapshot.publishedEpisodes
    .map((episode) => youtubeVideoId(episode['رابط الحلقة']))
    .filter((value): value is string => Boolean(value));
  const youtubeCache = await enrichYouTubeOEmbedCache(
    requestedVideoIds,
    await readCache(options.youtubeCachePath),
  );
  await atomicJson(options.youtubeCachePath, youtubeCache);
  const youtubeCacheBytes = await readFile(options.youtubeCachePath);
  const youtubeEvidenceSha256 = sha256(youtubeCacheBytes);
  const episodes = await publishedEpisodes(credentials.origin, credentials.key);
  const plan = buildGuestImportPlan(snapshot, episodes, youtubeEvidenceMap(youtubeCache));
  const socialAudit = auditSocialSources(plan.guests);
  const existing = await existingGuestData(credentials.origin, credentials.key);
  const currentDelta = computeApplyDelta(plan, existing);
  const generatedAt = new Date().toISOString();
  const fullPlan = {
    ...plan,
    generatedAt,
    snapshotSha256,
    youtubeEvidenceSha256,
    supabaseProjectRef: credentials.projectRef,
  };
  const oEmbedCounts = {
    ok: youtubeCache.entries.filter((entry) => entry.status === 'ok').length,
    notFound: youtubeCache.entries.filter((entry) => entry.status === 'not_found').length,
    error: youtubeCache.entries.filter((entry) => entry.status === 'error').length,
  };
  const report = {
    schemaVersion: 1,
    generatedAt,
    mode: 'dry-run',
    snapshotSha256,
    youtubeEvidenceSha256,
    supabaseProjectRef: credentials.projectRef,
    oEmbedCounts,
    socialAudit: {
      sourceCount: socialAudit.sourceCount,
      plannedCount: socialAudit.rows.length,
      skippedCount: socialAudit.decisions.filter((decision) => decision.status === 'skipped')
        .length,
      conflictCount: socialAudit.conflicts.length,
      skippedByReason: Object.fromEntries(
        socialAudit.decisions
          .filter((decision) => decision.status === 'skipped' && decision.reason)
          .reduce((counts, decision) => {
            counts.set(decision.reason!, (counts.get(decision.reason!) ?? 0) + 1);
            return counts;
          }, new Map<string, number>()),
      ),
      decisions: socialAudit.decisions,
      conflicts: socialAudit.conflicts,
    },
    currentDatabaseDelta: {
      existing: {
        guests: existing.guests.length,
        socials: existing.socials.length,
        appearances: existing.appearances.length,
      },
      writesRequired: {
        guests: currentDelta.guests.length,
        socials: currentDelta.socials.length,
        appearances: currentDelta.appearances.length,
        total:
          currentDelta.guests.length +
          currentDelta.socials.length +
          currentDelta.appearances.length,
      },
    },
    counts: plan.counts,
    issueSamples: plan.issues.slice(0, 100),
  };
  await Promise.all([
    atomicJson(options.planPath, fullPlan),
    atomicJson(options.reportPath, report),
  ]);
  console.log(JSON.stringify(report, null, 2));
  console.log(`Plan: ${options.planPath}`);
  console.log(`Report: ${options.reportPath}`);
  console.log(`YouTube evidence: ${options.youtubeCachePath}`);
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
    return;
  }
  validateOptions(options);
  const credentials = developmentCredentials();
  if (options.apply) await applyReviewedPlan(options, credentials);
  else await runDryRun(options, credentials);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
