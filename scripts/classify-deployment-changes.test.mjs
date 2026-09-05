import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyChanges } from './classify-deployment-changes.mjs';

test('application changes select only their frontend', () => {
  assert.deepEqual(classifyChanges(['apps/admin/src/editor.tsx']), { studio: true, web: false });
  assert.deepEqual(classifyChanges(['apps/web/src/page.tsx']), { studio: false, web: true });
});
test('shared dependencies and root configuration select both', () => {
  for (const path of [
    'libs/types/src/index.ts',
    'pnpm-lock.yaml',
    'package.json',
    'pnpm-workspace.yaml',
    '.npmrc',
    'tsconfig.base.json',
    'scripts/classify-deployment-changes.mjs',
  ])
    assert.deepEqual(classifyChanges([path]), { studio: true, web: true }, path);
});
test('documentation, API and migrations do not publish frontends', () => {
  assert.deepEqual(
    classifyChanges([
      'docs/release.md',
      'AGENTS.md',
      'apps/web/README.md',
      'apps/api/src/index.ts',
      'apps/api/supabase/migrations/0024.sql',
    ]),
    { studio: false, web: false },
  );
  assert.deepEqual(classifyChanges([]), { studio: false, web: false });
});
test('provider scripts select their own target, unknown source fails safe', () => {
  assert.deepEqual(classifyChanges(['scripts/smoke-hostinger-web.mjs']), {
    studio: false,
    web: true,
  });
  assert.deepEqual(classifyChanges(['.github/workflows/deploy-studio.yml']), {
    studio: true,
    web: false,
  });
  assert.deepEqual(classifyChanges(['new-build-config.json']), { studio: true, web: true });
});
