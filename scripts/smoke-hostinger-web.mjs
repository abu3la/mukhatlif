import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

// Prove the deployable output runs OUTSIDE the workspace. Otherwise a missing
// dependency can resolve from the checkout and make a broken release look good.
const root = fileURLToPath(new URL('../', import.meta.url));
const isolated = await mkdtemp(join(tmpdir(), 'mukhtalif-web-smoke-'));
let child;
let log = '';
try {
  await cp(join(root, 'apps/web/.next/standalone'), isolated, {
    recursive: true,
    verbatimSymlinks: true,
  });
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  child = spawn(process.execPath, ['server.js'], {
    cwd: isolated,
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'production',
      HOSTNAME: '127.0.0.1',
      PORT: String(port),
      NEXT_TELEMETRY_DISABLED: '1',
      MUKHTALIF_API_URL: 'https://api.mukhtalif.net',
      PUBLIC_WEB_URL: 'https://staging.mukhtalif.net',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (value) => {
    log = (log + value).slice(-8000);
  });
  child.stderr.on('data', (value) => {
    log = (log + value).slice(-8000);
  });
  child.on('error', (error) => {
    log += error.message;
  });
  const origin = `http://127.0.0.1:${port}`;
  let response;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (child.exitCode !== null) throw new Error(`Standalone exited: ${log}`);
    try {
      response = await fetch(origin, { signal: AbortSignal.timeout(2000) });
      break;
    } catch {
      await delay(250);
    }
  }
  assert.ok(response, `Standalone did not start: ${log}`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('x-robots-tag') ?? '', /noindex/);
  const html = await response.text();
  const assets = [
    ...new Set(
      [...html.matchAll(/(?:src|href)="([^"?#]+\.(?:js|css))(?:\?[^" ]*)?"/g)]
        .map((match) => match[1])
        .filter((url) => url.startsWith('/_next/static/')),
    ),
  ];
  assert.ok(assets.length > 0, 'No Next.js assets in rendered homepage');
  for (const asset of assets) {
    const result = await fetch(origin + asset, { signal: AbortSignal.timeout(5000) });
    assert.equal(result.status, 200, `Missing static asset: ${asset}`);
    await result.arrayBuffer();
  }
  const login = await fetch(`${origin}/login`, { signal: AbortSignal.timeout(5000) });
  assert.equal(login.status, 200, 'Direct route failed');
  console.log(
    `Isolated standalone smoke passed: home, /login, noindex, ${assets.length} JS/CSS assets.`,
  );
} finally {
  if (child && child.exitCode === null) {
    const stopped = new Promise((resolve) => child.once('exit', resolve));
    child.kill('SIGTERM');
    await Promise.race([stopped, delay(3000)]);
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
      await stopped;
    }
  }
  await rm(isolated, { recursive: true, force: true });
}
