import { writeFile } from 'node:fs/promises';
import console from 'node:console';
import { resolve } from 'node:path';

/*
 * OpenNext merges every dotenv file from the monorepo root into the public
 * Worker fallback bundle. The root file also serves the private API, so that
 * default would copy unrelated database credentials into web output even
 * though this app never reads them.
 *
 * Cloudflare supplies this site's two public variables from wrangler.jsonc at
 * runtime, and Next receives the same values explicitly during the build. No
 * dotenv fallback belongs in the deployed Worker, so replace all three mode
 * maps with empty objects before previewing or uploading the bundle.
 */
const outputPath = resolve('.open-next/cloudflare/next-env.mjs');
const sanitized = [
  'export const production = {};',
  'export const development = {};',
  'export const test = {};',
  '',
].join('\n');

await writeFile(outputPath, sanitized, 'utf8');
console.log('Removed monorepo dotenv fallbacks from the public Worker bundle.');
