import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateReport } from './apply-cli.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const [queueFlag, queueFile, r2Flag, r2File, devFlag, devFile] = process.argv.slice(2);
if (
  queueFlag !== '--queue' ||
  !queueFile ||
  r2Flag !== '--r2-env' ||
  !r2File ||
  devFlag !== '--link-env' ||
  !devFile ||
  process.argv.length !== 8
)
  throw new Error(
    'Usage: queue.ts --queue PRIVATE_JSON --r2-env PRIVATE_ENV --link-env PRIVATE_DEV_ENV',
  );
if ((await stat(queueFile)).mode & 0o077) throw new Error('Queue must be private');
const queue = JSON.parse(await readFile(queueFile, 'utf8')) as {
  report: string;
  sha256: string;
  checkpoint: string;
}[];
if (!Array.isArray(queue) || !queue.length || queue.length > 10)
  throw new Error('Expected 1-10 reviewed batches');
const checkpoints = new Set<string>();
// Validate the complete queue before starting its first batch.
for (const batch of queue) {
  for (const file of [batch.report, batch.checkpoint])
    if (!path.isAbsolute(file) || file === root || file.startsWith(`${root}/`))
      throw new Error('Queue artifacts must stay outside Git');
  if (checkpoints.has(batch.checkpoint)) throw new Error('Duplicate checkpoint in queue');
  checkpoints.add(batch.checkpoint);
  const text = await readFile(batch.report, 'utf8');
  validateReport(JSON.parse(text), createHash('sha256').update(text).digest('hex'), batch.sha256);
}
let stop = false;
let running: ReturnType<typeof spawn> | undefined;
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.on(signal, () => {
    stop = true;
    running?.kill('SIGTERM');
  });
for (const batch of queue) {
  if (stop) break;
  process.stdout.write(`Starting reviewed batch ${batch.report}\n`);
  const child = spawn(
    process.execPath,
    [
      '--import',
      'tsx',
      path.join(root, 'tools/audio-r2/src/apply-cli.ts'),
      '--report',
      batch.report,
      '--confirm-report-sha',
      batch.sha256,
      '--checkpoint',
      batch.checkpoint,
      '--r2-env',
      r2File,
      '--link-env',
      devFile,
    ],
    { cwd: root, stdio: 'inherit' },
  );
  running = child;
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  });
  running = undefined;
  if (code !== 0) {
    process.exitCode = 1;
    break;
  }
  const checkpoint = JSON.parse(await readFile(batch.checkpoint, 'utf8'));
  const report = JSON.parse(await readFile(batch.report, 'utf8'));
  if (
    checkpoint.status !== 'complete' ||
    report.items.some(
      (item: { databaseEpisodeId: string }) =>
        !checkpoint.states[item.databaseEpisodeId]?.verifiedAt ||
        !checkpoint.states[item.databaseEpisodeId]?.linkedAt,
    )
  ) {
    process.stdout.write('Batch is incomplete; queue paused with checkpoints retained.\n');
    break;
  }
}
