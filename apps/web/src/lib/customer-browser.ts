import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CustomerConfig } from './customer-utils';

// This map is only populated in the browser, from a provider effect. Server
// rendering never creates a client or shares an authenticated SDK between requests.
const browserClients = new Map<string, SupabaseClient>();

export function customerBrowserClient(config: CustomerConfig): SupabaseClient | null {
  if (typeof window === 'undefined' || !config.supabaseUrl || !config.supabaseAnonKey) return null;
  const key = `${config.supabaseUrl}:${config.supabaseAnonKey}`;
  const existing = browserClients.get(key);
  if (existing) return existing;
  const client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'mukhtalif-customer-auth',
    },
  });
  browserClients.set(key, client);
  return client;
}
