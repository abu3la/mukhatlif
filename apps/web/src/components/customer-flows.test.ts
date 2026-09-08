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
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  updateUser: vi.fn(),
  verifyOtp: vi.fn(),
  refreshSession: vi.fn(),
  getUser: vi.fn(),
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

beforeEach(() => {
  vi.resetAllMocks();
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
  auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
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
  it('starts with an empty code field and clears it when choosing another email', async () => {
    await requestEmailChange();
    expect(auth.updateUser).toHaveBeenCalled();
    expect(field('code').value).toBe('');
    field('code').value = '123456';
    await click('غيّر البريد');
    expect(field('email').value).toBe('');
  });
  it('recognizes a confirmed address regardless of email casing', async () => {
    await requestEmailChange();
    field('code').value = '123456';
    await submit();
    expect(fake.customer.notify).toHaveBeenCalledWith('حفظنا بريدك الإلكتروني الجديد.');
    expect(container.querySelector('dialog')).toBeNull();
  });
  it.each(['refreshSession', 'getUser'] as const)(
    'shows an Auth failure from %s instead of asking for another confirmation email',
    async (method) => {
      await requestEmailChange();
      auth[method].mockResolvedValueOnce({ data: {}, error: new Error('Auth network failure') });
      field('code').value = '123456';
      await submit();
      expect(container.querySelector('[role="alert"]')?.textContent).toContain('تعذّر إكمال الطلب');
      expect(fake.customer.notify).not.toHaveBeenCalled();
      expect(container.textContent).not.toContain('أكدنا هذا البريد');
    },
  );
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
