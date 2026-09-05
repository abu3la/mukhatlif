import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { OFFICIAL_CHANNELS } from './youtube-channels.ts';

const output = process.argv[2];
const channelTab = process.argv[3] ?? 'videos';
const channelName = process.argv[4] ?? 'main';
if (!Object.hasOwn(OFFICIAL_CHANNELS, channelName))
  throw new Error('Unsupported publisher channel');
const channelId = OFFICIAL_CHANNELS[channelName as keyof typeof OFFICIAL_CHANNELS];
if (!['videos', 'streams'].includes(channelTab))
  throw new Error('Unsupported official channel tab');
if (!output || !path.isAbsolute(output) || output.includes('/mukhatlif/'))
  throw new Error('Provide a private inventory path outside Git');
await mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
const child = spawn(
  'yt-dlp',
  [
    '--flat-playlist',
    '--skip-download',
    '--dump-single-json',
    '--ignore-errors',
    `https://www.youtube.com/channel/${channelId}/${channelTab}`,
  ],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);
child.stderr.on('data', (chunk: Buffer) => process.stderr.write(chunk));
const finished = new Promise<void>((resolve, reject) => {
  child.on('error', reject);
  child.on('close', (code) =>
    code === 0 ? resolve() : reject(new Error(`YouTube inventory exited ${code}`)),
  );
});
await Promise.all([
  finished,
  pipeline(child.stdout, createWriteStream(`${output}.tmp`, { flags: 'wx', mode: 0o600 })),
]);
await rename(`${output}.tmp`, output);
process.stdout.write('Official-channel metadata inventory saved. No video files downloaded.\n');
