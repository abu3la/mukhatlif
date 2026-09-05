import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const target = 'staging.mukhtalif.net';
const username = 'u916712841';
const [phase, directory] = process.argv.slice(2);
if (!['prepare', 'backup', 'deploy', 'verify'].includes(phase) || !directory)
  throw Error('Expected release phase and private directory');
const output = resolve(directory);
if (output.startsWith(resolve(root) + '/') || output === resolve(root))
  throw Error('Release directory must be outside source');
await mkdir(output, { recursive: true, mode: 0o700 });
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
if (process.env.GITHUB_ACTIONS === 'true' && sha !== process.env.RELEASE_SHA)
  throw Error('Unverified checkout');
const save = (path, value) =>
  writeFile(join(output, path), JSON.stringify(value, null, 2), { mode: 0o600 });
function cli(args) {
  try {
    return JSON.parse(
      execFileSync('hostinger', [...args, '--format', 'json'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 20 * 1024 * 1024,
      }),
    );
  } catch {
    throw Error(`Hostinger failed: ${args.slice(0, 3).join(' ')}`);
  }
}
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
if (phase === 'prepare') {
  const source = join(output, 'source');
  const selected = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter(
      (p) =>
        p &&
        (p.startsWith('apps/web/') ||
          p.startsWith('libs/') ||
          [
            'package.json',
            'pnpm-lock.yaml',
            'pnpm-workspace.yaml',
            '.npmrc',
            'tsconfig.base.json',
            'eslint.config.mjs',
            'scripts/assert-hostinger-web-env.mjs',
            'scripts/prepare-hostinger-web-output.mjs',
          ].includes(p)),
    );
  for (const path of selected) {
    if (/(^|\/)\.env(?:\.|$)/.test(path)) continue;
    const to = join(source, path);
    await mkdir(dirname(to), { recursive: true });
    await copyFile(join(root, path), to);
  }
  // Same hosting adapter as the successful manual release: host installs at
  // repository root, Next app stays in apps/web and internal libs stay shared.
  const pkg = JSON.parse(await readFile(join(source, 'package.json')));
  pkg.dependencies = JSON.parse(await readFile(join(source, 'apps/web/package.json'))).dependencies;
  await writeFile(join(source, 'package.json'), JSON.stringify(pkg, null, 2));
  await writeFile(
    join(source, 'pnpm-workspace.yaml'),
    'packages:\n  - "apps/*"\n  - "libs/*"\nignoreScripts: true\nnodeLinker: hoisted\nallowBuilds:\n  esbuild: true\n  sharp: true\n  workerd: true\n',
  );
  await writeFile(
    join(source, 'apps/web/public/release.json'),
    JSON.stringify({ sourceCommit: sha, target, builtAt: new Date().toISOString() }),
  );
  const archive = `web-${sha}-${process.env.GITHUB_RUN_ID ?? Date.now()}.zip`;
  execFileSync('zip', ['-q', '-r', join(output, archive), '.'], { cwd: source });
  await save('release.json', {
    sha,
    target,
    archive,
    sha256: digest(await readFile(join(output, archive))),
  });
  console.log('Prepared Web-only source with monorepo paths; no admin/API source or env files.');
}
if (phase === 'backup') {
  const result = cli(['hosting', 'nodejs', 'list-builds', username, target, '--per-page', '20']);
  const previous = result.data?.find((b) => b.state === 'completed');
  if (!previous?.options?.source_options?.archive_path)
    throw Error('No recoverable completed archive build');
  const liveResponse = await fetch(`https://${target}/release.json`, {
    signal: AbortSignal.timeout(30000),
  });
  if (!liveResponse.ok) throw Error('Cannot identify current public release');
  const live = await liveResponse.json();
  let recovery;
  if (
    previous.uuid === '01a07156-499c-70b7-b797-037a363b058e' &&
    live.sourceCommit === '8c1dd3ab47e1bd46c56b630f87c4b06473d20953' &&
    live.builtAt === '2026-09-05T11:30:54.917Z'
  ) {
    // Bootstrap only: verified local archive from the existing manual deployment.
    // Hostinger no longer exposes its consumed input archive. Never silently
    // assume a different runtime is covered by this exact one-time backup.
    recovery = {
      kind: 'verified-local-bootstrap',
      path: '/Users/abu3la/dev/mukhtalif/backups/releases/20260905-web-cli/mukhtalif-20260905-web-standalone-cli.zip',
      sha256: '749a1168763d49253de3cf8b24022f76f5706bb332626c73c362b58fe656ae5e',
    };
  } else {
    const pages = JSON.parse(
      execFileSync(
        'gh',
        ['api', '--paginate', '--slurp', 'repos/abu3la/mukhatlif/actions/artifacts?per_page=100'],
        { encoding: 'utf8' },
      ),
    );
    const artifact = pages
      .flatMap((page) => page.artifacts)
      .find((a) => a.name === `web-source-${live.sourceCommit}` && !a.expired);
    if (!artifact)
      throw Error('Previous source backup missing or expired; stop before replacing website');
    recovery = {
      kind: 'github-artifact',
      artifactId: artifact.id,
      runId: artifact.workflow_run?.id,
    };
  }
  const config = cli([
    'hosting',
    'files',
    'website-content',
    username,
    target,
    '--path',
    '.htaccess',
  ]);
  await save('rollback.json', {
    target,
    previous,
    live,
    recovery,
    publicConfiguration: config,
    capturedAt: new Date().toISOString(),
  });
  console.log('Recorded previous completed build/configuration and its verified recovery source.');
}
if (phase === 'deploy') {
  const release = JSON.parse(await readFile(join(output, 'release.json')));
  const backup = JSON.parse(await readFile(join(output, 'rollback.json')));
  if (release.sha !== sha || release.target !== target || backup.target !== target)
    throw Error('Release target mismatch');
  const bytes = await readFile(join(output, release.archive));
  if (digest(bytes) !== release.sha256) throw Error('Archive mismatch');
  const raw = cli([
    'hosting',
    'files',
    'generate-upload-url',
    '--username',
    username,
    '--domain',
    target,
  ]);
  const d = raw.data ?? raw;
  const url = `${d.url.replace(/\/$/, '')}/${release.archive}?override=true`;
  if (new URL(url).protocol !== 'https:') throw Error('Unsafe upload URL');
  const headers = {
    'X-Auth': d.auth_key ?? d.authKey,
    'X-Auth-Rest': d.rest_auth_key ?? d.restAuthKey,
    'Tus-Resumable': '1.0.0',
    'Upload-Offset': '0',
  };
  const created = await fetch(url, {
    method: 'POST',
    redirect: 'error',
    headers: { ...headers, 'Upload-Length': String(bytes.length) },
    signal: AbortSignal.timeout(60000),
  });
  if (created.status !== 201) throw Error(`Upload creation: HTTP ${created.status}`);
  const sent = await fetch(url, {
    method: 'PATCH',
    redirect: 'error',
    headers: { ...headers, 'Content-Type': 'application/offset+octet-stream' },
    body: bytes,
    signal: AbortSignal.timeout(120000),
  });
  if (sent.status !== 204 || Number(sent.headers.get('upload-offset')) !== bytes.length)
    throw Error('Incomplete archive upload');
  const build = cli([
    'hosting',
    'nodejs',
    'start-build',
    username,
    target,
    '--app-type',
    'next',
    '--node-version',
    '22',
    '--package-manager',
    'pnpm',
    '--root-directory',
    '.',
    '--build-script',
    'build:hostinger:web',
    '--output-directory',
    'apps/web/.next',
    '--source-type',
    'archive',
    '--source-options',
    JSON.stringify({ archive_path: release.archive }),
  ]);
  const uuid = (build.data ?? build).uuid;
  if (!uuid) throw Error('Provider did not identify build; inspect before retrying');
  await save('deployment.json', { sha, target, uuid, acceptedAt: new Date().toISOString() });
  console.log(`Web build accepted: ${uuid}`);
}
if (phase === 'verify') {
  const receipt = JSON.parse(await readFile(join(output, 'deployment.json')));
  for (let attempt = 0; attempt < 60; attempt++) {
    const list = cli(['hosting', 'nodejs', 'list-builds', username, target, '--per-page', '20']);
    const build = list.data?.find((b) => b.uuid === receipt.uuid);
    if (!build) throw Error('Expected build missing');
    if (['failed', 'failure', 'cancelled'].includes(build.state))
      throw Error(`Provider build ${build.state}: ${receipt.uuid}`);
    if (build.state === 'completed') {
      try {
        const release = await fetch(`https://${target}/release.json?verify=${sha}`, {
          signal: AbortSignal.timeout(30000),
          redirect: 'error',
        });
        if (!release.ok || (await release.json()).sourceCommit !== sha)
          throw Error('Release has not reached public origin');
        for (const path of ['/', '/login', '/episodes']) {
          const r = await fetch(`https://${target}${path}`, {
            signal: AbortSignal.timeout(30000),
            redirect: 'error',
          });
          if (!r.ok || !r.headers.get('x-robots-tag')?.includes('noindex'))
            throw Error(`Staging route/noindex failed: ${path}`);
          const body = await r.text();
          const assets = [
            ...new Set(body.match(/\/_next\/static\/[^"'<>\s\\]+\.(?:js|css)/g) ?? []),
          ];
          if (!assets.length) throw Error('Missing Next static assets');
          for (const asset of assets) {
            const a = await fetch(`https://${target}${asset}`, {
              signal: AbortSignal.timeout(30000),
              redirect: 'error',
            });
            if (!a.ok || a.headers.get('content-type')?.includes('text/html'))
              throw Error(`Missing static file: ${asset}`);
            await a.arrayBuffer();
          }
        }
        await save('smoke.json', {
          sha,
          target,
          uuid: receipt.uuid,
          passedAt: new Date().toISOString(),
        });
        console.log('Verified staging release commit, routes, static assets and noindex.');
        break;
      } catch (error) {
        if (attempt === 59) throw error;
      }
    }
    if (attempt === 59) throw Error('Timed out waiting for verified public deployment');
    console.log(`Waiting for Web release (${build.state}).`);
    await new Promise((resolve) => setTimeout(resolve, 15000));
  }
}
