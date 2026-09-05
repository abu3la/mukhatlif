import { access, cp, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Preserve Next's monorepo dependency layout. A small root launcher lets the
// provider discover server.js without relocating Next's generated server.
export async function prepareWebOutput(repositoryRoot) {
  const web = join(repositoryRoot, 'apps/web');
  const standalone = join(web, '.next/standalone');
  const application = join(standalone, 'apps/web');
  await access(join(application, 'server.js'));
  await access(join(application, '.next/BUILD_ID'));
  await cp(join(web, '.next/static'), join(application, '.next/static'), { recursive: true });
  await cp(join(web, 'public'), join(application, 'public'), { recursive: true });
  await writeFile(join(standalone, 'server.js'), "require('./apps/web/server.js');\n");
  console.log('Hostinger Web standalone server and static assets prepared.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await prepareWebOutput(fileURLToPath(new URL('../', import.meta.url)));
}
