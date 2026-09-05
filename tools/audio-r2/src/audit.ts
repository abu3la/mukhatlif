import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { HeadObjectCommand, S3Client, type HeadObjectCommandOutput } from '@aws-sdk/client-s3';
import { validateReport } from './apply-cli.ts';
import {
  APPROVED_CLOUDFLARE_ACCOUNT_ID,
  APPROVED_R2_BUCKET,
  APPROVED_SUPABASE_PROJECT_REF,
  type AudioMigrationPlanItem,
  type DatabaseEpisode,
} from './core.ts';
import type { TransferState } from './transfer.ts';
import { archiveObjectContentType, archiveObjectMetadata } from './reviewed-audio-formats.ts';

interface Checkpoint {
  schemaVersion: number;
  reportSha256: string;
  accountId: string;
  bucket: string;
  status: string;
  updatedAt: string;
  states: Record<string, TransferState>;
}
interface Observation {
  episodeId: string;
  key: string;
  bytes: number;
  sourcePreserved: boolean;
  checkpointVerified: boolean;
  checkpointLinked: boolean;
  objectUnchangedSinceReadback: boolean;
  databaseLinked: boolean;
  errors: string[];
}
const validDate = (date?: string) => typeof date === 'string' && Number.isFinite(Date.parse(date));

// HEAD proves that the object still agrees with the earlier full-byte readback.
// It is never presented as a fresh full download or as proof of source content.
export function observeArchiveItem(
  item: AudioMigrationPlanItem,
  state: TransferState | undefined,
  row: DatabaseEpisode | undefined,
  head?: HeadObjectCommandOutput,
): Observation {
  const errors: string[] = [];
  const sourcePreserved =
    !!row &&
    row.id === item.databaseEpisodeId &&
    row.show_id === item.showId &&
    row.rss_guid === item.rssGuid &&
    row.audio_url === item.sourceUrl &&
    row.source_url === item.sourceUrl;
  if (!sourcePreserved) errors.push('development-source-provenance');
  const checkpointVerified =
    !!state &&
    validDate(state.verifiedAt) &&
    /^[a-f0-9]{64}$/.test(state.sha256 ?? '') &&
    !!state.etag;
  const checkpointLinked =
    checkpointVerified &&
    validDate(state?.linkedAt) &&
    Date.parse(state!.linkedAt!) >= Date.parse(state!.verifiedAt!);
  if (state?.linkedAt && !checkpointLinked) errors.push('invalid-link-proof');
  const databaseLinked = sourcePreserved && row?.audio_key === item.key;
  let objectUnchangedSinceReadback = false;
  if (checkpointVerified) {
    if (!head) errors.push('object-head-unavailable');
    else {
      if (head.ContentLength !== item.expectedByteSize) errors.push('object-size');
      try {
        if (head.ContentType !== archiveObjectContentType(item, state!.sha256))
          errors.push('object-mime');
        for (const [key, value] of Object.entries(archiveObjectMetadata(item, state!.sha256!)))
          if (head.Metadata?.[key] !== value) errors.push(`object-${key}`);
      } catch {
        errors.push('object-format-review');
      }
      if (head.ETag !== state!.etag) errors.push('object-etag');
      objectUnchangedSinceReadback = !errors.some((e) => e.startsWith('object-'));
    }
    if (!databaseLinked) errors.push('development-audio-key');
  } else if (state?.verifiedAt) errors.push('incomplete-readback-proof');
  return {
    episodeId: item.databaseEpisodeId!,
    key: item.key,
    bytes: item.expectedByteSize,
    sourcePreserved,
    checkpointVerified,
    checkpointLinked,
    objectUnchangedSinceReadback,
    databaseLinked,
    errors,
  };
}

export function completeArchiveScope(
  observations: Observation[],
  batchStatuses: string[],
  expectedFiles: number,
  expectedBytes: number,
) {
  return (
    Number.isSafeInteger(expectedFiles) &&
    expectedFiles > 0 &&
    Number.isSafeInteger(expectedBytes) &&
    expectedBytes > 0 &&
    observations.length === expectedFiles &&
    new Set(observations.map((o) => o.episodeId)).size === expectedFiles &&
    observations.reduce((sum, o) => sum + o.bytes, 0) === expectedBytes &&
    batchStatuses.length > 0 &&
    batchStatuses.every((s) => s === 'complete') &&
    observations.every(
      (o) =>
        o.sourcePreserved &&
        o.checkpointVerified &&
        o.checkpointLinked &&
        o.objectUnchangedSinceReadback &&
        o.databaseLinked &&
        o.errors.length === 0,
    )
  );
}
async function privateEnv(file: string) {
  const info = await stat(file);
  if (!info.isFile() || info.mode & 0o077)
    throw new Error('Credentials must be private regular files');
  return parseEnv(await readFile(file, 'utf8'));
}
async function main() {
  const [queueFile, queueSha, total, bytes, r2File, devFile, output] = process.argv.slice(2);
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  if (
    !queueFile ||
    !queueSha ||
    !total ||
    !bytes ||
    !r2File ||
    !devFile ||
    !output ||
    !path.isAbsolute(output) ||
    path.resolve(output) === root ||
    path.resolve(output).startsWith(`${root}/`)
  )
    throw new Error(
      'Usage: audit.ts QUEUE SHA256 EXPECTED_FILES EXPECTED_BYTES R2_ENV DEV_ENV PRIVATE_OUTPUT',
    );
  const expectedFiles = Number(total),
    expectedBytes = Number(bytes);
  const text = await readFile(queueFile, 'utf8');
  if (
    !/^[a-f0-9]{64}$/.test(queueSha) ||
    createHash('sha256').update(text).digest('hex') !== queueSha
  )
    throw new Error('Approved queue checksum mismatch');
  const queue = JSON.parse(text) as { report: string; sha256: string; checkpoint: string }[];
  if (!Array.isArray(queue) || !queue.length || queue.length > 10) throw new Error('Invalid queue');
  const entries: { item: AudioMigrationPlanItem; state?: TransferState }[] = [];
  const batches: { reportSha256: string; checkpoint: string; status: string; updatedAt: string }[] =
    [];
  for (const batch of queue) {
    const source = await readFile(batch.report, 'utf8');
    const items = validateReport(
      JSON.parse(source),
      createHash('sha256').update(source).digest('hex'),
      batch.sha256,
    );
    const cp = JSON.parse(await readFile(batch.checkpoint, 'utf8')) as Checkpoint;
    if (
      cp.schemaVersion !== 1 ||
      cp.reportSha256 !== batch.sha256 ||
      cp.accountId !== APPROVED_CLOUDFLARE_ACCOUNT_ID ||
      cp.bucket !== APPROVED_R2_BUCKET ||
      !cp.states
    )
      throw new Error('Checkpoint identity mismatch');
    batches.push({
      reportSha256: batch.sha256,
      checkpoint: batch.checkpoint,
      status: cp.status,
      updatedAt: cp.updatedAt,
    });
    for (const item of items) entries.push({ item, state: cp.states[item.databaseEpisodeId!] });
  }
  if (
    !Number.isSafeInteger(expectedFiles) ||
    expectedFiles < 1 ||
    !Number.isSafeInteger(expectedBytes) ||
    expectedBytes < 1 ||
    entries.length !== expectedFiles ||
    new Set(entries.map((e) => e.item.databaseEpisodeId)).size !== expectedFiles ||
    entries.reduce((n, e) => n + e.item.expectedByteSize, 0) !== expectedBytes ||
    entries.some((e) => !/^[A-Za-z0-9_-]+$/.test(e.item.databaseEpisodeId!))
  )
    throw new Error('Queue does not cover the approved complete scope');
  const [r2, dev] = await Promise.all([privateEnv(r2File), privateEnv(devFile)]);
  if (
    r2.R2_ACCOUNT_ID !== APPROVED_CLOUDFLARE_ACCOUNT_ID ||
    r2.R2_AUDIO_BUCKET !== APPROVED_R2_BUCKET ||
    !r2.R2_ACCESS_KEY_ID ||
    !r2.R2_SECRET_ACCESS_KEY ||
    dev.SUPABASE_URL !== `https://${APPROVED_SUPABASE_PROJECT_REF}.supabase.co` ||
    !dev.SUPABASE_SERVICE_ROLE_KEY
  )
    throw new Error('Only the approved R2 and development Supabase destinations are allowed');
  const checkedAt = new Date().toISOString();
  const rows: DatabaseEpisode[] = [];
  for (let offset = 0; offset < entries.length; offset += 100) {
    const ids = entries.slice(offset, offset + 100).map((e) => e.item.databaseEpisodeId!);
    const url = new URL('/rest/v1/episodes', dev.SUPABASE_URL);
    url.searchParams.set('id', `in.(${ids.join(',')})`);
    url.searchParams.set('select', 'id,show_id,rss_guid,audio_key,audio_url,source_url');
    const response = await fetch(url, {
      headers: {
        apikey: dev.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${dev.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Development read-only audit HTTP ${response.status}`);
    const batchRows = (await response.json()) as DatabaseEpisode[];
    if (batchRows.some((r) => !ids.includes(r.id))) throw new Error('Unexpected development row');
    rows.push(...batchRows);
  }
  if (new Set(rows.map((r) => r.id)).size !== rows.length)
    throw new Error('Duplicate development row');
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${APPROVED_CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: r2.R2_ACCESS_KEY_ID, secretAccessKey: r2.R2_SECRET_ACCESS_KEY },
    maxAttempts: 3,
  });
  const observations: Observation[] = [];
  let index = 0;
  try {
    await Promise.all(
      Array.from({ length: 3 }, async () => {
        while (index < entries.length) {
          const { item, state } = entries[index++]!;
          let head: HeadObjectCommandOutput | undefined;
          if (state?.verifiedAt) {
            try {
              head = await client.send(
                new HeadObjectCommand({ Bucket: APPROVED_R2_BUCKET, Key: item.key }),
                { abortSignal: AbortSignal.timeout(30_000) },
              );
            } catch {
              /* The missing observation is a failure, never an assumed success. */
            }
          }
          observations.push(
            observeArchiveItem(
              item,
              state,
              rows.find((r) => r.id === item.databaseEpisodeId),
              head,
            ),
          );
        }
      }),
    );
  } finally {
    client.destroy();
  }
  observations.sort((a, b) => a.episodeId.localeCompare(b.episodeId));
  const scopeComplete = completeArchiveScope(
    observations,
    batches.map((b) => b.status),
    expectedFiles,
    expectedBytes,
  );
  const counts = Object.fromEntries(
    [
      'sourcePreserved',
      'checkpointVerified',
      'checkpointLinked',
      'objectUnchangedSinceReadback',
      'databaseLinked',
    ].map((key) => [key, observations.filter((o) => o[key as keyof Observation] === true).length]),
  );
  const report = {
    schemaVersion: 1,
    checkedAt,
    finishedAt: new Date().toISOString(),
    queueSha256: queueSha,
    expectedFiles,
    expectedBytes,
    projectRef: APPROVED_SUPABASE_PROJECT_REF,
    accountId: APPROVED_CLOUDFLARE_ACCOUNT_ID,
    bucket: APPROVED_R2_BUCKET,
    scopeComplete,
    note: 'Read-only transfer-scope audit, not UI/content acceptance or a fresh full-body readback.',
    counts,
    batches,
    observations,
  };
  await writeFile(output, JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
  process.stdout.write(
    JSON.stringify({
      scopeComplete,
      expectedFiles,
      counts,
      failedObservations: observations.filter((o) => o.errors.length).length,
    }) + '\n',
  );
  if (!scopeComplete) process.exitCode = 2;
}
if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url))
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Read-only audit failed'}\n`);
    process.exitCode = 1;
  });
