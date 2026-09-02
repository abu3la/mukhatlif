import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import console from 'node:console';
import { resolve } from 'node:path';
import process from 'node:process';
import { URL } from 'node:url';

/*
 * Metadata such as canonical URLs is evaluated during `next build`, before
 * Wrangler can provide runtime bindings. Read the two public deployment values
 * from the same wrangler.jsonc that deploys the Worker so build-time metadata
 * and runtime requests cannot silently drift to different origins.
 */
const configSource = await readFile(resolve('wrangler.jsonc'), 'utf8');

function deploymentUrl(name) {
  const pattern = new RegExp(`"${name}"\\s*:\\s*"([^"]+)"`, 'g');
  const matches = [...configSource.matchAll(pattern)];
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${name} value in wrangler.jsonc.`);
  }

  const value = matches[0][1];
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error(`${name} must be a credential-free HTTPS URL.`);
  }
  return url.toString().replace(/\/$/, '');
}

const deploymentEnv = {
  MUKHTALIF_API_URL: deploymentUrl('MUKHTALIF_API_URL'),
  PUBLIC_WEB_URL: deploymentUrl('PUBLIC_WEB_URL'),
};

const child = spawn('opennextjs-cloudflare', ['build'], {
  stdio: 'inherit',
  env: { ...process.env, ...deploymentEnv },
});

child.on('error', (error) => {
  console.error(`Unable to start the OpenNext build: ${error.message}`);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`OpenNext build stopped by ${signal}.`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
