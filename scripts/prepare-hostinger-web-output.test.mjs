import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareWebOutput } from './prepare-hostinger-web-output.mjs';

test('standalone keeps the monorepo layout and includes public/static assets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mukhtalif-web-output-test-'));
  try {
    const web = join(root, 'apps/web');
    const output = join(web, '.next/standalone');
    for (const dir of ['.next/standalone/apps/web/.next', '.next/static', 'public']) {
      await mkdir(join(web, dir), { recursive: true });
    }
    await writeFile(join(output, 'apps/web/server.js'), '// generated server');
    await writeFile(join(output, 'apps/web/.next/BUILD_ID'), 'test-build');
    await writeFile(join(web, '.next/static/test.js'), 'test-asset');
    await writeFile(join(web, 'public/brand.svg'), 'test-brand');
    await prepareWebOutput(root);
    assert.equal(
      await readFile(join(output, 'server.js'), 'utf8'),
      "require('./apps/web/server.js');\n",
    );
    assert.equal(
      await readFile(join(output, 'apps/web/.next/static/test.js'), 'utf8'),
      'test-asset',
    );
    assert.equal(await readFile(join(output, 'apps/web/public/brand.svg'), 'utf8'), 'test-brand');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('missing standalone server fails rather than reporting a deployable build', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mukhtalif-web-missing-test-'));
  try {
    await assert.rejects(prepareWebOutput(root), { code: 'ENOENT' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
