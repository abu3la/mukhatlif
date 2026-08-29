import type { AdminUserRole } from '@/lib';

export type AdminAuthKind = 'fixture' | 'supabase';

export interface AdminAuthSubject {
  readonly id: string;
  readonly email: string;
}

export interface AdminAuthSession {
  readonly subject: AdminAuthSubject;
  readonly accessToken: string | null;
}

export interface DemoAdminAccount extends AdminAuthSubject {
  readonly name: string;
  readonly password: string;
  readonly role: AdminUserRole;
  readonly locale: 'ar' | 'en';
}

export type AdminAuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'INVALID_LINK'
  | 'EXPIRED_LINK'
  | 'RATE_LIMITED'
  | 'NETWORK'
  | 'UNSUPPORTED'
  | 'UNKNOWN';

/**
 * Which email the link came from.
 *
 * Supabase issues invitation tokens and re-sent sign-in tokens under different
 * types, and verifying with the wrong one fails. The link says which it is, so
 * this is read rather than guessed.
 */
export type EmailLinkPurpose = 'invite' | 'signin';

export class AdminAuthError extends Error {
  readonly code: AdminAuthErrorCode;

  constructor(code: AdminAuthErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AdminAuthError';
    this.code = code;
  }
}

export interface AdminAuthGateway {
  readonly kind: AdminAuthKind;
  readonly demoAccounts: readonly DemoAdminAccount[];

  getCurrentSession(): AdminAuthSession | null;
  getAccessToken(): string | null;
  restoreSession(): Promise<AdminAuthSession | null>;
  /**
   * Restores only the session Supabase just received in a default invitation
   * URL. It must never fall back to an unrelated persisted Studio session.
   */
  restoreInvitationSession(): Promise<AdminAuthSession | null>;
  signInWithPassword(email: string, password: string): Promise<AdminAuthSession>;
  /**
   * Exchanges the token an invitation link carries for a session. This is the
   * only way an invited person can authenticate: they have no password until
   * they set one at the end of the acceptance flow.
   */
  verifyEmailLink(tokenHash: string, purpose: EmailLinkPurpose): Promise<AdminAuthSession>;
  /** Sends a fresh sign-in link, for an invitation link that expired. */
  sendSignInEmail(email: string): Promise<void>;
  signOut(): Promise<void>;
  subscribe(listener: (session: AdminAuthSession | null) => void): () => void;
}
