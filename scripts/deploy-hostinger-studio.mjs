import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, readdir, lstat } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { assertSafeSpaFallback } from './prepare-hostinger-studio-output.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'apps/admin/dist');
const target = 'studio.mukhtalif.net';
const username = 'u916712841';
const origin = `https://${target}`;
const ref = 'pacpdxvujkjvnaeeuute';
const [phase, outputPath] = process.argv.slice(2);
if (!['prepare', 'backup', 'deploy', 'verify'].includes(phase) || !outputPath)
  throw Error(
    'Usage: node scripts/deploy-hostinger-studio.mjs prepare|backup|deploy|verify PRIVATE_RELEASE_DIRECTORY',
  );
const output = resolve(outputPath);
if (output === root || output.startsWith(`${root}/`))
  throw Error('Keep release archives outside source');
await mkdir(output, { recursive: true, mode: 0o700 });
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
if (process.env.GITHUB_ACTIONS === 'true' && process.env.RELEASE_SHA !== sha)
  throw Error('Checked-out source must equal the verified release SHA');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const save = (path, data) =>
  writeFile(join(output, path), JSON.stringify(data, null, 2), { mode: 0o600 });
function cli(args) {
  // Provider output may contain temporary upload credentials. Never print it.
  try {
    return JSON.parse(
      execFileSync('hostinger', [...args, '--format', 'json'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 20 * 1024 * 1024,
      }),
    );
  } catch {
    throw Error(`Hostinger command failed: ${args.slice(0, 3).join(' ')}`);
  }
}
async function files(directory, prefix = '') {
  const result = [];
  for (const name of await readdir(directory)) {
    const path = join(directory, name);
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) throw Error('Release output cannot contain symlinks');
    if (stat.isDirectory()) result.push(...(await files(path, `${prefix}${name}/`)));
    else if (stat.isFile()) result.push(`${prefix}${name}`);
  }
  return result;
}
async function fetchBytes(path) {
  const response = await fetch(`${origin}/${path}?release_check=${sha}`, {
    redirect: 'error',
    signal: AbortSignal.timeout(30000),
    cache: 'no-store',
  });
  if (!response.ok) throw Error(`Studio returned HTTP ${response.status} for ${path}`);
  return Buffer.from(await response.arrayBuffer());
}
function safePath(path) {
  if (
    !path ||
    path.startsWith('/') ||
    path.includes('\\') ||
    path.split('/').some((p) => p === '..' || p === '.')
  )
    throw Error('Unsafe provider file path');
  return path;
}
if (phase === 'prepare') {
  assertSafeSpaFallback(await readFile(join(dist, '.htaccess'), 'utf8'));
  const index = await readFile(join(dist, 'index.html'), 'utf8');
  if (!index.includes('/assets/')) throw Error('Expected Vite output at apps/admin/dist');
  let foundApi = false,
    foundProject = false,
    foundKey = false;
  for (const path of await files(dist)) {
    if (/\.env|\.map$/.test(path))
      throw Error('Environment files/source maps must not be published');
    if (!path.endsWith('.js')) continue;
    const body = await readFile(join(dist, path), 'utf8');
    if (body.includes('https://acomtixjibgkauzeltsn.supabase.co'))
      throw Error('Development Supabase in production bundle');
    foundApi ||= body.includes('https://api.mukhtalif.net');
    foundProject ||= body.includes(`https://${ref}.supabase.co`);
    foundKey ||=
      !!process.env.VITE_SUPABASE_ANON_KEY && body.includes(process.env.VITE_SUPABASE_ANON_KEY);
    for (const jwt of body.match(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g) ?? []) {
      const claim = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url'));
      if (claim.role === 'service_role' || (claim.role === 'anon' && claim.ref !== ref))
        throw Error('Unsafe Supabase key in browser output');
    }
  }
  if (!foundApi || !foundProject || !foundKey)
    throw Error('Production browser configuration missing');
  await writeFile(
    join(dist, 'release.json'),
    JSON.stringify({ commit: sha, target, builtAt: new Date().toISOString() }),
  );
  const archive = `studio-${sha}-${process.env.GITHUB_RUN_ID ?? Date.now()}.zip`;
  execFileSync('zip', ['-q', '-r', join(output, archive), '.'], { cwd: dist });
  const manifest = {};
  for (const path of await files(dist)) manifest[path] = hash(await readFile(join(dist, path)));
  await save('release-manifest.json', {
    sha,
    target,
    archive,
    sha256: hash(await readFile(join(output, archive))),
    files: manifest,
  });
  console.log(
    'Prepared apps/admin/dist, including SPA fallback, with pinned production configuration.',
  );
}
if (phase === 'backup') {
  if (await lstat(join(output, 'backup-receipt.json')).catch(() => null))
    throw Error('A verified backup already exists here; use a fresh release directory');
  const listing = cli([
    'hosting',
    'files',
    'list-website-and-directories',
    username,
    target,
    '--max-items',
    '1000',
    '--max-depth',
    '10',
  ]);
  const data = listing.data ?? listing;
  if (
    !Array.isArray(data.items) ||
    data.total_items > data.items.length ||
    data.items.length >= 1000
  )
    throw Error('Incomplete provider listing; refusing to overwrite without a full backup');
  const backup = join(output, 'before');
  await mkdir(backup, { recursive: true, mode: 0o700 });
  for (const item of data.items) {
    if (item.type === 'directory') continue;
    if (item.type !== 'file')
      throw Error('Unexpected non-file in Studio; inspect before deploying');
    const path = safePath(item.path);
    // Archives at the document root are prior release inputs, not served app files.
    if (!path.includes('/') && path.endsWith('.zip')) continue;
    let bytes;
    if (path === '.htaccess') {
      const raw = cli(['hosting', 'files', 'website-content', username, target, '--path', path]);
      const content = raw.data ?? raw;
      bytes = Buffer.from(content.content);
      // The provider's line-oriented reader omits the final LF. Only recover
      // it when both its byte count and the tracked, reviewed file agree.
      if (bytes.length + 1 === item.size_bytes) {
        const tracked = await readFile(join(root, 'apps/admin/hostinger/.htaccess'));
        const withFinalLf = Buffer.concat([bytes, Buffer.from('\n')]);
        if (withFinalLf.equals(tracked)) bytes = withFinalLf;
      }
    } else {
      if (path.split('/').some((part) => part.startsWith('.')))
        throw Error('Unexpected hidden configuration; manual review required');
      bytes = await fetchBytes(path);
    }
    if (bytes.length !== item.size_bytes) throw Error(`Backup size mismatch: ${path}`);
    await mkdir(dirname(join(backup, path)), { recursive: true, mode: 0o700 });
    await writeFile(join(backup, path), bytes, { mode: 0o600 });
  }
  await readFile(join(backup, 'index.html'));
  await readFile(join(backup, '.htaccess'));
  execFileSync('zip', ['-q', '-r', join(output, 'rollback.zip'), '.'], { cwd: backup });
  await save('backup-receipt.json', {
    target,
    sha256: hash(await readFile(join(output, 'rollback.zip'))),
    completedAt: new Date().toISOString(),
  });
  console.log('Full served Studio files and existing .htaccess backed up; rollback.zip ready.');
}
if (phase === 'deploy') {
  const release = JSON.parse(await readFile(join(output, 'release-manifest.json')));
  const backup = JSON.parse(await readFile(join(output, 'backup-receipt.json')));
  if (release.sha !== sha || release.target !== target || backup.target !== target)
    throw Error('Release/backup target mismatch');
  if (hash(await readFile(join(output, 'rollback.zip'))) !== backup.sha256)
    throw Error('Rollback archive corrupted');
  const bytes = await readFile(join(output, release.archive));
  if (hash(bytes) !== release.sha256) throw Error('Release archive corrupted');
  const raw = cli([
    'hosting',
    'files',
    'generate-upload-url',
    '--username',
    username,
    '--domain',
    target,
  ]);
  const data = raw.data ?? raw;
  const url = `${data.url.replace(/\/$/, '')}/${release.archive}?override=true`;
  if (new URL(url).protocol !== 'https:') throw Error('Unsafe upload URL');
  const headers = {
    'X-Auth': data.auth_key ?? data.authKey,
    'X-Auth-Rest': data.rest_auth_key ?? data.restAuthKey,
    'Tus-Resumable': '1.0.0',
    'Upload-Offset': '0',
  };
  const created = await fetch(url, {
    method: 'POST',
    redirect: 'error',
    headers: { ...headers, 'Upload-Length': String(bytes.length) },
    signal: AbortSignal.timeout(60000),
  });
  if (created.status !== 201) throw Error(`Upload creation returned ${created.status}`);
  const uploaded = await fetch(url, {
    method: 'PATCH',
    redirect: 'error',
    headers: { ...headers, 'Content-Type': 'application/offset+octet-stream' },
    body: bytes,
    signal: AbortSignal.timeout(120000),
  });
  if (uploaded.status !== 204 || Number(uploaded.headers.get('upload-offset')) !== bytes.length)
    throw Error('Incomplete upload');
  cli([
    'hosting',
    'websites',
    'deploy-static-site-archive',
    username,
    target,
    '--archive-path',
    release.archive,
  ]);
  await save('deployment-receipt.json', {
    target,
    sha,
    archive: release.archive,
    acceptedAt: new Date().toISOString(),
  });
  console.log('Hostinger accepted Studio deployment; public checks still required.');
}
if (phase === 'verify') {
  const manifest = JSON.parse(await readFile(join(output, 'release-manifest.json')));
  for (let attempt = 0; ; attempt++) {
    try {
      const live = JSON.parse(await fetchBytes('release.json'));
      if (live.commit !== sha || live.target !== target)
        throw Error('Live release does not match verified main commit');
      for (const path of ['login', 'invite', 'articles/new', 'episodes']) {
        if (hash(await fetchBytes(path)) !== manifest.files['index.html'])
          throw Error(`SPA route mismatch: ${path}`);
      }
      for (const [path, digest] of Object.entries(manifest.files)) {
        if (path === '.htaccess') continue;
        if (hash(await fetchBytes(path)) !== digest)
          throw Error(`Published asset mismatch: ${path}`);
      }
      await save('smoke-receipt.json', {
        sha,
        target,
        passedAt: new Date().toISOString(),
        files: Object.keys(manifest.files).length,
      });
      console.log(
        `Verified ${origin}: exact release, all public assets and four direct SPA routes.`,
      );
      break;
    } catch (error) {
      if (attempt >= 5) throw error;
      console.log('Waiting for the accepted deployment to reach the public origin.');
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }
  }
}
