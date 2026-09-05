import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isOfficialChannel } from './youtube-channels.ts';
const [inventory, metadata, output] = process.argv.slice(2);
if (
  !inventory ||
  !metadata ||
  !output ||
  !path.isAbsolute(output) ||
  output.includes('/mukhatlif/')
)
  throw new Error('Provide base inventory, metadata directory, and private output');
const channel = JSON.parse(await readFile(inventory, 'utf8'));
if (!isOfficialChannel(channel.channel_id)) throw new Error('Wrong channel');
let enriched = 0;
for (const name of await readdir(metadata)) {
  if (!/^[A-Za-z0-9_-]{11}\.json$/.test(name)) continue;
  const details = JSON.parse(await readFile(path.join(metadata, name), 'utf8'));
  const index = channel.entries.findIndex((v: { id: string }) => v.id === details.id);
  if (index < 0 || details.channel_id !== channel.channel_id || name !== `${details.id}.json`)
    throw new Error('Metadata source mismatch');
  channel.entries[index] = { ...channel.entries[index], ...details };
  enriched++;
}
channel.enrichedAt = new Date().toISOString();
channel.enrichedCount = enriched;
await writeFile(output, JSON.stringify(channel), { mode: 0o600, flag: 'wx' });
process.stdout.write(`Enriched official metadata: ${enriched}/${channel.entries.length}\n`);
