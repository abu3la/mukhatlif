import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isOfficialChannel } from './youtube-channels.ts';

// Public metadata only. No cookies, credentials, or audio/video files are downloaded.
const [inventoryFile, matchesFile, directory] = process.argv.slice(2);
if (
  !inventoryFile ||
  !matchesFile ||
  !directory ||
  !path.isAbsolute(directory) ||
  directory.includes('/mukhatlif/')
)
  throw new Error('Provide channel inventory, match report, and private metadata directory');
const channel = JSON.parse(await readFile(inventoryFile, 'utf8'));
if (!isOfficialChannel(channel.channel_id)) throw new Error('Wrong channel');
const matches = JSON.parse(await readFile(matchesFile, 'utf8'));
const assigned = new Set(
  matches.items.map((i: { videoId: string | null }) => i.videoId).filter(Boolean),
);
if (process.argv[5] === '--all') assigned.clear();
const ids = channel.entries
  .map((i: { id: string }) => i.id)
  .filter((id: string) => /^[A-Za-z0-9_-]{11}$/.test(id) && !assigned.has(id)) as string[];
await mkdir(directory, { mode: 0o700, recursive: true });
let cursor = 0;
let complete = 0;
const errors: string[] = [];
async function inspect(id: string) {
  const target = path.join(directory!, `${id}.json`);
  try {
    const cached = JSON.parse(await readFile(target, 'utf8'));
    if (cached.id !== id || cached.channel_id !== channel.channel_id)
      throw new Error('Cached channel/video identity mismatch');
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const json = await new Promise<string>((resolve, reject) => {
    const child = spawn(
      'yt-dlp',
      [
        '--skip-download',
        '--dump-single-json',
        '--no-warnings',
        '--ignore-no-formats-error',
        '--socket-timeout',
        '20',
        '--retries',
        '2',
        `https://www.youtube.com/watch?v=${id}`,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let output = '';
    let bytes = 0;
    const timeout = setTimeout(() => child.kill('SIGTERM'), 60_000);
    child.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 12 * 1024 ** 2) child.kill('SIGTERM');
      else output += chunk.toString();
    });
    child.stderr.resume();
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve(output);
      else reject(new Error(`Metadata unavailable ${id}`));
    });
  });
  const info = JSON.parse(json);
  if (info.id !== id || info.channel_id !== channel.channel_id)
    throw new Error('Channel/video identity mismatch');
  const record = Object.fromEntries(
    [
      'id',
      'title',
      'channel_id',
      'duration',
      'upload_date',
      'description',
      'availability',
      'live_status',
      'is_live',
      'age_limit',
    ].map((k) => [k, info[k] ?? null]),
  );
  await writeFile(
    target,
    JSON.stringify({ ...record, fetchedAt: new Date().toISOString() }, null, 2),
    { mode: 0o600, flag: 'wx' },
  );
}
await Promise.all(
  Array.from({ length: 3 }, async () => {
    while (cursor < ids.length) {
      const id = ids[cursor++]!;
      try {
        await inspect(id);
        complete++;
      } catch {
        errors.push(id);
      }
      if ((complete + errors.length) % 20 === 0)
        process.stdout.write(`Metadata ${complete}/${ids.length}; unavailable=${errors.length}\n`);
    }
  }),
);
process.stdout.write(JSON.stringify({ complete, total: ids.length, unavailable: errors }) + '\n');
