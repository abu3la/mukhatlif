import { execFileSync, spawn } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { Buffer } from 'node:buffer';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const admin = resolve(root, 'apps/admin');
const args = process.argv.slice(2).filter((a) => a !== '--');
const deploy = args[0] === 'deploy';
if (!['build', 'deploy'].includes(args[0]) || args[1] !== '--env' || args.length !== 3)
  throw new Error('Usage: cloudflare-studio.mjs build|deploy --env PRIVATE_BROWSER_ENV');
const envPath = resolve(args[2]);
if (envPath === root || envPath.startsWith(`${root}/`) || (await stat(envPath)).mode & 0o077)
  throw new Error('Browser env must be private and outside Git');
const input = parseEnv(await readFile(envPath, 'utf8'));
const ref = 'acomtixjibgkauzeltsn';
if (input.VITE_SUPABASE_URL !== `https://${ref}.supabase.co`)
  throw new Error('Development project mismatch');
const key = input.VITE_SUPABASE_ANON_KEY ?? '';
let payload;
try {
  payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url'));
} catch {
  /* fail closed below */
}
if (payload?.ref !== ref || payload?.role !== 'anon')
  throw new Error('Expected matching development anon key, never a service key');
const config = await readFile(resolve(admin, 'wrangler.jsonc'), 'utf8');
if (
  !/"account_id"\s*:\s*"bb4abee6bf877ef411dc803b3be96373"/.test(config) ||
  !/"name"\s*:\s*"studio"/.test(config)
)
  throw new Error('Studio Worker destination mismatch');
if (
  execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim() !==
  'dev'
)
  throw new Error('Cloudflare Studio builds must originate from dev');
execFileSync(process.execPath, [resolve(root, 'scripts/assert-cloudflare-development.mjs')], {
  stdio: 'inherit',
});
const env = {
  ...process.env,
  NODE_ENV: 'production',
  VITE_ADMIN_DATA_SOURCE: 'hono',
  VITE_API_URL: 'https://mukhtalif-api.mukhtalif-development.workers.dev',
  VITE_DEV_USER_ID: '',
  VITE_SUPABASE_URL: input.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: key,
};
async function run(command, argv) {
  await new Promise((ok, fail) => {
    const child = spawn(command, argv, { cwd: admin, env, stdio: 'inherit' });
    child.on('error', fail);
    child.on('close', (code) => (code === 0 ? ok() : fail(new Error(`${command} exited ${code}`))));
  });
}
await run('pnpm', ['run', 'build']);
let hasOrigin = false;
let hasKey = false;
for (const file of await readdir(resolve(admin, 'dist/assets'))) {
  if (!file.endsWith('.js')) continue;
  const text = await readFile(resolve(admin, 'dist/assets', file), 'utf8');
  if (/https:\/\/(?:pacpdxvujkjvnaeeuute\.supabase\.co|api\.mukhtalif\.net)/.test(text))
    throw new Error('Production origin found in development browser bundle');
  hasOrigin ||= text.includes(env.VITE_API_URL) && text.includes(env.VITE_SUPABASE_URL);
  hasKey ||= text.includes(key);
  for (const jwt of text.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) ?? []) {
    let claim;
    try {
      claim = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url'));
    } catch {
      continue;
    }
    if (claim.role === 'service_role') throw new Error('Service key found in browser output');
    if (claim.role === 'anon' && claim.ref !== ref)
      throw new Error('Foreign anon key found in browser output');
  }
}
if (!hasOrigin || !hasKey) throw new Error('Expected development configuration absent from bundle');
console.log('Studio development bundle verified: pinned API, Supabase, browser-only key.');
if (deploy) await run('pnpm', ['exec', 'wrangler', 'deploy']);
