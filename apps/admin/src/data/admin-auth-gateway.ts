import type { AdminUserRole } from '@/lib';

export type AdminAuthKind = 'fixture' | 'supabase';

export const MIN_ADMIN_PASSWORD_LENGTH = 12;

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
  | 'INVALID_VERIFICATION_CODE'
  | 'INVALID_LINK'
  | 'EXPIRED_LINK'
  | 'WEAK_PASSWORD'
  | 'RATE_LIMITED'
  | 'NETWORK'
  | 'UNSUPPORTED'
  | 'UNKNOWN';

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
  requestPasswordChangeVerification(): Promise<void>;
  changePassword(password: string, verificationCode: string): Promise<void>;
  /**
   * Exchanges the token an invitation link carries for a session. This is the
   * only way an invited person can authenticate: they have no password until
   * they set one at the end of the acceptance flow.
   */
  verifyEmailLink(tokenHash: string): Promise<AdminAuthSession>;
  signOut(): Promise<void>;
  subscribe(listener: (session: AdminAuthSession | null) => void): () => void;
}
