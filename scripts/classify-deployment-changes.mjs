import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function classifyChanges(paths) {
  const targets = { studio: false, web: false };
  for (const path of paths) {
    if (/^(docs\/|tools\/)|(^|\/)(AGENTS\.md|README[^/]*|LICENSE[^/]*)$/.test(path)) continue;
    if (path.startsWith('apps/admin/')) targets.studio = true;
    else if (path.startsWith('apps/web/')) targets.web = true;
    else if (path.startsWith('apps/api/') || path.startsWith('apps/mobile/')) continue;
    else if (
      path === '.github/workflows/deploy-studio.yml' ||
      /scripts\/(?:deploy|assert|prepare)-hostinger-studio/.test(path)
    )
      targets.studio = true;
    else if (
      path === '.github/workflows/deploy-web.yml' ||
      /scripts\/(?:deploy|assert|prepare|smoke)-hostinger-web/.test(path)
    )
      targets.web = true;
    // Shared libraries, lockfiles, root build settings and unknown source changes:
    // rebuild both rather than risk silently publishing stale consumers.
    else targets.studio = targets.web = true;
  }
  return targets;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = process.argv[2];
  if (!['studio', 'web'].includes(target)) throw Error('Expected studio or web');
  const sha = process.env.RELEASE_SHA;
  const repository = process.env.GITHUB_REPOSITORY;
  if (!/^[a-f0-9]{40}$/.test(sha ?? '') || repository !== 'abu3la/mukhatlif')
    throw Error('Invalid release context');
  const git = (args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  if (git(['rev-parse', 'HEAD']) !== sha) throw Error('Checkout mismatch');
  const runs = JSON.parse(
    execFileSync(
      'gh',
      [
        'api',
        `repos/${repository}/actions/workflows/deploy-${target}.yml/runs?branch=main&status=success&per_page=100`,
      ],
      { encoding: 'utf8' },
    ),
  ).workflow_runs;
  const previous = runs.find((run) => String(run.id) !== process.env.GITHUB_RUN_ID);
  let changed = true;
  let reason = 'No successful delivery baseline; initialize the target';
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
      changed = classifyChanges(paths)[target];
      reason = `${paths.length} files since last successful target workflow (${previous.head_sha.slice(0, 7)})`;
    } catch (error) {
      // History rewrites cannot safely use a partial diff.
      if (error.status !== 1 && error.status !== 128) throw error;
      reason = 'Baseline is not an ancestor; rebuild conservatively';
    }
  }
  console.log(`${target}: ${changed ? 'deploy' : 'skip'}; ${reason}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
}
