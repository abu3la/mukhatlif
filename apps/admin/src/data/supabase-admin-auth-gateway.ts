import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import {
  AdminAuthError,
  type AdminAuthGateway,
  type AdminAuthSession,
} from './admin-auth-gateway';

export interface SupabaseAdminAuthGatewayConfig {
  readonly url: string;
  readonly anonKey: string;
}

function mapSession(session: Session | null): AdminAuthSession | null {
  const email = session?.user.email;
  if (!session || !email) return null;
  return {
    subject: { id: session.user.id, email },
    accessToken: session.access_token,
  };
}

function mapAuthError(error: { message: string; status?: number; code?: string }): AdminAuthError {
  const normalized = `${error.code ?? ''} ${error.message}`.toLowerCase();
  if (error.status === 429 || normalized.includes('rate')) {
    return new AdminAuthError('RATE_LIMITED', error.message);
  }
  if (
    error.status === 400 ||
    normalized.includes('invalid login') ||
    normalized.includes('invalid credentials')
  ) {
    return new AdminAuthError('INVALID_CREDENTIALS', error.message);
  }
  if (normalized.includes('fetch') || normalized.includes('network')) {
    return new AdminAuthError('NETWORK', error.message);
  }
  return new AdminAuthError('UNKNOWN', error.message);
}

export class SupabaseAdminAuthGateway implements AdminAuthGateway {
  readonly kind = 'supabase' as const;
  readonly demoAccounts = [] as const;

  private readonly client: SupabaseClient;
  private readonly listeners = new Set<(session: AdminAuthSession | null) => void>();
  private session: AdminAuthSession | null = null;

  constructor(config: SupabaseAdminAuthGatewayConfig, client?: SupabaseClient) {
    this.client =
      client ??
      createClient(config.url, config.anonKey, {
        auth: {
          autoRefreshToken: true,
          detectSessionInUrl: false,
          persistSession: true,
        },
      });

    this.client.auth.onAuthStateChange((_event, session) => {
      this.session = mapSession(session);
      for (const listener of this.listeners) listener(this.session);
    });
  }

  getCurrentSession(): AdminAuthSession | null {
    return this.session;
  }

  getAccessToken(): string | null {
    return this.session?.accessToken ?? null;
  }

  async restoreSession(): Promise<AdminAuthSession | null> {
    const { data, error } = await this.client.auth.getSession();
    if (error) throw mapAuthError(error);
    this.session = mapSession(data.session);
    return this.session;
  }

  async signInWithPassword(email: string, password: string): Promise<AdminAuthSession> {
    const { data, error } = await this.client.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw mapAuthError(error);
    const session = mapSession(data.session);
    if (!session) {
      throw new AdminAuthError('UNKNOWN', 'Supabase returned no session after sign-in.');
    }
    this.session = session;
    return session;
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut();
    if (error) throw mapAuthError(error);
    this.session = null;
  }

  subscribe(listener: (session: AdminAuthSession | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export function createSupabaseAdminAuthGateway(
  config: SupabaseAdminAuthGatewayConfig,
): AdminAuthGateway {
  return new SupabaseAdminAuthGateway(config);
}
