// One-time local handoff from the Cloudflare UI. Never prints credential values.
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import path from 'node:path';
import { APPROVED_CLOUDFLARE_ACCOUNT_ID, APPROVED_R2_BUCKET } from './core.ts';

const target = process.argv[2];
if (!target || !path.isAbsolute(target) || target.includes('/mukhatlif/'))
  throw new Error('Provide an absolute private credential path outside the repository');
let text = execFileSync('/usr/bin/pbpaste', { encoding: 'utf8' }).trim();
await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
if (process.argv[3] === '--access-id') {
  if (!/^[a-f0-9]{32}$/.test(text)) throw new Error('Clipboard is not an R2 access key ID');
  await writeFile(`${target}.access-id`, text, { mode: 0o600, flag: 'wx' });
  execFileSync('/usr/bin/pbcopy', { input: '' });
  process.stdout.write('R2 access ID saved privately.\n');
  process.exit(0);
}
if (process.argv[3] === '--secret') {
  if (!/^[a-f0-9]{64}$/.test(text)) throw new Error('Clipboard is not an R2 secret key');
  const id = (await readFile(`${target}.access-id`, 'utf8')).trim();
  text = `R2_ACCOUNT_ID=${APPROVED_CLOUDFLARE_ACCOUNT_ID}\nR2_AUDIO_BUCKET=${APPROVED_R2_BUCKET}\nR2_ACCESS_KEY_ID=${id}\nR2_SECRET_ACCESS_KEY=${text}\n`;
}
const env = parseEnv(text);
if (
  env.R2_ACCOUNT_ID !== APPROVED_CLOUDFLARE_ACCOUNT_ID ||
  env.R2_AUDIO_BUCKET !== APPROVED_R2_BUCKET ||
  !/^[a-f0-9]{32}$/.test(env.R2_ACCESS_KEY_ID ?? '') ||
  !/^[a-f0-9]{64}$/.test(env.R2_SECRET_ACCESS_KEY ?? '') ||
  Object.keys(env).sort().join(',') !==
    'R2_ACCESS_KEY_ID,R2_ACCOUNT_ID,R2_AUDIO_BUCKET,R2_SECRET_ACCESS_KEY'
)
  throw new Error('Clipboard does not contain the approved R2 credentials');
await writeFile(target, text, { mode: 0o600, flag: 'wx' });
if (process.argv[3] === '--secret') await unlink(`${target}.access-id`);
execFileSync('/usr/bin/pbcopy', { input: '' });
process.stdout.write('R2 credentials saved privately; clipboard cleared.\n');
