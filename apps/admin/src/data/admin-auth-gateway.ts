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
  | 'RATE_LIMITED'
  | 'NETWORK'
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
  signInWithPassword(email: string, password: string): Promise<AdminAuthSession>;
  signOut(): Promise<void>;
  subscribe(listener: (session: AdminAuthSession | null) => void): () => void;
}
