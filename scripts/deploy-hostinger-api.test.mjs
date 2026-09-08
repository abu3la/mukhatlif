import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

test('API archive pins source, excludes env files, and fails closed on invalid runtime', async (t) => {
  const base = await mkdtemp(join(tmpdir(), 'api-package-test-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, 'repo'),
    out = join(base, 'out');
  await mkdir(join(root, 'scripts'), { recursive: true });
  await mkdir(join(root, 'apps/api/dist'), { recursive: true });
  for (const f of [
    'deploy-hostinger-api.mjs',
    'assert-hostinger-production-env.mjs',
    'email-environment-policy.mjs',
    'supabase-key-policy.mjs',
  ])
    await copyFile(new URL(f, import.meta.url), join(root, 'scripts', f));
  await writeFile(join(root, 'apps/api/dist/node.cjs'), 'console.log("fixture only")');
  await writeFile(join(root, 'apps/api/dist/.env'), 'SECRET=must-not-ship');
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync(
    'git',
    [
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=test@example.invalid',
      'commit',
      '--allow-empty',
      '-qm',
      'fixture',
    ],
    { cwd: root },
  );
  const args = [join(root, 'scripts/deploy-hostinger-api.mjs'), 'prepare', out];
  const bad = spawnSync(process.execPath, args, {
    env: { ...process.env, GITHUB_ACTIONS: 'true', RELEASE_SHA: '0'.repeat(40) },
  });
  assert.notEqual(bad.status, 0);
  const ok = spawnSync(process.execPath, args, {
    env: { ...process.env, GITHUB_ACTIONS: 'false' },
    encoding: 'utf8',
  });
  assert.equal(ok.status, 0, ok.stderr);
  const manifest = JSON.parse(await readFile(join(out, 'release.json')));
  assert.equal(manifest.target, 'api.mukhtalif.net');
  const entries = execFileSync('unzip', ['-Z1', join(out, manifest.archive)], { encoding: 'utf8' });
  assert.doesNotMatch(entries, /\.env/);
  assert.match(entries, /^server.js$/m);
  assert.match(entries, /^node.cjs$/m);
  const launcher = await readFile(join(out, 'source/server.js'), 'utf8');
  assert.ok(launcher.includes(manifest.sha));
  const pkg = JSON.parse(await readFile(join(out, 'source/package.json')));
  assert.match(pkg.scripts.start, /assert-hostinger-production-env/);
  const fail = spawnSync(
    process.execPath,
    [join(out, 'source/assert-hostinger-production-env.mjs')],
    { env: { PATH: process.env.PATH }, encoding: 'utf8' },
  );
  assert.notEqual(fail.status, 0);
});
