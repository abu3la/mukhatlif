import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const account = 'bb4abee6bf877ef411dc803b3be96373';
const ref = 'acomtixjibgkauzeltsn';
const api = 'https://mukhtalif-api.mukhtalif-development.workers.dev';
const web = 'https://web.mukhtalif-development.workers.dev';
const studio = 'https://studio.mukhtalif-development.workers.dev';
const mode = process.argv[2];

async function check(url, expected = 200) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000), redirect: 'manual' });
  if (response.status !== expected)
    throw Error(`${url}: expected ${expected}, got ${response.status}`);
  return response;
}

if (mode === 'config') {
  execFileSync(process.execPath, [resolve(root, 'scripts/assert-cloudflare-development.mjs')], {
    stdio: 'inherit',
  });
  for (const [app, name] of [
    ['api', 'mukhtalif-api'],
    ['admin', 'studio'],
    ['web', 'web'],
  ]) {
    const config = readFileSync(resolve(root, `apps/${app}/wrangler.jsonc`), 'utf8').replace(
      /^\s*\/\/.*$/gm,
      '',
    );
    const get = (key) =>
      [...config.matchAll(new RegExp(`"${key}"\\s*:\\s*"([^\"]+)"`, 'g'))].map((m) => m[1]);
    if (
      JSON.stringify(get('account_id')) !== JSON.stringify([account]) ||
      JSON.stringify(get('name')) !== JSON.stringify([name])
    )
      throw Error(`${app}: unexpected account or Worker`);
    if (/"routes?"\s*:/.test(config) || /"workers_dev"\s*:\s*false/.test(config))
      throw Error('Custom Worker routing is not authorized');
    if (app === 'web' && (get('MUKHTALIF_API_URL')[0] !== api || get('PUBLIC_WEB_URL')[0] !== web))
      throw Error('Web environment mismatch');
  }
  console.log('Pinned development account, Worker names, origins and policy verified.');
} else if (mode === 'browser-env') {
  const key = process.env.DEVELOPMENT_ANON_KEY ?? '';
  let claim;
  try {
    claim = JSON.parse(Buffer.from(key.split('.')[1], 'base64url'));
  } catch {
    /* reject below */
  }
  if (claim?.ref !== ref || claim?.role !== 'anon' || /[\r\n]/.test(key))
    throw Error('Missing or invalid development anon key');
  if (!process.env.RUNNER_TEMP) throw Error('Runner temporary directory required');
  writeFileSync(
    resolve(process.env.RUNNER_TEMP, 'studio-development.env'),
    `VITE_SUPABASE_URL=https://${ref}.supabase.co\nVITE_SUPABASE_ANON_KEY=${key}\n`,
    { mode: 0o600, flag: 'wx' },
  );
} else if (mode === 'api') {
  const response = await check(`${api}/`);
  if ((await response.json()).name !== 'mukhtalif-api')
    throw Error('API identity response mismatch');
  await check(`${api}/shows`);
  await check(`${api}/studio/me`, 401);
  console.log('Development API identity, data read and authentication guard verified.');
} else if (mode === 'public') {
  for (const origin of [web, studio]) {
    for (const route of ['/', '/login', '/episodes']) {
      const response = await check(`${origin}${route}`);
      const body = await response.text();
      if (!body.includes('<html')) throw Error(`${origin}${route}: not HTML`);
      if (origin === web && !/noindex/i.test(response.headers.get('x-robots-tag') ?? ''))
        throw Error('Development Web must deny indexing');
    }
  }
  console.log('Development Web and Studio routes verified; no content was written.');
} else throw Error('Expected config, browser-env, api or public');
