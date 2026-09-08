import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const target = 'api.mukhtalif.net';
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
  await mkdir(source, { recursive: true });
  await copyFile(join(root, 'apps/api/dist/node.cjs'), join(source, 'node.cjs'));
  for (const file of [
    'assert-hostinger-production-env.mjs',
    'email-environment-policy.mjs',
    'supabase-key-policy.mjs',
  ])
    await copyFile(join(root, 'scripts', file), join(source, file));
  await writeFile(
    join(source, 'server.js'),
    `process.env.MUKHTALIF_RELEASE_SHA = ${JSON.stringify(sha)};\nrequire('./node.cjs');\n`,
  );
  await writeFile(
    join(source, 'package.json'),
    JSON.stringify({
      name: 'mukhtalif-api-hostinger',
      private: true,
      type: 'commonjs',
      engines: { node: '>=22' },
      scripts: {
        build:
          'node assert-hostinger-production-env.mjs && node --check server.js && node --check node.cjs',
        start: 'node assert-hostinger-production-env.mjs && node server.js',
      },
    }),
  );
  const archive = `api-${sha}-${process.env.GITHUB_RUN_ID ?? Date.now()}.zip`;
  execFileSync('zip', ['-q', '-r', join(output, archive), '.'], { cwd: source });
  await save('release.json', {
    sha,
    target,
    archive,
    sha256: digest(await readFile(join(output, archive))),
  });
  console.log('Prepared API Node bundle with production startup guards and pinned source SHA.');
}
if (phase === 'backup') {
  const result = cli(['hosting', 'nodejs', 'list-builds', username, target, '--per-page', '20']);
  const previous = result.data?.find((b) => b.state === 'completed');
  if (!previous?.options?.source_options?.archive_path)
    throw Error('No recoverable completed archive build');
  const liveResponse = await fetch(`https://${target}/health/live`, {
    signal: AbortSignal.timeout(30000),
  });
  if (!liveResponse.ok) throw Error('Cannot identify current public release');
  const live = await liveResponse.json();
  let recovery;
  if (
    previous.uuid === '01a0715c-a942-720a-be09-85395818afb4' &&
    live.status === 'ok' &&
    !live.sourceCommit
  ) {
    recovery = {
      kind: 'verified-local-bootstrap',
      path: '/Users/abu3la/dev/mukhtalif/backups/releases/20260905-api-cli/mukhtalif-20260905-api-standalone.zip',
      sha256: '5ffc7af03c7c7d414f2a5008e3688a7d9e83b5d5cd5c3a7549d7d50f4465aebb',
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
      .find((a) => a.name === `api-source-${live.sourceCommit}` && !a.expired);
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
    'other',
    '--node-version',
    '22',
    '--package-manager',
    'npm',
    '--root-directory',
    '.',
    '--build-script',
    'build',
    '--output-directory',
    '.',
    '--entry-file',
    'server.js',
    '--source-type',
    'archive',
    '--source-options',
    JSON.stringify({ archive_path: release.archive }),
  ]);
  const uuid = (build.data ?? build).uuid;
  if (!uuid) throw Error('Provider did not identify build; inspect before retrying');
  await save('deployment.json', { sha, target, uuid, acceptedAt: new Date().toISOString() });
  console.log(`API build accepted: ${uuid}`);
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
        const release = await fetch(`https://${target}/health/live?verify=${sha}`, {
          signal: AbortSignal.timeout(30000),
          redirect: 'error',
        });
        if (!release.ok || (await release.json()).sourceCommit !== sha)
          throw Error('Release has not reached public origin');
        const health = await fetch(`https://${target}/health/customer-schema`, {
          signal: AbortSignal.timeout(30000),
          redirect: 'error',
        });
        if (!health.ok || (await health.json()).ready !== true)
          throw Error('Customer schema is not ready');
        for (const path of ['/app/account', '/app/library']) {
          const response = await fetch(`https://${target}${path}`, {
            signal: AbortSignal.timeout(30000),
            redirect: 'error',
          });
          if (response.status !== 401)
            throw Error(`Unauthenticated route must reject access: ${path}`);
        }
        await save('smoke.json', {
          sha,
          target,
          uuid: receipt.uuid,
          passedAt: new Date().toISOString(),
        });
        console.log(
          'Verified API source commit, customer schema and unauthenticated access rejection.',
        );
        break;
      } catch (error) {
        if (attempt === 59) throw error;
      }
    }
    if (attempt === 59) throw Error('Timed out waiting for verified public deployment');
    console.log(`Waiting for API release (${build.state}).`);
    await new Promise((resolve) => setTimeout(resolve, 15000));
  }
}
