import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { customerConfig } from './customer-config';

const original = { ...process.env };
const devRef = 'acomtixjibgkauzeltsn';
const prodRef = 'pacpdxvujkjvnaeeuute';
const key = (role = 'anon', ref = devRef) =>
  `header.${Buffer.from(JSON.stringify({ role, ref })).toString('base64url')}.signature`;
beforeEach(() => {
  process.env.MUKHTALIF_API_URL = 'https://mukhtalif-api.mukhtalif-development.workers.dev';
  process.env.PUBLIC_WEB_URL = 'https://web.mukhtalif-development.workers.dev';
  process.env.MUKHTALIF_SUPABASE_URL = `https://${devRef}.supabase.co`;
  process.env.MUKHTALIF_SUPABASE_ANON_KEY = key();
  delete process.env.MUKHTALIF_GOOGLE_AUTH_ENABLED;
});
afterEach(() => {
  process.env = { ...original };
});

describe('customer public auth configuration', () => {
  it('allows empty configuration without leaking another environment', () => {
    delete process.env.MUKHTALIF_SUPABASE_URL;
    delete process.env.MUKHTALIF_SUPABASE_ANON_KEY;
    expect(customerConfig().supabaseAnonKey).toBe('');
    expect(customerConfig().googleEnabled).toBe(false);
  });
  it('exposes the matching public anon key and keeps Google off by default', () => {
    expect(customerConfig()).toMatchObject({
      supabaseUrl: `https://${devRef}.supabase.co`,
      supabaseAnonKey: key(),
      googleEnabled: false,
    });
  });
  it('enables Google only through its explicit configuration', () => {
    process.env.MUKHTALIF_GOOGLE_AUTH_ENABLED = 'true';
    expect(customerConfig().googleEnabled).toBe(true);
  });
  it.each(['sb_secret_test', key('service_role'), key('anon', prodRef), 'malformed'])(
    'rejects unsafe browser key %s',
    (value) => {
      process.env.MUKHTALIF_SUPABASE_ANON_KEY = value;
      expect(() => customerConfig()).toThrow();
    },
  );
  it('rejects a mismatched Supabase project URL', () => {
    process.env.MUKHTALIF_SUPABASE_URL = `https://${prodRef}.supabase.co`;
    expect(() => customerConfig()).toThrow(/environment/);
  });
  it.each(['https://mukhtalif.net', 'https://staging.mukhtalif.net'])(
    'rejects development auth on %s',
    (url) => {
      process.env.PUBLIC_WEB_URL = url;
      expect(() => customerConfig()).toThrow(/Development auth/);
    },
  );
  it('accepts the isolated production project only with the production API', () => {
    process.env.MUKHTALIF_API_URL = 'https://api.mukhtalif.net';
    process.env.PUBLIC_WEB_URL = 'https://staging.mukhtalif.net';
    process.env.MUKHTALIF_SUPABASE_URL = `https://${prodRef}.supabase.co`;
    process.env.MUKHTALIF_SUPABASE_ANON_KEY = key('anon', prodRef);
    expect(customerConfig().supabaseUrl).toBe(`https://${prodRef}.supabase.co`);
  });
});
