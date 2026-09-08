import { execFileSync } from 'node:child_process';
import { supabaseKeyKind, supabaseProjectRef } from './supabase-key-policy.mjs';
const target = 'staging.mukhtalif.net';
const ref = 'pacpdxvujkjvnaeeuute';
const key = process.env.MUKHTALIF_SUPABASE_ANON_KEY;
if (supabaseKeyKind(key) !== 'public') throw Error('A public production key is required');
if (!key.startsWith('sb_publishable_')) {
  const claim = JSON.parse(Buffer.from(key.split('.')[1], 'base64url'));
  if (claim.ref !== ref) throw Error('Wrong production key');
}
const expected = {
  MUKHTALIF_API_URL: 'https://api.mukhtalif.net',
  PUBLIC_WEB_URL: 'https://staging.mukhtalif.net',
  PNPM_CONFIG_IGNORE_SCRIPTS: 'true',
  PNPM_CONFIG_NODE_LINKER: 'hoisted',
  MUKHTALIF_SUPABASE_URL: `https://${ref}.supabase.co`,
  MUKHTALIF_SUPABASE_ANON_KEY: key,
  MUKHTALIF_GOOGLE_AUTH_ENABLED: 'false',
};
if (supabaseProjectRef(expected.MUKHTALIF_SUPABASE_URL) !== ref) throw Error('Wrong target');
function cli(args) {
  try {
    return JSON.parse(
      execFileSync('hostinger', ['hosting', 'nodejs', ...args, '--format', 'json'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 60000,
      }),
    );
  } catch {
    throw Error('Hostinger staging configuration failed; values are not logged');
  }
}
const raw = cli(['list-environment-variables', 'u916712841', target]);
const rows = raw.data?.env_vars ?? raw.env_vars ?? raw.data ?? raw;
if (!Array.isArray(rows) || rows.some((row) => !row.key || !(row.key in expected)))
  throw Error('Unexpected existing environment keys; refusing to replace unknown settings');
for (const name of [
  'MUKHTALIF_API_URL',
  'PUBLIC_WEB_URL',
  'PNPM_CONFIG_IGNORE_SCRIPTS',
  'PNPM_CONFIG_NODE_LINKER',
])
  if (!rows.some((row) => row.key === name))
    throw Error('Existing staging configuration has changed');
cli([
  'replace-environment-variables',
  'u916712841',
  target,
  '--env-vars',
  JSON.stringify(Object.entries(expected).map(([key, value]) => ({ key, value }))),
]);
console.log(
  'Configured staging customer auth with the production public key; no root-domain or API secret changes.',
);
