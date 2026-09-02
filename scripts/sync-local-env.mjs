#!/usr/bin/env node
/**
 * Distributes the Supabase values from the root `.env.local` into the files
 * that actually consume them.
 *
 * One source of truth avoids the same secret drifting across three files. This
 * script never prints a value — only variable names and paths — so its output
 * is safe to share when something goes wrong.
 *
 * Nothing here touches a remote service. It reads one local file and writes
 * three, all of them gitignored.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, '.env.local');

const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const DIM = '\x1b[2m';
const OFF = '\x1b[0m';

const problems = [];
const warnings = [];

if (!existsSync(source)) {
  console.error(`${RED}✘${OFF} .env.local is missing. Copy the template and fill it in.`);
  process.exit(1);
}

/** Minimal dotenv parse: KEY="value" or KEY=value, ignoring comments. */
function parseEnv(text) {
  const values = {};
  for (const line of text.split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

const env = parseEnv(readFileSync(source, 'utf8'));

// SUPABASE_DB_URL is deliberately optional. It is only ever used to apply
// migrations with psql from a developer machine; no application reads it, it is
// never deployed, and no browser sees it. Without it, migrations are applied by
// hand through the dashboard SQL editor instead.
const REQUIRED = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];

for (const key of REQUIRED) {
  if (!env[key]) problems.push(`${key} is empty`);
}

/**
 * Reads the `role` claim from a Supabase JWT without verifying it.
 *
 * Verification is not the point: this only needs to know which key the human
 * pasted, and the claim is attacker-irrelevant here because the "attacker" is
 * a copy-paste slip.
 */
function jwtRole(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

/** 'public' | 'secret' | null, across both the legacy JWT and new key formats. */
function keyKind(token) {
  if (!token) return null;
  if (token.startsWith('sb_publishable_')) return 'public';
  if (token.startsWith('sb_secret_')) return 'secret';
  const role = jwtRole(token);
  if (role === 'anon') return 'public';
  if (role === 'service_role') return 'secret';
  return null;
}

const anonKind = keyKind(env.SUPABASE_ANON_KEY);
const serviceKind = keyKind(env.SUPABASE_SERVICE_ROLE_KEY);

// The single mistake worth failing hard on. A service_role key in the public
// slot is compiled into the browser bundle, and it bypasses row level security
// on every table. Rotating it afterwards is the only remedy.
if (anonKind === 'secret') {
  problems.push(
    'SUPABASE_ANON_KEY holds a SECRET key. That key bypasses row level security ' +
      'and would be shipped to every browser. Put it in SUPABASE_SERVICE_ROLE_KEY ' +
      'and use the public key here.',
  );
}
if (serviceKind === 'public') {
  problems.push(
    'SUPABASE_SERVICE_ROLE_KEY holds the PUBLIC key. The API would be unable to ' +
      'read application data. Swap the two values.',
  );
}
if (env.SUPABASE_ANON_KEY && env.SUPABASE_ANON_KEY === env.SUPABASE_SERVICE_ROLE_KEY) {
  problems.push('The public and secret keys are identical. One of them was pasted twice.');
}
if (env.SUPABASE_ANON_KEY && anonKind === null) {
  warnings.push('SUPABASE_ANON_KEY is not a recognised Supabase key format.');
}
if (env.SUPABASE_SERVICE_ROLE_KEY && serviceKind === null) {
  warnings.push('SUPABASE_SERVICE_ROLE_KEY is not a recognised Supabase key format.');
}

if (env.SUPABASE_URL && !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(env.SUPABASE_URL)) {
  warnings.push('SUPABASE_URL does not look like https://<ref>.supabase.co');
}

if (
  env.RESEND_DEVELOPMENT_API_KEY &&
  (env.RESEND_DEVELOPMENT_API_KEY.length < 12 ||
    env.RESEND_DEVELOPMENT_API_KEY.length > 512 ||
    !/^[\x21-\x7E]+$/.test(env.RESEND_DEVELOPMENT_API_KEY))
) {
  problems.push('RESEND_DEVELOPMENT_API_KEY is not a valid Resend API key value.');
}

if (env.SUPABASE_DB_URL) {
  if (!env.SUPABASE_DB_URL.startsWith('postgresql://')) {
    problems.push('SUPABASE_DB_URL must start with postgresql://');
  }
  if (env.SUPABASE_DB_URL.includes(':6543')) {
    // Migration 0015 opens an explicit transaction and takes an advisory lock.
    // Transaction pooling breaks both, and the failure is obscure.
    problems.push(
      'SUPABASE_DB_URL uses port 6543 (transaction pooler). Migration 0015 needs ' +
        'session mode — use the Session pooler string on port 5432.',
    );
  }
  if (env.SUPABASE_DB_URL.includes('[YOUR-PASSWORD]')) {
    problems.push('SUPABASE_DB_URL still contains the [YOUR-PASSWORD] placeholder.');
  }
}

if (problems.length > 0) {
  console.error(`\n${RED}✘ Nothing was written.${OFF}\n`);
  for (const problem of problems) console.error(`  ${RED}•${OFF} ${problem}`);
  console.error('');
  process.exit(1);
}

const url = env.SUPABASE_URL.replace(/\/$/, '');

const targets = [
  {
    path: join(root, 'apps/api/.dev.vars'),
    label: 'Worker (local)',
    keys: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'RESEND_DEVELOPMENT_API_KEY (optional)'],
    body: `# Generated by \`pnpm env:sync\` from the root .env.local. Do not edit by hand.
# Gitignored. The service-role key must never leave this machine or the Worker.
APP_ENV="development"
DEPLOYMENT_PLATFORM="cloudflare-workers"

# Local identities stay available until Supabase Auth is wired end to end.
# Production sets this false from wrangler.jsonc; the gate needs APP_ENV
# development *and* this flag, and both fail closed.
ALLOW_DEV_AUTH="true"

CORS_ALLOWED_ORIGINS="http://localhost:3001,http://127.0.0.1:3001,http://localhost:3000,http://127.0.0.1:3000"

SUPABASE_URL="${url}"
SUPABASE_SERVICE_ROLE_KEY="${env.SUPABASE_SERVICE_ROLE_KEY}"

STUDIO_INVITE_REDIRECT_URL="http://127.0.0.1:3001/invite"

# Mailchimp remains fail-closed in generated local configuration. A developer
# must opt in explicitly after adding the complete campaign settings by hand.
MAILCHIMP_CAMPAIGNS_ENABLED="false"

# Form mail is locked to the development Resend project and the owner's test
# inbox. Keep the production key out of .env.local on development machines.
RESEND_ENVIRONMENT="development"
RESEND_API_KEY="${env.RESEND_DEVELOPMENT_API_KEY ?? ''}"
FORMS_FROM_EMAIL="forms@devmail.mukhtalif.net"
FORM_NOTIFICATION_RECIPIENTS_JSON='{"sponsorship":["aaahashmi95@gmail.com"],"partnership":["aaahashmi95@gmail.com"],"guest_suggestion":["aaahashmi95@gmail.com"],"careers":["aaahashmi95@gmail.com"],"production_service":["aaahashmi95@gmail.com"],"guest_review":["aaahashmi95@gmail.com"]}'
`,
  },
  {
    path: join(root, 'apps/admin/.env.local'),
    label: 'Admin Studio (browser)',
    keys: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'],
    body: `# Generated by \`pnpm env:sync\` from the root .env.local. Do not edit by hand.
# Everything here is compiled into the browser bundle: public values only.
VITE_ADMIN_DATA_SOURCE=hono
VITE_API_URL=http://127.0.0.1:8787

VITE_SUPABASE_URL=${url}
VITE_SUPABASE_ANON_KEY=${env.SUPABASE_ANON_KEY}
`,
  },
  {
    path: join(root, 'apps/web/.env.local'),
    label: 'Public site (server only)',
    keys: ['MUKHTALIF_API_URL', 'PUBLIC_WEB_URL'],
    // The site reads the API server-side and never touches Supabase directly,
    // so no Supabase value belongs in this file at all.
    body: `# Generated by \`pnpm env:sync\` from the root .env.local. Do not edit by hand.
# The site never calls Supabase: every read goes through the API, server-side.
MUKHTALIF_API_URL=http://127.0.0.1:8787
PUBLIC_WEB_URL=http://localhost:3000
`,
  },
];

for (const target of targets) {
  writeFileSync(target.path, target.body, { mode: 0o600 });
}

console.log(`\n${GREEN}✓${OFF} Wrote ${targets.length} files from .env.local\n`);
for (const target of targets) {
  const relative = target.path.slice(root.length + 1);
  console.log(`  ${GREEN}•${OFF} ${relative}  ${DIM}— ${target.label}${OFF}`);
  console.log(`    ${DIM}${target.keys.join(', ')}${OFF}`);
}
if (warnings.length > 0) {
  console.log('');
  for (const warning of warnings) console.log(`  ${YELLOW}!${OFF} ${warning}`);
}
console.log(
  `\n${DIM}Key check: public=${anonKind ?? 'unknown'}, secret=${serviceKind ?? 'unknown'}${OFF}`,
);
if (!env.SUPABASE_DB_URL) {
  console.log(
    `\n  ${DIM}SUPABASE_DB_URL is unset — migrations will be applied by hand through` +
      ` the dashboard SQL editor.${OFF}`,
  );
}
console.log(`\n${DIM}No value was printed. All three files are gitignored.${OFF}\n`);
