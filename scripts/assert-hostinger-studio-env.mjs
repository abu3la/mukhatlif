#!/usr/bin/env node
import { supabaseKeyKind, supabaseProjectRef } from './supabase-key-policy.mjs';

const problems = [];
const apiUrl = String(process.env.VITE_API_URL ?? '')
  .trim()
  .replace(/\/$/, '');
const supabaseUrl = String(process.env.VITE_SUPABASE_URL ?? '').trim();
const anonKey = String(process.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
const expectedSupabaseRef = String(process.env.PRODUCTION_SUPABASE_PROJECT_REF ?? '').trim();

if (process.env.VITE_ADMIN_DATA_SOURCE !== 'hono') problems.push('VITE_ADMIN_DATA_SOURCE');
if (apiUrl !== 'https://api.mukhtalif.net') problems.push('VITE_API_URL');
if (String(process.env.VITE_DEV_USER_ID ?? '').trim()) problems.push('VITE_DEV_USER_ID');

if (!/^[a-z0-9]{20}$/.test(expectedSupabaseRef)) {
  problems.push('PRODUCTION_SUPABASE_PROJECT_REF');
}
const actualSupabaseRef = supabaseProjectRef(supabaseUrl);
if (!actualSupabaseRef || actualSupabaseRef !== expectedSupabaseRef) {
  problems.push('VITE_SUPABASE_URL (must match the pinned production project)');
}
if (supabaseKeyKind(anonKey) !== 'public') {
  problems.push('VITE_SUPABASE_ANON_KEY (must be a public anon/publishable key)');
}

if (problems.length > 0) {
  console.error('Hostinger Studio environment blocked. Check:');
  for (const problem of [...new Set(problems)]) console.error(`- ${problem}`);
  process.exit(1);
}

console.log('Hostinger Studio environment guard passed (no key values printed).');
