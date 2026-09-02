#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateEmailEnvironment } from './email-environment-policy.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const configPath = join(root, 'apps/api/wrangler.jsonc');
const source = readFileSync(configPath, 'utf8');

function jsonStringValue(key) {
  const match = new RegExp(`"${key}"\\s*:\\s*("(?:\\\\.|[^"\\\\])*")`).exec(source);
  if (!match) return undefined;
  return JSON.parse(match[1]);
}

const config = Object.fromEntries(
  [
    'APP_ENV',
    'DEPLOYMENT_PLATFORM',
    'RESEND_ENVIRONMENT',
    'FORMS_FROM_EMAIL',
    'FORM_NOTIFICATION_RECIPIENTS_JSON',
    'MAILCHIMP_CAMPAIGNS_ENABLED',
    'NEWSLETTER_MAILCHIMP_SYNC_ENABLED',
  ].map((key) => [key, jsonStringValue(key)]),
);
const problems = validateEmailEnvironment(config, 'development', { requireApiKey: false });

if (jsonStringValue('ALLOW_DEV_AUTH') !== 'false') problems.push('ALLOW_DEV_AUTH');
if (jsonStringValue('MAILCHIMP_CAMPAIGNS_ENABLED') !== 'false') {
  problems.push('MAILCHIMP_CAMPAIGNS_ENABLED');
}
if (jsonStringValue('NEWSLETTER_MAILCHIMP_SYNC_ENABLED') !== 'false') {
  problems.push('NEWSLETTER_MAILCHIMP_SYNC_ENABLED');
}
if (/"RESEND_API_KEY"\s*:/.test(source)) problems.push('RESEND_API_KEY must not be committed');

if (problems.length > 0) {
  console.error('Cloudflare development deployment blocked. Check:');
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log('Cloudflare development guard passed (no secret values inspected or printed).');
