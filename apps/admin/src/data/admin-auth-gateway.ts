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
  | 'INVALID_CODE'
  | 'EXPIRED_CODE'
  | 'RATE_LIMITED'
  | 'NETWORK'
  | 'UNSUPPORTED'
  | 'UNKNOWN';

/**
 * Which email carried the code being verified.
 *
 * Supabase issues invitation tokens and freshly requested sign-in codes under
 * different types, and verifying with the wrong one fails. The screen knows
 * which email the person is reading from, so it says so rather than guessing.
 */
export type EmailCodePurpose = 'invite' | 'signin';

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
  signInWithPassword(email: string, password: string): Promise<AdminAuthSession>;
  /**
   * Exchanges an emailed code for a session. This is the only way an invited
   * person can authenticate: they have no password until they set one.
   */
  verifyEmailCode(
    email: string,
    code: string,
    purpose: EmailCodePurpose,
  ): Promise<AdminAuthSession>;
  /**
   * Exchanges the token an invitation link carries in its query string.
   * Supabase's default invite email sends a link rather than a visible code,
   * so this is the path that works before custom SMTP is configured.
   */
  verifyEmailLink(tokenHash: string, purpose: EmailCodePurpose): Promise<AdminAuthSession>;
  /** Sends a fresh sign-in code, for an invitation email that expired. */
  sendEmailCode(email: string): Promise<void>;
  signOut(): Promise<void>;
  subscribe(listener: (session: AdminAuthSession | null) => void): () => void;
}
