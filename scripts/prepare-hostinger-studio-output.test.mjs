import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  assertSafeSpaFallback,
  HOSTINGER_SPA_FALLBACK_MARKER,
  prepareHostingerStudioOutput,
} from './prepare-hostinger-studio-output.mjs';

const safeFallback = `# ${HOSTINGER_SPA_FALLBACK_MARKER}
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} -f [OR]
RewriteCond %{REQUEST_FILENAME} -d
RewriteRule ^ - [L]
RewriteRule ^ index.html [L]
`;

test('copies the validated SPA fallback only after a Vite output exists', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'mukhtalif-hostinger-studio-'));
  t.after(() => rm(root, { force: true, recursive: true }));
  const outputDirectory = join(root, 'dist');
  const sourcePath = join(root, '.htaccess.source');

  await mkdir(outputDirectory);
  await writeFile(join(outputDirectory, 'index.html'), '<!doctype html>');
  await writeFile(sourcePath, safeFallback);

  const destination = await prepareHostingerStudioOutput({ sourcePath, outputDirectory });
  assert.equal(destination, join(outputDirectory, '.htaccess'));
  assert.equal(await readFile(destination, 'utf8'), safeFallback);
});

test('fails closed when the Vite entry point is absent', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'mukhtalif-hostinger-studio-'));
  t.after(() => rm(root, { force: true, recursive: true }));
  const outputDirectory = join(root, 'dist');
  const sourcePath = join(root, '.htaccess.source');

  await mkdir(outputDirectory);
  await writeFile(sourcePath, safeFallback);

  await assert.rejects(
    prepareHostingerStudioOutput({ sourcePath, outputDirectory }),
    /run the Vite build first/,
  );
});

test('rejects redirects and fallbacks that can shadow real assets', () => {
  assert.throws(
    () => assertSafeSpaFallback(safeFallback.replace('RewriteCond %{REQUEST_FILENAME} -f [OR]\n', '')),
    /existing-file guard/,
  );
  assert.throws(
    () =>
      assertSafeSpaFallback(
        safeFallback.replace('RewriteRule ^ index.html [L]', 'RewriteRule ^ index.html [R=302,L]'),
      ),
    /internal rewrite, not a redirect/,
  );
});
