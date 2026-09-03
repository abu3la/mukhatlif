import {
  AdminAuthError,
  type AdminAuthGateway,
  type AdminAuthSession,
  type DemoAdminAccount,
} from './admin-auth-gateway';

const STORAGE_KEY = 'mukhtalif-admin.fixture-session.v1';

/**
 * Shared only by accounts created in the in-memory meeting demo. It is never
 * used by the Hono or Supabase authentication paths.
 */
export const FIXTURE_CREATED_ACCOUNT_PASSWORD = 'MukhtalifDemo2026!';
export const FIXTURE_PASSWORD_VERIFICATION_CODE = '246810';

export const FIXTURE_ADMIN_ACCOUNTS = [
  {
    id: 'studio_member_admin_badr',
    name: 'بدر القحطاني',
    email: 'admin@demo.mukhtalif.local',
    password: 'Admin123!',
    role: 'admin',
    locale: 'ar',
  },
  {
    id: 'studio_member_editor_layan',
    name: 'ليان السبيعي',
    email: 'editor@demo.mukhtalif.local',
    password: 'Editor123!',
    role: 'editor',
    locale: 'ar',
  },
] as const satisfies readonly DemoAdminAccount[];

export interface FixtureAdminAuthGatewayOptions {
  readonly storage?: Storage | null;
  readonly accounts?: readonly DemoAdminAccount[];
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function getBrowserStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export class FixtureAdminAuthGateway implements AdminAuthGateway {
  readonly kind = 'fixture' as const;

  private readonly storage: Storage | null;
  private readonly accounts: DemoAdminAccount[];
  private readonly listeners = new Set<(session: AdminAuthSession | null) => void>();
  private session: AdminAuthSession | null = null;
  private passwordVerificationRequested = false;

  constructor(options: FixtureAdminAuthGatewayOptions = {}) {
    this.accounts = (options.accounts ?? FIXTURE_ADMIN_ACCOUNTS).map((account) => ({
      ...account,
    }));
    this.storage = options.storage === undefined ? getBrowserStorage() : options.storage;
  }

  get demoAccounts(): readonly DemoAdminAccount[] {
    return this.accounts;
  }

  registerAccount(account: Omit<DemoAdminAccount, 'password'>): DemoAdminAccount {
    const normalizedEmail = normalizeEmail(account.email);
    if (
      this.accounts.some(
        (candidate) =>
          candidate.id === account.id || normalizeEmail(candidate.email) === normalizedEmail,
      )
    ) {
      throw new Error('The fixture authentication account already exists.');
    }

    const registered: DemoAdminAccount = {
      ...account,
      email: normalizedEmail,
      password: FIXTURE_CREATED_ACCOUNT_PASSWORD,
    };
    this.accounts.push(registered);
    return { ...registered };
  }

  updateAccountRole(id: string, role: DemoAdminAccount['role']): DemoAdminAccount | null {
    const index = this.accounts.findIndex((account) => account.id === id);
    if (index < 0) return null;
    const updated: DemoAdminAccount = { ...this.accounts[index], role };
    this.accounts[index] = updated;
    return { ...updated };
  }

  getCurrentSession(): AdminAuthSession | null {
    return this.session;
  }

  getAccessToken(): string | null {
    return null;
  }

  async restoreSession(): Promise<AdminAuthSession | null> {
    const storedId = this.readStoredId();
    const account = storedId
      ? this.accounts.find((candidate) => candidate.id === storedId)
      : undefined;
    this.session = account ? this.toSession(account) : null;
    if (!account && storedId) this.removeStoredSession();
    return this.session;
  }

  async restoreInvitationSession(): Promise<AdminAuthSession | null> {
    // Fixture mode does not receive Supabase callback fragments. In
    // particular, it must not treat a locally persisted demo session as an
    // invitation credential.
    return null;
  }

  async signInWithPassword(email: string, password: string): Promise<AdminAuthSession> {
    const normalizedEmail = normalizeEmail(email);
    const account = this.accounts.find(
      (candidate) => normalizeEmail(candidate.email) === normalizedEmail,
    );
    if (!account || account.password !== password) {
      throw new AdminAuthError(
        'INVALID_CREDENTIALS',
        'The fixture email or password is incorrect.',
      );
    }

    this.session = this.toSession(account);
    this.writeStoredId(account.id);
    this.emit();
    return this.session;
  }

  async requestPasswordChangeVerification(): Promise<void> {
    if (!this.session) {
      throw new AdminAuthError('INVALID_CREDENTIALS', 'No authenticated fixture account.');
    }
    this.passwordVerificationRequested = true;
  }

  async changePassword(password: string, verificationCode: string): Promise<void> {
    const subjectId = this.session?.subject.id;
    const index = this.accounts.findIndex((account) => account.id === subjectId);
    if (index < 0) {
      throw new AdminAuthError('INVALID_CREDENTIALS', 'No authenticated fixture account.');
    }
    if (
      !this.passwordVerificationRequested ||
      verificationCode.trim() !== FIXTURE_PASSWORD_VERIFICATION_CODE
    ) {
      throw new AdminAuthError(
        'INVALID_VERIFICATION_CODE',
        'The fixture verification code is incorrect.',
      );
    }
    this.accounts[index] = { ...this.accounts[index], password };
    this.passwordVerificationRequested = false;
  }

  /**
   * The fixture has no mail path, so an invitation link cannot exist here. It
   * refuses rather than pretending, which keeps the meeting build from
   * demonstrating a flow production would handle differently.
   */
  async verifyEmailLink(): Promise<AdminAuthSession> {
    throw new AdminAuthError(
      'UNSUPPORTED',
      'The local fixture cannot deliver an invitation link. Use a demo account.',
    );
  }

  async signOut(): Promise<void> {
    this.session = null;
    this.passwordVerificationRequested = false;
    this.removeStoredSession();
    this.emit();
  }

  subscribe(listener: (session: AdminAuthSession | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private toSession(account: DemoAdminAccount): AdminAuthSession {
    return {
      subject: { id: account.id, email: account.email },
      accessToken: null,
    };
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.session);
  }

  private readStoredId(): string | null {
    try {
      return this.storage?.getItem(STORAGE_KEY) ?? null;
    } catch {
      return null;
    }
  }

  private writeStoredId(id: string): void {
    try {
      this.storage?.setItem(STORAGE_KEY, id);
    } catch {
      // The in-memory session still works when browser storage is unavailable.
    }
  }

  private removeStoredSession(): void {
    try {
      this.storage?.removeItem(STORAGE_KEY);
    } catch {
      // There is no persistent session to clear when storage is unavailable.
    }
  }
}

export function createFixtureAdminAuthGateway(
  options?: FixtureAdminAuthGatewayOptions,
): FixtureAdminAuthGateway {
  return new FixtureAdminAuthGateway(options);
}
