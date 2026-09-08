import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const script = resolve(import.meta.dirname, 'verify-development-release.mjs');
const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const fixture = (role = 'anon', ref = 'acomtixjibgkauzeltsn') =>
  `${encode({ alg: 'HS256' })}.${encode({ role, ref })}.inert-test-signature`;
function run(key, verify) {
  const dir = mkdtempSync(resolve(tmpdir(), 'mukhtalif-auth-env-'));
  try {
    const result = spawnSync(process.execPath, [script, 'browser-env'], {
      env: { ...process.env, RUNNER_TEMP: dir, DEVELOPMENT_ANON_KEY: key },
      encoding: 'utf8',
    });
    verify(result, dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
test('prepares pinned development browser config with private file permissions and no key logging', () => {
  const key = fixture();
  run(key, (result, dir) => {
    assert.equal(result.status, 0, result.stderr);
    const file = resolve(dir, 'web-auth-development.json');
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), {
      MUKHTALIF_SUPABASE_URL: 'https://acomtixjibgkauzeltsn.supabase.co',
      MUKHTALIF_SUPABASE_ANON_KEY: key,
      MUKHTALIF_GOOGLE_AUTH_ENABLED: 'false',
    });
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.equal(`${result.stdout}${result.stderr}`.includes(key), false);
  });
});
for (const [label, key] of [
  ['production', fixture('anon', 'pacpdxvujkjvnaeeuute')],
  ['service role', fixture('service_role')],
  ['secret', 'sb_secret_fixture'],
  ['missing', ''],
]) {
  test(`refuses ${label} customer auth configuration before producing deployment files`, () =>
    run(key, (result, dir) => {
      assert.notEqual(result.status, 0);
      assert.equal(existsSync(resolve(dir, 'web-auth-development.json')), false);
      assert.equal(existsSync(resolve(dir, 'studio-development.env')), false);
    }));
}
