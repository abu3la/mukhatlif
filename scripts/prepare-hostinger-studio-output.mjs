import { copyFile, readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = resolve(dirname(scriptPath), '..');

export const HOSTINGER_SPA_FALLBACK_MARKER = 'mukhtalif-hostinger-spa-fallback-v1';

async function isRegularFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

export function assertSafeSpaFallback(contents) {
  if (/^\s*RewriteRule\b[^\n]*\[(?:[^\]]*,)?R(?:=\d+)?(?:,|\])/im.test(contents)) {
    throw new Error('Hostinger Studio SPA fallback must use an internal rewrite, not a redirect.');
  }

  const requiredPatterns = [
    [HOSTINGER_SPA_FALLBACK_MARKER, 'version marker'],
    [/^\s*RewriteEngine\s+On\s*$/m, 'RewriteEngine On'],
    [/^\s*RewriteCond\s+%\{REQUEST_FILENAME\}\s+-f\s+\[OR\]\s*$/m, 'existing-file guard'],
    [/^\s*RewriteCond\s+%\{REQUEST_FILENAME\}\s+-d\s*$/m, 'existing-directory guard'],
    [/^\s*RewriteRule\s+\^\s+-\s+\[L\]\s*$/m, 'existing-path pass-through'],
    [/^\s*RewriteRule\s+\^\s+index\.html\s+\[L\]\s*$/m, 'internal index fallback'],
  ];

  for (const [pattern, label] of requiredPatterns) {
    const matches = typeof pattern === 'string' ? contents.includes(pattern) : pattern.test(contents);
    if (!matches) throw new Error(`Hostinger Studio SPA fallback is missing ${label}.`);
  }

}

export async function prepareHostingerStudioOutput({
  sourcePath = join(repositoryRoot, 'apps/admin/hostinger/.htaccess'),
  outputDirectory = join(repositoryRoot, 'apps/admin/dist'),
} = {}) {
  const indexPath = join(outputDirectory, 'index.html');
  if (!(await isRegularFile(indexPath))) {
    throw new Error(`Hostinger Studio output is missing ${indexPath}; run the Vite build first.`);
  }

  const source = await readFile(sourcePath, 'utf8');
  assertSafeSpaFallback(source);

  const destinationPath = join(outputDirectory, '.htaccess');
  await copyFile(sourcePath, destinationPath);

  const written = await readFile(destinationPath, 'utf8');
  if (written !== source) {
    throw new Error('Hostinger Studio SPA fallback was not copied byte-for-byte.');
  }

  return destinationPath;
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  prepareHostingerStudioOutput()
    .then(() => {
      console.log('Hostinger Studio SPA fallback prepared (no environment values printed).');
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
