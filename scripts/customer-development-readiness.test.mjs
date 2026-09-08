import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const script = resolve(import.meta.dirname, 'verify-development-release.mjs');
function verifyApi(status, body) {
  // Run the actual release CLI, with an inert network implementation that
  // refuses any unexpected destination and requires manual redirect handling.
  const preload = `
    import assert from 'node:assert/strict';
    globalThis.fetch = async (input, options) => {
      const url = new URL(input);
      assert.equal(url.origin, 'https://mukhtalif-api.mukhtalif-development.workers.dev');
      assert.equal(options.redirect, 'manual');
      if (url.pathname === '/') return Response.json({name:'mukhtalif-api'});
      if (url.pathname === '/health/customer-schema') return new Response(${JSON.stringify(JSON.stringify(body))}, {status:${status}});
      if (url.pathname === '/shows') return Response.json([]);
      if (['/studio/me','/app/account','/app/library'].includes(url.pathname)) return Response.json({error:'Unauthorized'}, {status:401});
      throw new Error('Unexpected release request');
    };
  `;
  return spawnSync(
    process.execPath,
    ['--import', `data:text/javascript,${encodeURIComponent(preload)}`, script, 'api'],
    { encoding: 'utf8', timeout: 10000 },
  );
}

test('release verification rejects an unmigrated API even when authentication guards work', () => {
  const result = verifyApi(503, { ready: false });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /health\/customer-schema.*expected 200, got 503/);
  assert.doesNotMatch(result.stdout, /verified/);
});

test('release verification refuses redirects from the schema check', () => {
  const result = verifyApi(302, { ready: true });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /expected 200, got 302/);
});

for (const body of [{ ready: false }, {}, { ready: 'true' }]) {
  test(`a successful HTTP status does not substitute for schema readiness: ${JSON.stringify(body)}`, () => {
    const result = verifyApi(200, body);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /apply and verify migration 0024/);
  });
}

test('release verification continues through authentication guards only after schema readiness', () => {
  const result = verifyApi(200, { ready: true });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /customer schema, data read and authentication guard verified/);
});
