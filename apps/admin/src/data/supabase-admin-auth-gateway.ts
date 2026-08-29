import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import {
  AdminAuthError,
  type AdminAuthGateway,
  type AdminAuthSession,
  type EmailLinkPurpose,
} from './admin-auth-gateway';

export interface SupabaseAdminAuthGatewayConfig {
  readonly url: string;
  readonly anonKey: string;
}

function hasSupabaseInvitationSessionInUrl(): boolean {
  if (typeof window === 'undefined' || window.location.pathname !== '/invite') return false;

  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const type = fragment.get('type');
  return (
    (type === 'invite' || type === 'magiclink' || type === 'email') &&
    Boolean(
      fragment.get('access_token') &&
        fragment.get('refresh_token') &&
        fragment.get('expires_in') &&
        fragment.get('token_type'),
    )
  );
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
  // Distinguished from a malformed link because the remedy differs: an expired
  // link has to be sent again, a bad one usually means a truncated paste.
  if (normalized.includes('expired')) {
    return new AdminAuthError('EXPIRED_LINK', error.message);
  }
  if (normalized.includes('otp') || normalized.includes('token')) {
    return new AdminAuthError('INVALID_LINK', error.message);
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
  private readonly hasInvitationSessionInUrl: boolean;
  private readonly listeners = new Set<(session: AdminAuthSession | null) => void>();
  private session: AdminAuthSession | null = null;

  constructor(config: SupabaseAdminAuthGatewayConfig, client?: SupabaseClient) {
    // Read this before the client starts. Supabase removes a successfully
    // exchanged fragment, so checking later could accidentally turn an
    // ordinary persisted Studio session into an invitation credential.
    this.hasInvitationSessionInUrl = hasSupabaseInvitationSessionInUrl();
    this.client =
      client ??
      createClient(config.url, config.anonKey, {
        auth: {
          autoRefreshToken: true,
          // Supabase's default invitation links deliver the verified session in
          // the URL fragment. Limit detection to that exact callback so opening
          // /invite normally cannot consume a current manager's session.
          detectSessionInUrl: this.hasInvitationSessionInUrl,
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

  async restoreInvitationSession(): Promise<AdminAuthSession | null> {
    if (!this.hasInvitationSessionInUrl) return null;

    const { data, error } = await this.client.auth.getSession();
    if (error) throw mapAuthError(error);

    // The Supabase client removes the hash only after it has validated and
    // stored the callback session. If it remains, do not fall back to any
    // older session already persisted in this browser.
    if (hasSupabaseInvitationSessionInUrl()) return null;

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

  async verifyEmailLink(
    tokenHash: string,
    purpose: EmailLinkPurpose,
  ): Promise<AdminAuthSession> {
    // A link carries token_hash rather than the six-digit token, and it
    // identifies the address itself, so no email is supplied here.
    const { data, error } = await this.client.auth.verifyOtp({
      token_hash: tokenHash,
      type: purpose === 'invite' ? 'invite' : 'email',
    });
    if (error) throw mapAuthError(error);
    const session = mapSession(data.session);
    if (!session) {
      throw new AdminAuthError('UNKNOWN', 'Supabase returned no session after verification.');
    }
    this.session = session;
    return session;
  }

  async sendSignInEmail(email: string): Promise<void> {
    // shouldCreateUser is false so this can never mint an account: it only ever
    // re-reaches somebody an administrator already invited.
    const { error } = await this.client.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/invite`,
      },
    });
    if (error) throw mapAuthError(error);
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
