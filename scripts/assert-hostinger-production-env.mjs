#!/usr/bin/env node
import { validateEmailEnvironment } from './email-environment-policy.mjs';
import { supabaseKeyKind, supabaseProjectRef } from './supabase-key-policy.mjs';

const problems = validateEmailEnvironment(process.env, 'production');
const mediaOrigin = String(process.env.MEDIA_PUBLIC_ORIGIN ?? '');
let mediaHostname = '';
try {
  const mediaUrl = new URL(mediaOrigin);
  mediaHostname = mediaUrl.hostname;
  if (
    mediaUrl.protocol !== 'https:' ||
    mediaUrl.username ||
    mediaUrl.password ||
    mediaUrl.pathname !== '/' ||
    mediaUrl.search ||
    mediaUrl.hash
  ) {
    problems.push('MEDIA_PUBLIC_ORIGIN');
  }
} catch {
  problems.push('MEDIA_PUBLIC_ORIGIN');
}
if (mediaHostname.endsWith('.workers.dev')) problems.push('MEDIA_PUBLIC_ORIGIN');
if (mediaOrigin !== 'https://api.mukhtalif.net') problems.push('MEDIA_PUBLIC_ORIGIN');
if (process.env.ALLOW_DEV_AUTH !== 'false') problems.push('ALLOW_DEV_AUTH');

const supabaseUrl = String(process.env.SUPABASE_URL ?? '').trim();
const expectedSupabaseRef = String(process.env.PRODUCTION_SUPABASE_PROJECT_REF ?? '').trim();
if (!/^[a-z0-9]{20}$/.test(expectedSupabaseRef)) {
  problems.push('PRODUCTION_SUPABASE_PROJECT_REF');
}
if (supabaseProjectRef(supabaseUrl) !== expectedSupabaseRef) {
  problems.push('SUPABASE_URL (must match the pinned production project)');
}
const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
if (supabaseKeyKind(serviceRoleKey) !== 'secret') {
  problems.push('SUPABASE_SERVICE_ROLE_KEY (must be a secret/service_role key)');
}
if (process.env.STUDIO_INVITE_REDIRECT_URL !== 'https://studio.mukhtalif.net/invite') {
  problems.push('STUDIO_INVITE_REDIRECT_URL');
}
const rateLimitSecret = String(process.env.FORM_RATE_LIMIT_SECRET ?? '');
const rateLimitBytes = Buffer.byteLength(rateLimitSecret, 'utf8');
if (rateLimitBytes < 32 || rateLimitBytes > 512) problems.push('FORM_RATE_LIMIT_SECRET');

const corsOrigins = String(process.env.CORS_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);
if (
  corsOrigins.includes('*') ||
  !corsOrigins.includes('https://studio.mukhtalif.net') ||
  !corsOrigins.includes('https://staging.mukhtalif.net')
) {
  problems.push('CORS_ALLOWED_ORIGINS');
}

const r2Names = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_AUDIO_BUCKET',
  'R2_MEDIA_BUCKET',
];
if (r2Names.some((name) => !String(process.env[name] ?? '').trim())) {
  problems.push('R2 configuration');
}
if (!/^[a-f0-9]{32}$/i.test(String(process.env.R2_ACCOUNT_ID ?? ''))) {
  problems.push('R2_ACCOUNT_ID');
}
const r2AccessKey = String(process.env.R2_ACCESS_KEY_ID ?? '');
if (r2AccessKey.length < 8 || r2AccessKey.length > 256 || /\s/.test(r2AccessKey)) {
  problems.push('R2_ACCESS_KEY_ID');
}
const r2Secret = String(process.env.R2_SECRET_ACCESS_KEY ?? '');
if (r2Secret.length < 16 || r2Secret.length > 512 || /\s/.test(r2Secret)) {
  problems.push('R2_SECRET_ACCESS_KEY');
}
if (process.env.R2_AUDIO_BUCKET !== 'mukhtalif-audio') problems.push('R2_AUDIO_BUCKET');
if (process.env.R2_MEDIA_BUCKET !== 'mukhtalif-media') problems.push('R2_MEDIA_BUCKET');

const trustedProxyHops = Number(process.env.TRUST_PROXY_HOPS);
if (!Number.isSafeInteger(trustedProxyHops) || trustedProxyHops < 1 || trustedProxyHops > 5) {
  problems.push('TRUST_PROXY_HOPS');
}

if (problems.length > 0) {
  console.error('Hostinger production environment blocked. Check:');
  for (const problem of [...new Set(problems)]) console.error(`- ${problem}`);
  process.exit(1);
}

console.log('Hostinger production guard passed (no secret values printed).');
