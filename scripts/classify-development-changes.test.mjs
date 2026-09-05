import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyDevelopmentChanges as classify } from './classify-development-changes.mjs';

test('development apps select independently', () => {
  assert.deepEqual(classify(['apps/api/src/index.ts']), { api: true, studio: false, web: false });
  assert.deepEqual(classify(['apps/admin/src/main.tsx']), { api: false, studio: true, web: false });
  assert.deepEqual(classify(['apps/web/src/page.tsx']), { api: false, studio: false, web: true });
});
test('shared and unknown changes deploy all development consumers', () => {
  for (const path of [
    'libs/types/src/index.ts',
    'pnpm-lock.yaml',
    '.github/workflows/deploy-development.yml',
    'unknown.json',
  ])
    assert.deepEqual(classify([path]), { api: true, studio: true, web: true });
});
test('documentation, migrations and Hostinger tooling do not deploy development', () => {
  assert.deepEqual(
    classify([
      'docs/test.md',
      'AGENTS.md',
      'apps/api/supabase/migrations/0024.sql',
      'scripts/deploy-hostinger-web.mjs',
      '.github/workflows/deploy-studio.yml',
    ]),
    { api: false, studio: false, web: false },
  );
  assert.deepEqual(classify([]), { api: false, studio: false, web: false });
});
