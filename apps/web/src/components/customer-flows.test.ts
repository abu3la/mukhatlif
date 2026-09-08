// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { useCustomer } from './customer-provider';
import { emptyCustomerLibrary } from '@/lib/customer-utils';

const fake = vi.hoisted(() => ({
  customer: null as unknown as ReturnType<typeof useCustomer>,
  push: vi.fn(),
  replace: vi.fn(),
  player: { toggle: vi.fn() },
  episodeData: {
    episodes: [{ id: 'previous-playlist-episode', premium: false }],
    shows: [],
    loading: true,
    error: '',
  },
}));
vi.mock('next/navigation', () => {
  const router = { push: fake.push, replace: fake.replace };
  return { useRouter: () => router };
});
vi.mock('./customer-provider', () => ({ useCustomer: () => fake.customer }));
vi.mock('./player', () => ({ usePlayer: () => fake.player }));
vi.mock('./customer-content', () => ({
  useCustomerEpisodes: () => fake.episodeData,
  CustomerEpisodeList: () => null,
  CustomerEpisodeRow: () => null,
  customerPlayerEpisode: vi.fn(),
}));

import { CustomerAuth } from './customer-auth';
import { CustomerAccount } from './customer-account';
import { CustomerPlaylistPage } from './customer-library';

const auth = {
  initialize: vi.fn(),
  resend: vi.fn(),
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  updateUser: vi.fn(),
  verifyOtp: vi.fn(),
  refreshSession: vi.fn(),
  getUser: vi.fn(),
  reauthenticate: vi.fn(),
  signOut: vi.fn(),
};
let root: Root;
let container: HTMLDivElement;

async function mount(element: React.ReactNode) {
  await act(async () => root.render(element));
}
function field(name: string) {
  return container.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
}
async function submit() {
  await act(async () => {
    container
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}
async function click(label: string) {
  const button = Array.from(container.querySelectorAll('button')).find((item) =>
    item.textContent?.includes(label),
  );
  expect(button, label).toBeDefined();
  await act(async () => button!.click());
}
function signedIn() {
  fake.customer.user = { id: 'customer-a', email: 'old@example.test' } as NonNullable<
    typeof fake.customer.user
  >;
  fake.customer.profile = {
    id: 'customer-a',
    email: 'old@example.test',
    displayName: 'مستمع',
    locale: 'ar',
    createdAt: '2026-09-08T00:00:00Z',
    gender: null,
    birthDate: null,
    interests: [],
    onboarded: false,
  };
}
async function requestEmailChange() {
  signedIn();
  await mount(createElement(CustomerAccount));
  await click('البريد الإلكتروني');
  field('email').value = 'New@Example.test';
  await submit();
}
async function requestPasswordChange() {
  signedIn();
  await mount(createElement(CustomerAccount));
  await click('كلمة المرور');
  field('currentPassword').value = 'current-test-password';
  field('password').value = 'new-test-password';
  await submit();
}

beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState(null, '', '/');
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.open = true;
      },
    },
    close: {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.open = false;
      },
    },
  });
  fake.customer = {
    config: {
      apiOrigin: 'https://api.example.test',
      supabaseUrl: 'https://customer.supabase.co',
      supabaseAnonKey: 'public-test-key',
      googleEnabled: false,
    },
    client: { auth } as unknown as NonNullable<ReturnType<typeof useCustomer>['client']>,
    user: null,
    profile: null,
    library: emptyCustomerLibrary(),
    loading: false,
    error: null,
    notice: '',
    notify: vi.fn(),
    requireAccount: vi.fn(),
    refresh: vi.fn().mockResolvedValue(undefined),
    updateProfile: vi.fn(),
    mutateLibrary: vi.fn(),
    toggleSaved: vi.fn(),
    toggleFollow: vi.fn(),
    saveProgress: vi.fn(),
    updateQueue: vi.fn(),
    addBookmark: vi.fn(),
    publicRead: vi.fn(),
  };
  auth.initialize.mockResolvedValue({ error: null });
  auth.resend.mockResolvedValue({ data: {}, error: null });
  auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
  auth.signInWithPassword.mockResolvedValue({ data: { user: { id: 'customer-a' } }, error: null });
  auth.reauthenticate.mockResolvedValue({ data: {}, error: null });
  auth.signOut.mockResolvedValue({ error: null });
  auth.updateUser.mockResolvedValue({ data: {}, error: null });
  auth.verifyOtp.mockResolvedValue({ data: {}, error: null });
  auth.refreshSession.mockResolvedValue({ data: {}, error: null });
  auth.getUser.mockResolvedValue({ data: { user: { email: 'new@example.test' } }, error: null });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe('customer authentication dispatch and return intent', () => {
  it('resends a confirmation link without requesting a code and preserves the destination', async () => {
    await mount(
      createElement(CustomerAuth, {
        mode: 'confirm',
        email: 'listener@example.test',
        next: '/library?tab=playlists',
      }),
    );
    expect(field('code')).toBeNull();
    expect(container.textContent).toContain('افتح رابط التأكيد في بريدك');
    expect(container.textContent).not.toContain('رمز');
    expect(
      container.querySelector('a[href="/login?next=%2Flibrary%3Ftab%3Dplaylists"]'),
    ).not.toBeNull();
    await submit();
    expect(auth.resend).toHaveBeenCalledWith({
      type: 'signup',
      email: 'listener@example.test',
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=%2Flibrary%3Ftab%3Dplaylists`,
      },
    });
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    expect(container.querySelector<HTMLButtonElement>('button.customer-primary')?.disabled).toBe(
      true,
    );
    await submit();
    expect(auth.resend).toHaveBeenCalledOnce();
  });
  it('validates the confirmation email before resending a link', async () => {
    await mount(createElement(CustomerAuth, { mode: 'confirm', email: 'not-an-email' }));
    await submit();
    expect(auth.resend).not.toHaveBeenCalled();
    expect(field('email').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(field('email'));
  });
  it('handles resend errors without losing the safe return destination', async () => {
    auth.resend.mockResolvedValueOnce({ data: {}, error: new Error('untrusted-provider-details') });
    await mount(
      createElement(CustomerAuth, {
        mode: 'confirm',
        email: 'listener@example.test',
        next: 'https://untrusted.example',
      }),
    );
    await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('تعذّر إكمال الطلب');
    expect(container.textContent).not.toContain('untrusted-provider-details');
    expect(auth.resend.mock.calls[0][0].options.emailRedirectTo).toBe(
      `${window.location.origin}/auth/callback?next=%2Faccount`,
    );
    expect(container.querySelector<HTMLButtonElement>('button.customer-primary')?.disabled).toBe(
      false,
    );
  });
  it('continues after a link creates a customer session in another tab', async () => {
    const screen = () => createElement(CustomerAuth, { mode: 'confirm', next: '/library' });
    await mount(screen());
    expect(fake.replace).not.toHaveBeenCalled();
    signedIn();
    await mount(screen());
    expect(fake.replace).toHaveBeenCalledWith('/onboarding?next=%2Flibrary');
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });
  it('rejects invalid email and missing consent before contacting Auth', async () => {
    await mount(createElement(CustomerAuth, { mode: 'signup', email: 'not-an-email' }));
    field('name').value = 'مستمع';
    field('password').value = 'test-password-only';
    await submit();
    expect(auth.signUp).not.toHaveBeenCalled();
    expect(field('email').getAttribute('aria-invalid')).toBe('true');
    expect(field('consent').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(field('email'));
  });
  it.each([undefined, '/library?tab=playlists'])(
    'preserves signup destination %s through email confirmation',
    async (next) => {
      await mount(
        createElement(CustomerAuth, { mode: 'signup', email: 'listener@example.test', next }),
      );
      field('name').value = 'مستمع';
      field('password').value = 'test-password-only';
      field('consent').checked = true;
      await submit();
      const target = next || '/';
      expect(auth.signUp).toHaveBeenCalledWith({
        email: 'listener@example.test',
        password: 'test-password-only',
        options: {
          data: { display_name: 'مستمع', terms_accepted_at: expect.any(String) },
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(target)}`,
        },
      });
      expect(fake.push).toHaveBeenCalledWith(
        `/confirm?email=listener%40example.test&next=${encodeURIComponent(target)}`,
      );
    },
  );
  it('routes a confirmed first-time customer through onboarding with their destination', async () => {
    signedIn();
    await mount(createElement(CustomerAuth, { mode: 'callback', next: '/library?tab=playlists' }));
    expect(fake.replace).toHaveBeenCalledWith('/onboarding?next=%2Flibrary%3Ftab%3Dplaylists');
  });
  it('returns an onboarded customer to the default account route after login', async () => {
    signedIn();
    fake.customer.profile!.onboarded = true;
    await mount(createElement(CustomerAuth, { mode: 'login' }));
    expect(fake.replace).toHaveBeenCalledWith('/account');
  });
});

describe('customer email change dialog', () => {
  const confirmedUser = {
    id: 'customer-a',
    email: 'new@example.test',
    email_confirmed_at: '2026-09-08T00:00:00Z',
  };
  beforeEach(() => {
    auth.getUser.mockResolvedValue({ data: { user: confirmedUser }, error: null });
    auth.refreshSession.mockResolvedValue({
      data: { session: { user: confirmedUser } },
      error: null,
    });
  });

  it('requests links for both inboxes without offering or submitting an email-change code', async () => {
    await requestEmailChange();
    expect(auth.updateUser).toHaveBeenCalledWith(
      { email: 'New@Example.test' },
      { emailRedirectTo: `${window.location.origin}/auth/callback?next=%2Faccount` },
    );
    expect(field('code')).toBeNull();
    expect(container.querySelector('dialog')?.textContent).toContain('بريدك الحالي والجديد');
    expect(container.querySelector('dialog')?.textContent).not.toContain('رمز');
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });
  it('returns to an empty address field when choosing another email', async () => {
    await requestEmailChange();
    await click('غيّر البريد');
    expect(field('email').value).toBe('');
    expect(field('code')).toBeNull();
  });
  it('recognizes a server-confirmed address regardless of email casing and refreshes the session', async () => {
    await requestEmailChange();
    auth.getUser.mockResolvedValueOnce({
      data: { user: { ...confirmedUser, email: 'NEW@example.test' } },
      error: null,
    });
    await submit();
    expect(auth.getUser).toHaveBeenCalledOnce();
    expect(auth.refreshSession).toHaveBeenCalledOnce();
    expect(fake.customer.refresh).toHaveBeenCalledOnce();
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    expect(fake.customer.notify).toHaveBeenCalledWith('حفظنا بريدك الإلكتروني الجديد.');
    expect(container.querySelector('dialog')).toBeNull();
  });
  it('keeps both-link guidance when only the pending address or stale client metadata has changed', async () => {
    await requestEmailChange();
    fake.customer.user = { ...fake.customer.user!, email: 'new@example.test' };
    auth.getUser.mockResolvedValueOnce({
      data: {
        user: { ...confirmedUser, email: 'old@example.test', new_email: 'new@example.test' },
      },
      error: null,
    });
    await submit();
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      'لم يكتمل تغيير البريد',
    );
    expect(auth.refreshSession).not.toHaveBeenCalled();
    expect(fake.customer.notify).not.toHaveBeenCalled();
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });
  it('does not report success for an unconfirmed address returned by Auth', async () => {
    await requestEmailChange();
    auth.getUser.mockResolvedValueOnce({
      data: { user: { ...confirmedUser, email_confirmed_at: null } },
      error: null,
    });
    await submit();
    expect(fake.customer.notify).not.toHaveBeenCalled();
    expect(auth.refreshSession).not.toHaveBeenCalled();
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      'لم يكتمل تغيير البريد',
    );
  });
  it('does not accept a confirmed address belonging to another account', async () => {
    await requestEmailChange();
    auth.getUser.mockResolvedValueOnce({
      data: { user: { ...confirmedUser, id: 'customer-b' } },
      error: null,
    });
    await submit();
    expect(fake.customer.notify).not.toHaveBeenCalled();
    expect(auth.refreshSession).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'تعذّر التحقق من جلستك',
    );
  });
  it.each(['refreshSession', 'getUser'] as const)(
    'shows an Auth failure from %s instead of asking for another confirmation email',
    async (method) => {
      await requestEmailChange();
      auth[method].mockResolvedValueOnce({ data: {}, error: new Error('Auth network failure') });
      await submit();
      expect(container.querySelector('[role="alert"]')?.textContent).toContain('تعذّر إكمال الطلب');
      expect(fake.customer.notify).not.toHaveBeenCalled();
      expect(container.textContent).not.toContain('أكدنا هذا البريد');
    },
  );
  it('keeps a failed customer refresh actionable rather than reporting success', async () => {
    await requestEmailChange();
    vi.mocked(fake.customer.refresh).mockRejectedValueOnce(new Error('Profile refresh failure'));
    await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('تعذّر إكمال الطلب');
    expect(fake.customer.notify).not.toHaveBeenCalled();
    expect(container.querySelector('dialog')).not.toBeNull();
  });
  it('offers a fresh login after a missing Auth user without claiming confirmation', async () => {
    await requestEmailChange();
    auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'بعد تأكيد رابطَي البريد',
    );
    expect(fake.customer.notify).not.toHaveBeenCalled();
    await click('سجّل الدخول مجددًا');
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(fake.customer.refresh).toHaveBeenCalledOnce();
    expect(fake.replace).toHaveBeenCalledWith('/login?next=%2Faccount');
  });
  it('asks for a fresh login if the confirmed address is missing from the refreshed session', async () => {
    await requestEmailChange();
    auth.refreshSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'سجّل الدخول به لتحديث جلستك',
    );
    expect(fake.customer.notify).not.toHaveBeenCalled();
    expect(fake.customer.refresh).not.toHaveBeenCalled();
  });
  it('gives safe login guidance after an expired session', async () => {
    await requestEmailChange();
    auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: { code: 'session_not_found', status: 401 },
    });
    await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('انتهت جلستك');
    expect(container.textContent).toContain('سجّل الدخول مجددًا');
    expect(fake.customer.notify).not.toHaveBeenCalled();
  });
  it('discards a late confirmation check after switching accounts', async () => {
    let resolve!: (value: unknown) => void;
    await requestEmailChange();
    auth.getUser.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await submit();
    fake.customer.user = { ...fake.customer.user!, id: 'customer-b', email: 'b@example.test' };
    fake.customer.profile = { ...fake.customer.profile!, id: 'customer-b' };
    await mount(createElement(CustomerAccount));
    await act(async () => resolve({ data: { user: confirmedUser }, error: null }));
    expect(auth.refreshSession).not.toHaveBeenCalled();
    expect(fake.customer.notify).not.toHaveBeenCalled();
    expect(container.querySelector('dialog')).toBeNull();
  });
});

describe('customer password change credentials', () => {
  it('sends the current password and nonce with the update after verifying the current password', async () => {
    await requestPasswordChange();
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'old@example.test',
      password: 'current-test-password',
    });
    expect(auth.reauthenticate).toHaveBeenCalledOnce();
    expect(auth.updateUser).not.toHaveBeenCalled();
    field('code').value = '123456';
    await submit();
    expect(auth.updateUser).toHaveBeenCalledWith({
      password: 'new-test-password',
      current_password: 'current-test-password',
      nonce: '123456',
    });
    expect(container.querySelector('dialog')).toBeNull();
    await click('كلمة المرور');
    expect(field('currentPassword').value).toBe('');
    expect(field('password').value).toBe('');
    expect(field('code')).toBeNull();
  });
  it('does not request a nonce or change the password after incorrect current credentials', async () => {
    auth.signInWithPassword.mockResolvedValueOnce({ error: { code: 'invalid_credentials' } });
    await requestPasswordChange();
    expect(auth.reauthenticate).not.toHaveBeenCalled();
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('غير صحيحة');
  });
  it('clears pending credentials on cancellation', async () => {
    await requestPasswordChange();
    await click('إلغاء');
    await click('كلمة المرور');
    expect(field('currentPassword').value).toBe('');
    expect(field('password').value).toBe('');
    expect(field('code')).toBeNull();
    await submit();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
  it('closes the password challenge when the active account changes', async () => {
    await requestPasswordChange();
    fake.customer.user = { ...fake.customer.user!, id: 'customer-b', email: 'b@example.test' };
    fake.customer.profile = { ...fake.customer.profile!, id: 'customer-b' };
    await mount(createElement(CustomerAccount));
    expect(container.querySelector('dialog')).toBeNull();
    await click('كلمة المرور');
    expect(field('currentPassword').value).toBe('');
    expect(field('password').value).toBe('');
    expect(field('code')).toBeNull();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
  it('does not restore a late password challenge after switching accounts', async () => {
    let resolve!: (value: unknown) => void;
    auth.reauthenticate.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await requestPasswordChange();
    fake.customer.user = { ...fake.customer.user!, id: 'customer-b', email: 'b@example.test' };
    fake.customer.profile = { ...fake.customer.profile!, id: 'customer-b' };
    await mount(createElement(CustomerAccount));
    await act(async () => resolve({ data: {}, error: null }));
    expect(container.querySelector('dialog')).toBeNull();
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(fake.customer.notify).not.toHaveBeenCalled();
  });
});

describe('customer Auth link states', () => {
  it.each(['callback', 'reset'] as const)(
    'rejects an unresolved PKCE link on %s even with an older signed-in session',
    async (mode) => {
      signedIn();
      fake.customer.profile!.onboarded = true;
      window.history.replaceState(null, '', `/${mode}?code=unresolved-test-code`);
      await mount(createElement(CustomerAuth, { mode, next: '/library' }));
      expect(container.querySelector('[role="alert"]')?.textContent).toContain(
        'المتصفح الذي بدأت منه',
      );
      expect(fake.replace).not.toHaveBeenCalled();
      expect(container.querySelector('form')).toBeNull();
      expect(auth.updateUser).not.toHaveBeenCalled();
    },
  );
  it.each(['callback', 'reset'] as const)(
    'rejects SDK initialization errors on %s without exposing provider details',
    async (mode) => {
      signedIn();
      auth.initialize.mockResolvedValueOnce({ error: new Error('untrusted-exchange-details') });
      await mount(createElement(CustomerAuth, { mode, next: '/library' }));
      expect(container.querySelector('[role="alert"]')?.textContent).toContain(
        'تعذّر تأكيد الرابط',
      );
      expect(container.textContent).not.toContain('untrusted-exchange-details');
      expect(fake.replace).not.toHaveBeenCalled();
      expect(container.querySelector('form')).toBeNull();
      expect(auth.updateUser).not.toHaveBeenCalled();
    },
  );
  it('lets the SDK finish exchanging the link before redirecting a confirmed customer', async () => {
    signedIn();
    window.history.replaceState(null, '', '/auth/callback?code=one-use-test-code');
    let complete!: (value: { error: null }) => void;
    auth.initialize.mockReturnValueOnce(new Promise((resolve) => (complete = resolve)));
    await mount(createElement(CustomerAuth, { mode: 'callback', next: '/library' }));
    expect(fake.replace).not.toHaveBeenCalled();
    await act(async () => {
      window.history.replaceState(null, '', '/auth/callback');
      complete({ error: null });
    });
    expect(fake.replace).toHaveBeenCalledWith('/onboarding?next=%2Flibrary');
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });
  it.each([
    [true, '?error=access_denied'],
    [false, '?error=access_denied'],
    [true, '#error_code=otp_expired'],
    [false, '#error_code=otp_expired'],
    [true, '?error_description=untrusted-provider-details'],
    [false, '?error_description=untrusted-provider-details'],
  ] as const)(
    'blocks failed recovery links even when signed in (%s, %s)',
    async (authenticated, suffix) => {
      if (authenticated) signedIn();
      window.history.replaceState(null, '', `/reset${suffix}`);
      await mount(createElement(CustomerAuth, { mode: 'reset', next: '/library' }));
      expect(container.querySelector('[role="alert"]')?.textContent).toContain(
        'انتهت صلاحية الرابط',
      );
      expect(container.querySelector('form')).toBeNull();
      expect(container.textContent).not.toContain('untrusted-provider-details');
      expect(container.querySelector('a[href="/forgot?next=%2Flibrary"]')).not.toBeNull();
      expect(auth.updateUser).not.toHaveBeenCalled();
    },
  );
  it('preserves the successful recovery update and signout flow', async () => {
    signedIn();
    await mount(createElement(CustomerAuth, { mode: 'reset', next: '/library' }));
    field('password').value = 'recovered-test-password';
    field('passwordConfirm').value = 'recovered-test-password';
    await submit();
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'recovered-test-password' });
    expect(auth.signOut).toHaveBeenCalledOnce();
    expect(fake.replace).toHaveBeenCalledWith('/login?next=%2Flibrary');
  });
  it.each(['?', '#'])(
    'keeps partial email confirmation guidance visible for %s messages',
    async (separator) => {
      signedIn();
      fake.customer.profile!.onboarded = true;
      const message =
        'Confirmation link accepted. Please proceed to confirm link sent to the other email';
      window.history.replaceState(
        null,
        '',
        `/auth/callback${separator}message=${encodeURIComponent(message)}`,
      );
      await mount(createElement(CustomerAuth, { mode: 'callback', next: '/account' }));
      expect(container.textContent).toContain('تأكيد عنوان البريد الآخر');
      expect(container.textContent).toContain('رسالة التأكيد الأخرى');
      expect(container.querySelector('a[href="/account"]')).not.toBeNull();
      expect(fake.replace).not.toHaveBeenCalled();
    },
  );
  it('does not display arbitrary callback messages', async () => {
    signedIn();
    fake.customer.profile!.onboarded = true;
    window.history.replaceState(null, '', '/auth/callback?message=untrusted-message');
    await mount(createElement(CustomerAuth, { mode: 'callback', next: '/account' }));
    expect(container.textContent).not.toContain('untrusted-message');
    expect(fake.replace).toHaveBeenCalledWith('/account');
  });
});

describe('customer playlist loading', () => {
  it('does not offer playback of the previous playlist while loading another playlist', async () => {
    signedIn();
    fake.customer.library.playlists = [
      {
        id: 'new-playlist',
        name: 'قائمة جديدة',
        description: '',
        episodeIds: ['new-playlist-episode'],
        createdAt: '2026-09-08T00:00:00Z',
        updatedAt: '2026-09-08T00:00:00Z',
      },
    ];
    await mount(createElement(CustomerPlaylistPage, { playlistId: 'new-playlist' }));
    expect(container.textContent).toContain('جارٍ تحميل الحلقات');
    expect(container.textContent).not.toContain('شغّل القائمة');
    expect(fake.player.toggle).not.toHaveBeenCalled();
  });
});
