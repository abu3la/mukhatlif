#!/usr/bin/env node

const problems = [];
const apiUrl = String(process.env.VITE_API_URL ?? '')
  .trim()
  .replace(/\/$/, '');
const supabaseUrl = String(process.env.VITE_SUPABASE_URL ?? '').trim();
const anonKey = String(process.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

if (process.env.VITE_ADMIN_DATA_SOURCE !== 'hono') problems.push('VITE_ADMIN_DATA_SOURCE');
if (apiUrl !== 'https://api.mukhtalif.net') problems.push('VITE_API_URL');
if (String(process.env.VITE_DEV_USER_ID ?? '').trim()) problems.push('VITE_DEV_USER_ID');

try {
  const url = new URL(supabaseUrl);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname)
  ) {
    problems.push('VITE_SUPABASE_URL');
  }
  if (url.hostname === 'pacpdxvujkjvnaeeuute.supabase.co') {
    problems.push('VITE_SUPABASE_URL (development project is forbidden)');
  }
} catch {
  problems.push('VITE_SUPABASE_URL');
}

if (anonKey.length < 20 || /\s/.test(anonKey)) problems.push('VITE_SUPABASE_ANON_KEY');

if (problems.length > 0) {
  console.error('Hostinger Studio environment blocked. Check:');
  for (const problem of [...new Set(problems)]) console.error(`- ${problem}`);
  process.exit(1);
}

console.log('Hostinger Studio environment guard passed (no key values printed).');
