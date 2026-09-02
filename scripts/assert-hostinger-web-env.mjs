#!/usr/bin/env node

const problems = [];
const apiUrl = String(process.env.MUKHTALIF_API_URL ?? '')
  .trim()
  .replace(/\/$/, '');
const publicWebUrl = String(process.env.PUBLIC_WEB_URL ?? '')
  .trim()
  .replace(/\/$/, '');

if (apiUrl !== 'https://api.mukhtalif.net') problems.push('MUKHTALIF_API_URL');
if (publicWebUrl !== 'https://staging.mukhtalif.net') problems.push('PUBLIC_WEB_URL');

if (problems.length > 0) {
  console.error('Hostinger staging Web environment blocked. Check:');
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log('Hostinger staging Web environment guard passed.');
