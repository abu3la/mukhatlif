// @vitest-environment jsdom
import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import type { CustomerProfile } from '@mukhtalif/types';
import { emptyCustomerLibrary, type CustomerConfig } from '@/lib/customer-utils';

const fake = vi.hoisted(() => ({
  current: null as Session | null,
  callback: undefined as undefined | ((event: string, session: Session | null) => void),
  push: vi.fn(),
  replace: vi.fn(),
  unsubscribe: vi.fn(),
  create: vi.fn(),
}));
vi.mock('next/navigation', () => {
  const router = { push: fake.push, replace: fake.replace };
  return { useRouter: () => router };
});
vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => {
    fake.create(...args);
    return {
      auth: {
        getSession: async () => ({ data: { session: fake.current }, error: null }),
        onAuthStateChange: (callback: typeof fake.callback) => {
          fake.callback = callback;
          return { data: { subscription: { unsubscribe: fake.unsubscribe } } };
        },
      },
    };
  },
}));

import { CustomerProvider, useCustomer } from './customer-provider';

const config: CustomerConfig = {
  apiOrigin: 'https://api.test',
  supabaseUrl: 'https://customer.supabase.co',
  supabaseAnonKey: 'public-test-key',
  googleEnabled: false,
};
const profile = (id = 'customer-a'): CustomerProfile => ({
  id,
  email: `${id}@example.test`,
  displayName: id,
  locale: 'ar',
  createdAt: '2026-09-07T00:00:00Z',
  gender: null,
  birthDate: null,
  interests: [],
  onboarded: true,
});
const session = (id = 'customer-a', email = `${id}@example.test`, confirmed = true): Session => ({
  access_token: `token-${id}`,
  refresh_token: 'test-refresh',
  expires_in: 3600,
  token_type: 'bearer',
  user: {
    id,
    email,
    email_confirmed_at: confirmed ? '2026-09-07T00:00:00Z' : undefined,
    app_metadata: {},
    aud: 'authenticated',
    created_at: '2026-09-07T00:00:00Z',
    user_metadata: { display_name: id },
  },
});
const json = (value: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(value), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { resolve, promise };
}
let exposed: ReturnType<typeof useCustomer>;
let root: Root | undefined;
let container: HTMLDivElement;
function Probe() {
  exposed = useCustomer();
  return createElement(
    'output',
    null,
    JSON.stringify({
      user: exposed.user?.id,
      profile: exposed.profile?.id,
      library: exposed.library,
      error: exposed.error,
      loading: exposed.loading,
    }),
  );
}
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
}
async function mount(options = config, strict = false) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    const provider = createElement(CustomerProvider, {
      config: options,
      children: createElement(Probe),
    });
    root!.render(strict ? createElement(StrictMode, null, provider) : provider);
  });
  await flush();
}
async function authEvent(event: string, value: Session | null) {
  await act(async () => {
    fake.current = value;
    fake.callback?.(event, value);
  });
  await flush();
}

let clientConfiguration = 0;
beforeEach(() => {
  config.supabaseUrl = `https://customer-${++clientConfiguration}.supabase.co`;
  fake.current = null;
  fake.callback = undefined;
  vi.clearAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('localStorage', {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    length: 0,
  });
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      url.endsWith('/app/account')
        ? json(profile(fake.current?.user.id))
        : json(emptyCustomerLibrary()),
    ),
  );
});
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  container?.remove();
  vi.unstubAllGlobals();
});

describe('customer session isolation', () => {
  it('does not create a browser SDK during configured server rendering', () => {
    renderToString(createElement(CustomerProvider, { config, children: createElement(Probe) }));
    expect(exposed.client).toBeNull();
    expect(exposed.loading).toBe(true);
    expect(fake.create).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('creates one browser SDK during a StrictMode double mount', async () => {
    await mount(config, true);
    expect(fake.create).toHaveBeenCalledTimes(1);
    expect(exposed.client).not.toBeNull();
  });
  it('renders without an auth client or network when configuration is absent', () => {
    const html = renderToString(
      createElement(CustomerProvider, {
        config: { apiOrigin: null, supabaseUrl: null, supabaseAnonKey: null },
        children: createElement(Probe),
      }),
    );
    expect(html).toContain('loading');
    expect(exposed.loading).toBe(false);
    expect(exposed.user).toBeNull();
    expect(fake.create).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('isolates customer auth storage and uses PKCE rather than simulated browser accounts', async () => {
    await mount();
    expect(fake.create).toHaveBeenCalledWith(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'mukhtalif-customer-auth',
      },
    });
    expect(localStorage.setItem).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([session('customer-a', ''), session('customer-a', 'a@example.test', false)])(
    'never provisions an incomplete or unconfirmed identity',
    async (value) => {
      fake.current = value;
      await mount();
      expect(exposed.user).toBeNull();
      expect(exposed.profile).toBeNull();
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it('does not restore an old profile or fetch its library after logout during a read', async () => {
    const pending = deferred<Response>();
    fake.current = session();
    vi.mocked(fetch).mockImplementationOnce(() => pending.promise);
    await mount();
    await authEvent('SIGNED_OUT', null);
    await act(async () => {
      pending.resolve(new Response(JSON.stringify(profile())));
    });
    await flush();
    expect(exposed.user).toBeNull();
    expect(exposed.profile).toBeNull();
    expect(exposed.library).toEqual(emptyCustomerLibrary());
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('does not apply a late profile edit to a different account', async () => {
    fake.current = session();
    await mount();
    const pending = deferred<Response>();
    vi.mocked(fetch).mockImplementation((url, options) =>
      options?.method === 'PATCH'
        ? pending.promise
        : String(url).endsWith('/app/account')
          ? json(profile(fake.current?.user.id))
          : json(emptyCustomerLibrary()),
    );
    let editing!: Promise<unknown>;
    await act(async () => {
      editing = exposed.updateProfile({ displayName: 'Old account edit' }).catch((error) => error);
    });
    await authEvent('SIGNED_IN', session('customer-b'));
    await act(async () => {
      pending.resolve(
        new Response(JSON.stringify({ ...profile(), displayName: 'Old account edit' })),
      );
      await editing;
    });
    expect(exposed.user?.id).toBe('customer-b');
    expect(exposed.profile?.id).toBe('customer-b');
    expect(exposed.profile?.displayName).toBe('customer-b');
  });
  it('keeps a completed library mutation when an earlier refresh returns later', async () => {
    fake.current = session();
    await mount();
    const stale = deferred<Response>();
    let refreshing = false;
    vi.mocked(fetch).mockImplementation((url, options) => {
      if (options?.method === 'PUT')
        return json({ ...emptyCustomerLibrary(), savedEpisodeIds: ['episode-a'] });
      if (String(url).endsWith('/app/account')) return json(profile());
      return refreshing ? stale.promise : json(emptyCustomerLibrary());
    });
    refreshing = true;
    let refresh!: Promise<void>;
    await act(async () => {
      refresh = exposed.refresh();
    });
    await flush();
    await act(async () => {
      await exposed.mutateLibrary('/saved/episodes/episode-a', 'PUT');
    });
    await act(async () => {
      stale.resolve(new Response(JSON.stringify(emptyCustomerLibrary())));
      await refresh;
    });
    expect(exposed.library.savedEpisodeIds).toEqual(['episode-a']);
  });
  it('rejects a late library result after switching accounts so callers cannot use it', async () => {
    fake.current = session();
    await mount();
    const pending = deferred<Response>();
    vi.mocked(fetch).mockImplementation((url, options) =>
      options?.method === 'POST'
        ? pending.promise
        : String(url).endsWith('/app/account')
          ? json(profile(fake.current?.user.id))
          : json(emptyCustomerLibrary()),
    );
    let creating!: Promise<unknown>;
    const completed = vi.fn();
    await act(async () => {
      creating = exposed
        .mutateLibrary('/playlists', 'POST', { name: 'قائمة الحساب السابق' })
        .then(completed)
        .catch((error) => error);
    });
    await authEvent('SIGNED_IN', session('customer-b'));
    await act(async () => {
      pending.resolve(
        new Response(
          JSON.stringify({
            ...emptyCustomerLibrary(),
            playlists: [{ id: 'previous-account-playlist', name: 'قائمة الحساب السابق' }],
          }),
        ),
      );
      expect(await creating).toBeInstanceOf(Error);
    });
    expect(completed).not.toHaveBeenCalled();
    expect(exposed.user?.id).toBe('customer-b');
    expect(exposed.library).toEqual(emptyCustomerLibrary());
  });
  it('rolls back a failed optimistic save while retaining confirmed server data', async () => {
    fake.current = session();
    await mount();
    const pending = deferred<Response>();
    vi.mocked(fetch).mockImplementationOnce(() => pending.promise);
    let saving!: Promise<unknown>;
    await act(async () => {
      saving = exposed.toggleSaved('episode', 'episode-a').catch((error) => error);
    });
    expect(exposed.library.savedEpisodeIds).toEqual(['episode-a']);
    await act(async () => {
      pending.resolve(new Response('{}', { status: 500 }));
      await saving;
    });
    expect(exposed.library.savedEpisodeIds).toEqual([]);
  });
  it('coalesces slow progress writes to the newest time instead of queuing every second', async () => {
    fake.current = session();
    await mount();
    const pending = deferred<Response>();
    const positions: number[] = [];
    vi.mocked(fetch).mockImplementation((_url, options) => {
      const data = JSON.parse(String(options?.body));
      positions.push(data.positionSec);
      return positions.length === 1 ? pending.promise : json(emptyCustomerLibrary());
    });
    let first!: Promise<void>;
    let latest!: Promise<void>;
    await act(async () => {
      first = exposed.saveProgress('episode-a', 1);
    });
    await flush();
    await act(async () => {
      void exposed.saveProgress('episode-a', 2);
      latest = exposed.saveProgress('episode-a', 3);
    });
    await act(async () => {
      pending.resolve(new Response(JSON.stringify(emptyCustomerLibrary())));
      await Promise.all([first, latest]);
    });
    expect(positions).toEqual([1, 3]);
  });
  it('provisions once when the verified identity has no customer profile', async () => {
    fake.current = session();
    const methods: string[] = [];
    vi.mocked(fetch).mockImplementation((url, options) => {
      methods.push(options?.method || 'GET');
      if (String(url).endsWith('/app/library')) return json(emptyCustomerLibrary());
      return options?.method === 'POST' ? json(profile()) : json({}, 404);
    });
    await mount();
    expect(methods).toEqual(['GET', 'POST', 'GET']);
    expect(exposed.profile?.id).toBe('customer-a');
  });
});
