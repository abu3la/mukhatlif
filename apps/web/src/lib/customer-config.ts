import type { CustomerConfig } from './customer-utils';
import { apiOrigin, publicWebUrl } from './config';

/** Only a public anon key crosses the server boundary. Runtime credentials keep builds portable. */
export function customerConfig(): CustomerConfig {
  const api = apiOrigin() ?? '';
  const url = process.env.MUKHTALIF_SUPABASE_URL?.trim() ?? '';
  const key = process.env.MUKHTALIF_SUPABASE_ANON_KEY?.trim() ?? '';
  if (!url || !key)
    return { apiOrigin: api, supabaseUrl: '', supabaseAnonKey: '', googleEnabled: false };
  const expected =
    api.includes('mukhtalif-development.workers.dev') ||
    api.startsWith('http://localhost') ||
    api.startsWith('http://127.0.0.1')
      ? 'acomtixjibgkauzeltsn'
      : 'pacpdxvujkjvnaeeuute';
  if (url !== `https://${expected}.supabase.co`)
    throw new Error('Customer Auth does not match this environment.');
  if (key.startsWith('sb_secret_')) throw new Error('A secret key cannot be sent to the browser.');
  if (!key.startsWith('sb_publishable_')) {
    let claim: { role?: string; ref?: string };
    try {
      claim = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
    } catch {
      throw new Error('Invalid customer public key.');
    }
    if (claim.role !== 'anon' || claim.ref !== expected)
      throw new Error('Customer Auth requires the matching public anon key.');
  }
  if (
    expected === 'acomtixjibgkauzeltsn' &&
    /^https:\/\/(staging\.)?mukhtalif\.net/.test(publicWebUrl())
  )
    throw new Error('Development auth cannot run on production.');
  return {
    apiOrigin: api,
    supabaseUrl: url,
    supabaseAnonKey: key,
    googleEnabled: process.env.MUKHTALIF_GOOGLE_AUTH_ENABLED === 'true',
  };
}
