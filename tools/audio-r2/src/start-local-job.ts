import { spawn } from 'node:child_process';
import { open, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const log = process.argv[2];
const args = process.argv.slice(3);
if (
  !log ||
  !path.isAbsolute(log) ||
  log.includes('/mukhatlif/') ||
  (!args.includes('--checkpoint') && !args.includes('--queue'))
)
  throw new Error('Specify an external log path and explicit migration arguments');
const output = await open(log, 'ax', 0o600);
// Sleep inhibition is scoped to this job only; system settings are unchanged.
const child = spawn(
  '/usr/bin/caffeinate',
  [
    '-i',
    process.execPath,
    '--import',
    'tsx',
    path.join(
      root,
      args.includes('--queue') ? 'tools/audio-r2/src/queue.ts' : 'tools/audio-r2/src/apply-cli.ts',
    ),
    ...args,
  ],
  {
    cwd: root,
    detached: true,
    stdio: ['ignore', output.fd, output.fd],
  },
);
await new Promise<void>((resolve, reject) => {
  child.once('spawn', resolve);
  child.once('error', reject);
});
await writeFile(`${log}.pid`, String(child.pid), { mode: 0o600, flag: 'wx' });
child.unref();
await output.close();
process.stdout.write(`Local archive job started, supervisor PID ${child.pid}. Log: ${log}\n`);
