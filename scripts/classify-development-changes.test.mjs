import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyDevelopmentChanges as classify } from './classify-development-changes.mjs';
import { developmentBaseline } from './classify-development-changes.mjs';

test('workflow_run baseline uses verified dev identity, never default-branch head_sha', () => {
  const sha = 'a'.repeat(40);
  const run = {
    id: 1,
    conclusion: 'success',
    event: 'workflow_run',
    head_branch: 'main',
    head_sha: 'b'.repeat(40),
    display_title: `Development ${sha}`,
  };
  assert.equal(developmentBaseline([run], 2), sha);
  assert.equal(developmentBaseline([run], 1), null);
  assert.equal(developmentBaseline([{ ...run, conclusion: 'failure' }], 2), null);
  assert.equal(
    developmentBaseline([{ ...run, display_title: 'Deploy Cloudflare development' }], 2),
    null,
  );
});

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
