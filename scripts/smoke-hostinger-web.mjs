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
  // Pages render against the live production API, which can answer slowly from
  // CI runners (46 s to prerender on 2026-11-23 against 2.4 s the day before).
  // Next streams the page, so the response headers arrive before the body; a
  // fetch timeout also covers reading that body. This smoke proves the
  // standalone output serves; it is not an API latency gate.
  const PAGE_TIMEOUT_MS = 30_000;
  let started = false;
  for (let attempt = 0; attempt < 60 && !started; attempt++) {
    if (child.exitCode !== null) throw new Error(`Standalone exited: ${log}`);
    try {
      // Only waits for the server to accept a request; the body is read below.
      const probe = await fetch(origin, { signal: AbortSignal.timeout(2000) });
      await probe.body?.cancel();
      started = true;
    } catch (error) {
      // A timeout means the server took the connection and is rendering slowly.
      if (error?.name === 'TimeoutError') started = true;
      else await delay(250);
    }
  }
  assert.ok(started, `Standalone did not start: ${log}`);
  // The home page renders per request against the live API, which once took
  // over 30 s from a runner (2026-11-23) minutes after answering in 2 s. Only a
  // timeout is retried; any other failure or status still fails at once.
  let response;
  let html;
  for (let attempt = 1; html === undefined; attempt++) {
    try {
      response = await fetch(origin, { signal: AbortSignal.timeout(PAGE_TIMEOUT_MS) });
      html = await response.text();
    } catch (error) {
      if (error?.name !== 'TimeoutError' || attempt === 3) throw error;
      console.log(
        `Home page took over ${PAGE_TIMEOUT_MS / 1000} s (attempt ${attempt}); retrying.`,
      );
    }
  }
  assert.equal(response.status, 200);
  assert.match(response.headers.get('x-robots-tag') ?? '', /noindex/);
  const assets = [
    ...new Set(
      [...html.matchAll(/(?:src|href)="([^"?#]+\.(?:js|css))(?:\?[^" ]*)?"/g)]
        .map((match) => match[1])
        .filter((url) => url.startsWith('/_next/static/')),
    ),
  ];
  assert.ok(assets.length > 0, 'No Next.js assets in rendered homepage');
  for (const asset of assets) {
    const result = await fetch(origin + asset, { signal: AbortSignal.timeout(PAGE_TIMEOUT_MS) });
    assert.equal(result.status, 200, `Missing static asset: ${asset}`);
    await result.arrayBuffer();
  }
  const login = await fetch(`${origin}/login`, { signal: AbortSignal.timeout(PAGE_TIMEOUT_MS) });
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
