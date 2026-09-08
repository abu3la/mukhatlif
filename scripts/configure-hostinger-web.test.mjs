import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
test('staging config rejects unknown settings and secret keys before replacing', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'web-env-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const record = join(dir, 'request.json');
  await writeFile(
    join(dir, 'hostinger'),
    `#!/usr/bin/env node\nconst fs=require('node:fs');const a=process.argv;if(a.includes('list-environment-variables')){console.log(JSON.stringify({data:JSON.parse(process.env.FIXTURE_KEYS).map(key=>({key,value:'********'}))}));}else{fs.writeFileSync(process.env.FIXTURE_RECORD,a[a.indexOf('--env-vars')+1]);console.log('{}');}`,
    { mode: 0o700 },
  );
  const keys = [
    'MUKHTALIF_API_URL',
    'PUBLIC_WEB_URL',
    'PNPM_CONFIG_IGNORE_SCRIPTS',
    'PNPM_CONFIG_NODE_LINKER',
  ];
  const run = (list, key) =>
    spawnSync(
      process.execPath,
      [new URL('configure-hostinger-web.mjs', import.meta.url).pathname],
      {
        env: {
          ...process.env,
          PATH: dir + ':' + process.env.PATH,
          FIXTURE_KEYS: JSON.stringify(list),
          FIXTURE_RECORD: record,
          MUKHTALIF_SUPABASE_ANON_KEY: key,
        },
        encoding: 'utf8',
      },
    );
  assert.notEqual(run(keys, 'sb_secret_not_allowed').status, 0);
  assert.notEqual(run([...keys, 'UNKNOWN_SECRET'], 'sb_publishable_fixture').status, 0);
  const good = run(keys, 'sb_publishable_fixture');
  assert.equal(good.status, 0, good.stderr);
  const sent = JSON.parse(await readFile(record));
  assert.equal(sent.length, 7);
  assert.ok(sent.every((row) => row.value !== '********'));
  assert.equal(
    sent.find((row) => row.key === 'PUBLIC_WEB_URL').value,
    'https://staging.mukhtalif.net',
  );
});
