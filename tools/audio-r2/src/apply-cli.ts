import { createHash, randomBytes } from 'node:crypto';
import { readFile, mkdir, open, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import {
  APPROVED_CLOUDFLARE_ACCOUNT_ID,
  APPROVED_R2_BUCKET,
  APPROVED_SUPABASE_PROJECT_REF,
  audioObjectKey,
  canonicalAudioSource,
  type AudioMigrationPlanItem,
  type DatabaseEpisode,
} from './core.ts';
import { transferAudio, type TransferState } from './transfer.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
interface Checkpoint {
  schemaVersion: 1;
  reportSha256: string;
  accountId: string;
  bucket: string;
  startedAt: string;
  updatedAt: string;
  status: 'running' | 'stopped' | 'complete';
  states: Record<string, TransferState>;
  error?: { episodeId: string; code: string };
}
export async function atomicJson(file: string, data: unknown): Promise<void> {
  const tmp = `${file}.${randomBytes(6).toString('hex')}.tmp`;
  await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  await rename(tmp, file);
}
export function validateReport(
  value: unknown,
  reportSha: string,
  confirmedSha: string,
): AudioMigrationPlanItem[] {
  if (!/^[a-f0-9]{64}$/.test(confirmedSha) || reportSha !== confirmedSha)
    throw new Error('Reviewed report SHA-256 does not match --confirm-report-sha');
  const report = value as {
    schemaVersion?: number;
    mode?: string;
    guards?: { cloudflareAccountId?: string; r2Bucket?: string };
    items?: AudioMigrationPlanItem[];
  };
  if (
    report.schemaVersion !== 1 ||
    report.mode !== 'dry-run' ||
    report.guards?.cloudflareAccountId !== APPROVED_CLOUDFLARE_ACCOUNT_ID ||
    report.guards?.r2Bucket !== APPROVED_R2_BUCKET ||
    !report.items?.length
  )
    throw new Error('Unsupported report or wrong R2 destination');
  const ids = new Set<string>();
  for (const item of report.items) {
    canonicalAudioSource(item.sourceUrl);
    if (
      !['ready', 'already-linked'].includes(item.databaseState) ||
      !item.databaseEpisodeId ||
      !item.databaseAudioUrlMatches ||
      !item.databaseSourceUrlMatches ||
      !item.rssGuid ||
      ids.has(item.databaseEpisodeId) ||
      !Number.isSafeInteger(item.expectedByteSize) ||
      item.expectedByteSize <= 0 ||
      item.expectedByteSize > 8 * 1024 ** 3 ||
      item.key !== audioObjectKey(item.sourceUrl, item.extension) ||
      item.sourceUrlSha256 !== createHash('sha256').update(item.sourceUrl).digest('hex')
    )
      throw new Error('Unsafe or conflicting report item');
    ids.add(item.databaseEpisodeId);
  }
  return report.items;
}
export function archiveTransferOrder(items: AudioMigrationPlanItem[]): AudioMigrationPlanItem[] {
  const bySize = [...items].sort((a, b) => a.expectedByteSize - b.expectedByteSize);
  const sample = [
    bySize.find((i) => i.extension === 'mp3'),
    bySize.find((i) => i.extension === 'm4a'),
    bySize.at(-1),
  ];
  return [
    ...new Set([
      ...sample.filter((item): item is AudioMigrationPlanItem => item !== undefined),
      ...items.filter((i) => i.showSlug !== 'petroly'),
      ...items.filter((i) => i.showSlug === 'petroly'),
    ]),
  ];
}
async function privateEnv(file: string): Promise<Record<string, string>> {
  const info = await stat(file);
  if (!info.isFile() || (info.mode & 0o077) !== 0)
    throw new Error('Credential file must be a private regular file (chmod 600)');
  return Object.fromEntries(
    Object.entries(parseEnv(await readFile(file, 'utf8'))).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
}
function outsideRepo(file: string): string {
  const absolute = path.resolve(file);
  if (absolute === ROOT || absolute.startsWith(`${ROOT}/`))
    throw new Error('Private artifacts must stay outside Git');
  return absolute;
}
function options(args: string[]) {
  const output: Record<string, string> = {};
  const flags = [
    '--report',
    '--confirm-report-sha',
    '--checkpoint',
    '--r2-env',
    '--limit',
    '--link-env',
  ];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--') continue;
    if (!flags.includes(args[i]!) || !args[i + 1] || args[i + 1]!.startsWith('--'))
      throw new Error(
        'Usage: apply-cli.ts --report PATH --confirm-report-sha SHA256 --checkpoint PATH --r2-env PATH [--limit N] [--link-env DEV_ENV]',
      );
    output[args[i]!] = args[++i]!;
  }
  for (const flag of flags.slice(0, 4)) if (!output[flag]) throw new Error(`Missing ${flag}`);
  if (
    output['--limit'] &&
    (!/^[1-9]\d*$/.test(output['--limit']!) || Number(output['--limit']) > 10000)
  )
    throw new Error('Invalid --limit');
  return output;
}

export async function linkVerified(
  item: AudioMigrationPlanItem,
  env: Record<string, string>,
  backup: string,
): Promise<void> {
  const expectedOrigin = `https://${APPROVED_SUPABASE_PROJECT_REF}.supabase.co`;
  if (env.SUPABASE_URL !== expectedOrigin || !env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error('Linking requires the pinned DEVELOPMENT Supabase credentials');
  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
  const url = new URL('/rest/v1/episodes', expectedOrigin);
  url.searchParams.set('id', `eq.${item.databaseEpisodeId}`);
  url.searchParams.set('select', 'id,show_id,rss_guid,audio_key,audio_url,source_url');
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Development inventory HTTP ${response.status}`);
  const rows = (await response.json()) as DatabaseEpisode[];
  const row = rows[0];
  if (
    rows.length !== 1 ||
    row?.rss_guid !== item.rssGuid ||
    row.source_url !== item.sourceUrl ||
    row.audio_url !== item.sourceUrl ||
    row.show_id !== item.showId ||
    (row.audio_key !== null && row.audio_key !== item.key)
  )
    throw new Error('Database provenance conflict; edit preserved');
  if (row.audio_key === item.key) return;
  // Immutable before-image is preserved before the first attempted mutation.
  try {
    await writeFile(backup, JSON.stringify(row, null, 2), { mode: 0o600, flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  url.searchParams.set('rss_guid', `eq.${item.rssGuid}`);
  url.searchParams.set('show_id', `eq.${item.showId}`);
  url.searchParams.set('audio_key', 'is.null');
  url.searchParams.set('audio_url', `eq.${item.sourceUrl}`);
  url.searchParams.set('source_url', `eq.${item.sourceUrl}`);
  const updated = await fetch(url, {
    method: 'PATCH',
    headers: { ...headers, 'content-type': 'application/json', prefer: 'return=representation' },
    body: JSON.stringify({ audio_key: item.key }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!updated.ok) throw new Error(`Development link HTTP ${updated.status}`);
  const result = (await updated.json()) as DatabaseEpisode[];
  if (result.length !== 1 || result[0]?.audio_key !== item.key)
    throw new Error('Concurrent Studio edit detected; database not overwritten');
}

async function main() {
  const flags = options(process.argv.slice(2));
  const checkpointFile = outsideRepo(flags['--checkpoint']!);
  const directory = path.dirname(checkpointFile);
  await mkdir(directory, { mode: 0o700, recursive: true });
  const lock = `${checkpointFile}.lock`;
  // Never auto-steal locks. After an OS crash an operator checks the PID first.
  const lockHandle = await open(lock, 'wx', 0o600);
  await lockHandle.writeFile(String(process.pid));
  let checkpoint: Checkpoint | undefined;
  let activeId = 'preflight';
  try {
    const text = await readFile(flags['--report']!, 'utf8');
    const reportSha256 = createHash('sha256').update(text).digest('hex');
    const items = validateReport(JSON.parse(text), reportSha256, flags['--confirm-report-sha']!);
    const env = await privateEnv(flags['--r2-env']!);
    if (
      env.R2_ACCOUNT_ID !== APPROVED_CLOUDFLARE_ACCOUNT_ID ||
      env.R2_AUDIO_BUCKET !== APPROVED_R2_BUCKET ||
      !/^[a-f0-9]{32}$/.test(env.R2_ACCESS_KEY_ID ?? '') ||
      !/^[a-f0-9]{64}$/.test(env.R2_SECRET_ACCESS_KEY ?? '')
    )
      throw new Error('Invalid pinned R2 credentials');
    const client = new S3Client({
      region: 'auto',
      endpoint: `https://${APPROVED_CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID!,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
      },
      maxAttempts: 5,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
    await client.send(new HeadBucketCommand({ Bucket: APPROVED_R2_BUCKET }));
    const linkEnv = flags['--link-env'] ? await privateEnv(flags['--link-env']!) : null;
    if (
      linkEnv &&
      (linkEnv.SUPABASE_URL !== `https://${APPROVED_SUPABASE_PROJECT_REF}.supabase.co` ||
        !linkEnv.SUPABASE_SERVICE_ROLE_KEY)
    )
      throw new Error('Refusing non-development link environment');
    try {
      checkpoint = JSON.parse(await readFile(checkpointFile, 'utf8')) as Checkpoint;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (
      checkpoint &&
      (checkpoint.reportSha256 !== reportSha256 ||
        checkpoint.schemaVersion !== 1 ||
        checkpoint.accountId !== APPROVED_CLOUDFLARE_ACCOUNT_ID ||
        checkpoint.bucket !== APPROVED_R2_BUCKET)
    )
      throw new Error('Checkpoint belongs to a different migration');
    checkpoint ??= {
      schemaVersion: 1,
      reportSha256,
      accountId: APPROVED_CLOUDFLARE_ACCOUNT_ID,
      bucket: APPROVED_R2_BUCKET,
      startedAt: new Date().toISOString(),
      updatedAt: '',
      status: 'running',
      states: {},
    };
    const state = checkpoint;
    const save = async () => {
      state.updatedAt = new Date().toISOString();
      await atomicJson(checkpointFile, state);
    };
    state.status = 'running';
    delete state.error;
    await save();
    let stop = false;
    process.on('SIGTERM', () => {
      stop = true;
    });
    process.on('SIGINT', () => {
      stop = true;
    });
    // Three-format/size canaries first, then smaller shows, Petroly last.
    const order = archiveTransferOrder(items);
    let processed = 0;
    for (const item of order) {
      if (stop || (flags['--limit'] && processed >= Number(flags['--limit']))) break;
      activeId = item.databaseEpisodeId!;
      const itemState = (state.states[activeId] ??= {});
      const wasVerified = Boolean(itemState.verifiedAt);
      const file = path.join(directory, `${item.sourceUrlSha256}.download`);
      await transferAudio({
        client,
        item,
        file,
        state: itemState,
        save,
        progress: (message) =>
          process.stdout.write(`${new Date().toISOString()} ${activeId} ${message}\n`),
      });
      if (linkEnv) {
        await linkVerified(
          item,
          linkEnv,
          path.join(directory, `${item.sourceUrlSha256}.before.json`),
        );
        itemState.linkedAt = new Date().toISOString();
        await save();
      }
      if (!wasVerified) processed++;
      const done = Object.values(state.states).filter((s) => s.verifiedAt).length;
      process.stdout.write(
        `Verified ${done}/${items.length}; mode=${linkEnv ? 'copy-and-link-dev' : 'copy-only'}\n`,
      );
    }
    state.status = items.every((item) => state.states[item.databaseEpisodeId!]?.verifiedAt)
      ? 'complete'
      : 'stopped';
    await save();
    client.destroy();
  } catch (error) {
    // Do not stringify SDK requests/responses or credential-bearing errors.
    const code = error instanceof Error ? error.name : 'UnknownError';
    if (checkpoint) {
      checkpoint.status = 'stopped';
      checkpoint.error = { episodeId: activeId, code };
      await atomicJson(checkpointFile, checkpoint);
    }
    process.stderr.write(
      `Migration stopped at ${activeId}: ${code}. Checkpoint retained; no source or R2 object deleted.\n`,
    );
    // Locally authored guards contain no secrets; SDK errors are names only.
    if (error instanceof Error && (error.name === 'Error' || error.name === 'IntegrityError'))
      process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  } finally {
    await lockHandle.close();
    await unlink(lock);
  }
}
if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    process.stderr.write('Unable to acquire migration lock or initialize private checkpoint.\n');
    process.exitCode = 1;
  });
}
