import { createContext, useContext } from 'react';
import type { DemoAdminAccount } from '@/data';
import type { AdminViewer } from '@/lib';

export type AdminAuthStatus = 'restoring' | 'signed-out' | 'authenticated' | 'denied' | 'error';

export interface AdminAuthContextValue {
  readonly status: AdminAuthStatus;
  readonly viewer: AdminViewer | null;
  readonly deniedEmail: string | null;
  readonly error: Error | null;
  readonly isSubmitting: boolean;
  readonly demoAccounts: readonly DemoAdminAccount[];
  signIn(email: string, password: string): Promise<void>;
  requestPasswordChangeVerification(): Promise<void>;
  changePassword(password: string, verificationCode: string): Promise<void>;
  signOut(): Promise<void>;
  retry(): Promise<void>;
}

export const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function useAdminAuth(): AdminAuthContextValue {
  const context = useContext(AdminAuthContext);
  if (!context) throw new Error('useAdminAuth must be used inside AdminAuthProvider.');
  return context;
}
