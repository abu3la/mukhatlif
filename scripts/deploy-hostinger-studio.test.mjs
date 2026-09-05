import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import process from 'node:process';

const ref = 'pacpdxvujkjvnaeeuute';
const jwt = (role, project = ref) =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role, ref: project })).toString('base64url')}.fixture`;

async function fixture(t, body) {
  const base = await mkdtemp(join(tmpdir(), 'studio-release-test-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, 'repo');
  const dist = join(root, 'apps/admin/dist');
  await mkdir(join(root, 'scripts'), { recursive: true });
  await mkdir(join(dist, 'assets'), { recursive: true });
  for (const file of ['deploy-hostinger-studio.mjs', 'prepare-hostinger-studio-output.mjs'])
    await copyFile(new URL(file, import.meta.url), join(root, 'scripts', file));
  await copyFile(
    new URL('../apps/admin/hostinger/.htaccess', import.meta.url),
    join(dist, '.htaccess'),
  );
  await writeFile(join(dist, 'index.html'), '<script src="/assets/app.js"></script>');
  await writeFile(
    join(dist, 'assets/app.js'),
    body ?? `https://api.mukhtalif.net https://${ref}.supabase.co ${jwt('anon')}`,
  );
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync(
    'git',
    [
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '--allow-empty',
      '-qm',
      'fixture',
    ],
    { cwd: root },
  );
  const output = join(base, 'release');
  const run = () =>
    spawnSync(
      process.execPath,
      [join(root, 'scripts/deploy-hostinger-studio.mjs'), 'prepare', output],
      {
        encoding: 'utf8',
        env: { ...process.env, GITHUB_ACTIONS: 'false', VITE_SUPABASE_ANON_KEY: jwt('anon') },
      },
    );
  return { run, output, dist };
}
test('packages dist contents at archive root with SPA fallback and exact commit manifest', async (t) => {
  const f = await fixture(t);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(await readFile(join(f.output, 'release-manifest.json')));
  assert.match(manifest.sha, /^[a-f0-9]{40}$/);
  assert.equal(manifest.target, 'studio.mukhtalif.net');
  assert.ok(manifest.files['.htaccess']);
  const entries = execFileSync('unzip', ['-Z1', join(f.output, manifest.archive)], {
    encoding: 'utf8',
  });
  assert.match(entries, /^index\.html$/m);
  assert.match(entries, /^\.htaccess$/m);
  assert.doesNotMatch(entries, /apps\/admin/);
});
test('rejects development and service-role keys before upload', async (t) => {
  for (const key of [jwt('anon', 'acomtixjibgkauzeltsn'), jwt('service_role')]) {
    const f = await fixture(
      t,
      `https://api.mukhtalif.net https://${ref}.supabase.co ${jwt('anon')} ${key}`,
    );
    assert.notEqual(f.run().status, 0);
  }
});
test('rejects missing SPA fallback and environment files', async (t) => {
  const f = await fixture(t);
  await writeFile(join(f.dist, '.env'), 'FIXTURE=value');
  assert.notEqual(f.run().status, 0);
  await rm(join(f.dist, '.env'));
  await rm(join(f.dist, '.htaccess'));
  assert.notEqual(f.run().status, 0);
});
