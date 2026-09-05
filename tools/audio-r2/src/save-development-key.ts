import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { APPROVED_SUPABASE_PROJECT_REF } from './core.ts';

const file = process.argv[2];
const browserKey = process.argv[3] === '--anon';
if (!file || !path.isAbsolute(file) || file.includes('/mukhatlif/'))
  throw new Error('Private path outside Git required');
const key = execFileSync('/usr/bin/pbpaste', { encoding: 'utf8' }).trim();
const payload = JSON.parse(Buffer.from(key.split('.')[1] ?? '', 'base64url').toString('utf8'));
if (
  payload.ref !== APPROVED_SUPABASE_PROJECT_REF ||
  payload.role !== (browserKey ? 'anon' : 'service_role')
)
  throw new Error('Clipboard key is not for the approved development project');
await mkdir(path.dirname(file), { mode: 0o700, recursive: true });
const contents = browserKey
  ? `VITE_SUPABASE_URL=https://${APPROVED_SUPABASE_PROJECT_REF}.supabase.co\nVITE_SUPABASE_ANON_KEY=${key}\n`
  : `SUPABASE_URL=https://${APPROVED_SUPABASE_PROJECT_REF}.supabase.co\nSUPABASE_SERVICE_ROLE_KEY=${key}\n`;
await writeFile(file, contents, { mode: 0o600, flag: 'wx' });
execFileSync('/usr/bin/pbcopy', { input: '' });
process.stdout.write(
  `Development-only ${browserKey ? 'public browser' : 'service'} key saved privately.\n`,
);
