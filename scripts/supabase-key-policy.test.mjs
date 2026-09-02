import assert from 'node:assert/strict';
import test from 'node:test';
import { supabaseKeyKind, supabaseProjectRef } from './supabase-key-policy.mjs';

function legacyKey(role) {
  const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'HS256' })}.${part({ role })}.signature`;
}

test('classifies current and legacy Supabase browser and server keys', () => {
  assert.equal(supabaseKeyKind('sb_publishable_browser_key'), 'public');
  assert.equal(supabaseKeyKind('sb_secret_server_key'), 'secret');
  assert.equal(supabaseKeyKind(legacyKey('anon')), 'public');
  assert.equal(supabaseKeyKind(legacyKey('service_role')), 'secret');
  assert.equal(supabaseKeyKind('unknown-key-format'), null);
});

test('extracts only an exact standard Supabase project origin', () => {
  assert.equal(
    supabaseProjectRef('https://abcdefghijklmnopqrst.supabase.co/'),
    'abcdefghijklmnopqrst',
  );
  for (const unsafe of [
    'https://pacpdxvujkjvnaeeuute.supabase.co.attacker.example',
    'https://abcdefghijklmnopqrst.supabase.co/path',
    'http://abcdefghijklmnopqrst.supabase.co',
    'https://short.supabase.co',
  ]) {
    assert.equal(supabaseProjectRef(unsafe), null);
  }
});
