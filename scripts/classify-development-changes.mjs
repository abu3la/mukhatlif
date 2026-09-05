import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function classifyDevelopmentChanges(paths) {
  const selected = { api: false, studio: false, web: false };
  for (const path of paths) {
    if (
      /^(docs\/|tools\/|apps\/mobile\/|apps\/api\/supabase\/)|(^|\/)(AGENTS\.md|README[^/]*|LICENSE[^/]*)$/.test(
        path,
      )
    )
      continue;
    if (/^scripts\/.*hostinger|^\.github\/workflows\/deploy-(studio|web)\.yml$/.test(path))
      continue;
    if (path.startsWith('apps/api/')) selected.api = true;
    else if (path.startsWith('apps/admin/') || path === 'scripts/cloudflare-studio.mjs')
      selected.studio = true;
    else if (path.startsWith('apps/web/')) selected.web = true;
    else selected.api = selected.studio = selected.web = true;
  }
  return selected;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sha = process.env.RELEASE_SHA;
  if (process.env.GITHUB_REPOSITORY !== 'abu3la/mukhatlif' || !/^[a-f0-9]{40}$/.test(sha ?? ''))
    throw Error('Invalid development release context');
  const git = (args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  if (git(['rev-parse', 'HEAD']) !== sha) throw Error('Checkout mismatch');
  const { workflow_runs: runs } = JSON.parse(
    execFileSync(
      'gh',
      [
        'api',
        'repos/abu3la/mukhatlif/actions/workflows/deploy-development.yml/runs?branch=dev&status=success&per_page=100',
      ],
      { encoding: 'utf8' },
    ),
  );
  const previous = runs.find((run) => String(run.id) !== process.env.GITHUB_RUN_ID);
  let selected = { api: true, studio: true, web: true };
  if (previous) {
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', previous.head_sha, sha], {
        stdio: 'pipe',
      });
      const paths = execFileSync(
        'git',
        ['diff', '--name-only', '--no-renames', '-z', previous.head_sha, sha],
        { encoding: 'utf8' },
      )
        .split('\0')
        .filter(Boolean);
      selected = classifyDevelopmentChanges(paths);
    } catch (error) {
      if (![1, 128].includes(error.status)) throw error;
    }
  }
  console.log('Development deployment selection:', selected);
  for (const [target, changed] of Object.entries(selected))
    appendFileSync(process.env.GITHUB_OUTPUT, `${target}=${changed}\n`);
}
