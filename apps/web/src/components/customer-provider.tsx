'use client';

import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import {
  CLIENT_SURFACE_HEADER,
  type CustomerLibrary,
  type CustomerProfile,
} from '@mukhtalif/types';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  customerError,
  emptyCustomerLibrary,
  safeCustomerReturn,
  type CustomerConfig,
  type CustomerProfilePatch,
} from '@/lib/customer-utils';
import './customer.css';
import { customerBrowserClient } from '@/lib/customer-browser';

type Method = 'POST' | 'PUT' | 'PATCH' | 'DELETE';
class CustomerRequestError extends Error {
  constructor(readonly status: number) {
    super(
      status === 401
        ? 'انتهت جلستك. سجّل الدخول مجددًا.'
        : status === 403
          ? 'لا يمكن إكمال هذا الطلب من حسابك.'
          : status === 429
            ? 'انتظر قليلًا قبل المحاولة مرة أخرى.'
            : status === 422
              ? 'راجع البيانات وحاول مجددًا.'
              : 'تعذّر تحميل بيانات حسابك. حاول مجددًا.',
    );
  }
}

interface CustomerContextValue {
  config: CustomerConfig;
  client: SupabaseClient | null;
  user: User | null;
  profile: CustomerProfile | null;
  library: CustomerLibrary;
  loading: boolean;
  error: string | null;
  notice: string;
  notify: (message: string) => void;
  requireAccount: () => boolean;
  refresh: () => Promise<void>;
  updateProfile: (patch: CustomerProfilePatch) => Promise<CustomerProfile>;
  mutateLibrary: (path: string, method: Method, body?: unknown) => Promise<CustomerLibrary>;
  toggleSaved: (kind: 'episode' | 'article', id: string) => Promise<void>;
  toggleFollow: (showId: string) => Promise<void>;
  saveProgress: (episodeId: string, positionSec: number) => Promise<void>;
  updateQueue: (episodeIds: string[]) => Promise<void>;
  addBookmark: (episodeId: string, positionSec: number, label?: string) => Promise<void>;
  publicRead: <T>(path: string) => Promise<T>;
}

const CustomerContext = createContext<CustomerContextValue | null>(null);

export function CustomerProvider({
  config,
  children,
}: {
  config: CustomerConfig;
  children: ReactNode;
}) {
  const router = useRouter();
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [library, setLibrary] = useState<CustomerLibrary>(emptyCustomerLibrary);
  const [loading, setLoading] = useState(Boolean(config.supabaseUrl && config.supabaseAnonKey));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const sessionRef = useRef<Session | null>(null);
  const loadSequence = useRef(0);
  const mutationQueue = useRef<Promise<unknown>>(Promise.resolve());
  const publicCache = useRef(new Map<string, Promise<unknown>>());
  const serverLibrary = useRef<CustomerLibrary>(emptyCustomerLibrary());
  const optimisticChanges = useRef(new Map<symbol, (value: CustomerLibrary) => CustomerLibrary>());
  const libraryRevision = useRef(0);
  const profileRevision = useRef(0);
  const pendingProgress = useRef(new Map<string, { ownerId: string; positionSec: number }>());
  const progressDrain = useRef<Promise<void> | null>(null);

  useEffect(() => {
    try {
      setClient(customerBrowserClient(config));
    } catch (failure) {
      setError(customerError(failure));
      setLoading(false);
    }
  }, [config]);

  const publishLibrary = useCallback((next?: CustomerLibrary) => {
    if (next) serverLibrary.current = next;
    setLibrary(
      [...optimisticChanges.current.values()].reduce(
        (value, change) => change(value),
        serverLibrary.current,
      ),
    );
  }, []);

  const withOptimisticLibrary = useCallback(
    async (
      key: string,
      change: (value: CustomerLibrary) => CustomerLibrary,
      commit: () => Promise<unknown>,
    ) => {
      // Each request owns its own token, including across a logout/login boundary.
      const token = Symbol(key);
      optimisticChanges.current.set(token, change);
      publishLibrary();
      try {
        await commit();
      } finally {
        optimisticChanges.current.delete(token);
        publishLibrary();
      }
    },
    [publishLibrary],
  );

  const notify = useCallback((message: string) => setNotice(message), []);
  useEffect(() => {
    if (notice) {
      const timer = window.setTimeout(() => setNotice(''), 5000);
      return () => window.clearTimeout(timer);
    }
  }, [notice]);

  const request = useCallback(
    async <T,>(
      path: string,
      method = 'GET',
      body?: unknown,
      suppliedSession?: Session,
    ): Promise<T> => {
      if (!config.apiOrigin || !client) throw new Error('تسجيل الدخول غير متاح الآن. حاول لاحقًا.');
      const initiatingUserId = sessionRef.current?.user.id;
      const current = suppliedSession ?? (await client.auth.getSession()).data.session;
      if (!current?.access_token || !current.user.email) throw new CustomerRequestError(401);
      if (initiatingUserId && current.user.id !== initiatingUserId)
        throw new CustomerRequestError(401);
      const response = await fetch(`${config.apiOrigin}${path}`, {
        method,
        cache: 'no-store',
        headers: {
          accept: 'application/json',
          [CLIENT_SURFACE_HEADER]: 'web',
          authorization: `Bearer ${current.access_token}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok) throw new CustomerRequestError(response.status);
      return response.json() as Promise<T>;
    },
    [client, config.apiOrigin],
  );

  const loadSession = useCallback(
    async (session: Session | null) => {
      const sequence = ++loadSequence.current;
      sessionRef.current = session;
      if (!session?.user.email || !session.user.email_confirmed_at) {
        optimisticChanges.current.clear();
        pendingProgress.current.clear();
        setUser(null);
        setProfile(null);
        setError(null);
        setNotice('');
        publishLibrary(emptyCustomerLibrary());
        setLoading(false);
        return;
      }
      const changedUser = session.user.id !== user?.id;
      setUser(session.user);
      setError(null);
      if (changedUser) {
        optimisticChanges.current.clear();
        pendingProgress.current.clear();
        setProfile(null);
        publishLibrary(emptyCustomerLibrary());
        setLoading(true);
      }
      try {
        const startedProfileRevision = profileRevision.current;
        let nextProfile: CustomerProfile;
        try {
          nextProfile = await request<CustomerProfile>('/app/account', 'GET', undefined, session);
        } catch (failure) {
          if (!(failure instanceof CustomerRequestError) || failure.status !== 404) throw failure;
          if (sequence !== loadSequence.current || session.user.id !== sessionRef.current?.user.id)
            return;
          const metadataName =
            session.user.user_metadata?.display_name ?? session.user.user_metadata?.full_name;
          nextProfile = await request<CustomerProfile>(
            '/app/account',
            'POST',
            {
              displayName:
                typeof metadataName === 'string' && metadataName.trim()
                  ? metadataName.trim().slice(0, 100)
                  : 'مستمع مختلف',
              locale: 'ar',
            },
            session,
          );
        }
        if (sequence !== loadSequence.current || session.user.id !== sessionRef.current?.user.id)
          return;
        const startedLibraryRevision = libraryRevision.current;
        const nextLibrary = await request<CustomerLibrary>(
          '/app/library',
          'GET',
          undefined,
          session,
        );
        if (sequence === loadSequence.current) {
          if (startedProfileRevision === profileRevision.current) setProfile(nextProfile);
          if (startedLibraryRevision === libraryRevision.current) publishLibrary(nextLibrary);
        }
      } catch (failure) {
        if (sequence === loadSequence.current) setError(customerError(failure));
      } finally {
        if (sequence === loadSequence.current) setLoading(false);
      }
    },
    [request, user?.id, publishLibrary],
  );
  const loadSessionRef = useRef(loadSession);
  useEffect(() => {
    loadSessionRef.current = loadSession;
  }, [loadSession]);

  useEffect(() => {
    if (!client) return;
    let active = true;
    void client.auth.getSession().then(({ data, error: authError }) => {
      if (!active) return;
      if (authError) {
        setError(customerError(authError));
        setLoading(false);
      } else void loadSessionRef.current(data.session);
    });
    const { data: listener } = client.auth.onAuthStateChange((event, session) => {
      sessionRef.current = session;
      // Auth callbacks must finish before the SDK is called again (its lock is held here).
      window.setTimeout(() => {
        if (!active) return;
        if (event === 'PASSWORD_RECOVERY') {
          const next = safeCustomerReturn(new URLSearchParams(window.location.search).get('next'));
          router.replace(`/reset?next=${encodeURIComponent(next)}`);
        }
        void loadSessionRef.current(session);
      }, 0);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
      ++loadSequence.current;
    };
  }, [client, router]);

  const refresh = useCallback(async () => {
    if (!client) return;
    const { data, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    await loadSessionRef.current(data.session);
  }, [client]);

  const requireAccount = useCallback(() => {
    if (sessionRef.current?.user.email && sessionRef.current.user.email_confirmed_at) return true;
    const next = safeCustomerReturn(
      `${window.location.pathname}${window.location.search}${window.location.hash}`,
      '/library',
    );
    router.push(`/login?next=${encodeURIComponent(next)}`);
    return false;
  }, [router]);

  const updateProfile = useCallback(
    async (patch: CustomerProfilePatch) => {
      const ownerId = sessionRef.current?.user.id;
      if (!ownerId) throw new CustomerRequestError(401);
      const next = await request<CustomerProfile>('/app/account', 'PATCH', patch);
      if (ownerId !== sessionRef.current?.user.id) throw new CustomerRequestError(401);
      ++profileRevision.current;
      setProfile(next);
      return next;
    },
    [request],
  );

  const mutateLibrary = useCallback(
    (path: string, method: Method, body?: unknown): Promise<CustomerLibrary> => {
      const ownerId = sessionRef.current?.user.id;
      const action = mutationQueue.current
        .catch(() => undefined)
        .then(async () => {
          if (!ownerId || ownerId !== sessionRef.current?.user.id)
            throw new CustomerRequestError(401);
          const next = await request<CustomerLibrary>(`/app/library${path}`, method, body);
          if (ownerId !== sessionRef.current?.user.id) throw new CustomerRequestError(401);
          ++libraryRevision.current;
          publishLibrary(next);
          return next;
        });
      mutationQueue.current = action;
      return action;
    },
    [request, publishLibrary],
  );

  const toggleSaved = useCallback(
    async (kind: 'episode' | 'article', id: string) => {
      if (!requireAccount()) return;
      const saved = (
        kind === 'episode' ? library.savedEpisodeIds : library.savedArticleIds
      ).includes(id);
      const field = kind === 'episode' ? 'savedEpisodeIds' : 'savedArticleIds';
      await withOptimisticLibrary(
        `saved:${kind}:${id}`,
        (value) => ({
          ...value,
          [field]: saved
            ? value[field].filter((item) => item !== id)
            : [...new Set([...value[field], id])],
        }),
        () =>
          mutateLibrary(
            `/saved/${kind === 'episode' ? 'episodes' : 'articles'}/${encodeURIComponent(id)}`,
            saved ? 'DELETE' : 'PUT',
          ),
      );
      notify(saved ? 'أزلناها من المحفوظات.' : 'أضفناها إلى المحفوظات.');
    },
    [
      library.savedEpisodeIds,
      library.savedArticleIds,
      mutateLibrary,
      notify,
      requireAccount,
      withOptimisticLibrary,
    ],
  );

  const toggleFollow = useCallback(
    async (showId: string) => {
      if (!requireAccount()) return;
      const followed = library.followedShowIds.includes(showId);
      await withOptimisticLibrary(
        `follow:${showId}`,
        (value) => ({
          ...value,
          followedShowIds: followed
            ? value.followedShowIds.filter((id) => id !== showId)
            : [...new Set([...value.followedShowIds, showId])],
        }),
        () => mutateLibrary(`/follows/${encodeURIComponent(showId)}`, followed ? 'DELETE' : 'PUT'),
      );
      notify(followed ? 'ألغينا متابعة البرنامج.' : 'أضفنا البرنامج إلى مكتبتك.');
    },
    [library.followedShowIds, mutateLibrary, notify, requireAccount, withOptimisticLibrary],
  );

  const saveProgress = useCallback(
    (episodeId: string, positionSec: number): Promise<void> => {
      const currentUser = sessionRef.current?.user;
      if (!currentUser?.email_confirmed_at || !Number.isFinite(positionSec))
        return Promise.resolve();
      // Keep only the newest time per episode while a write is in flight. A slow
      // connection must not create minutes of obsolete per-second requests.
      pendingProgress.current.set(episodeId, {
        ownerId: currentUser.id,
        positionSec: Math.max(0, Math.floor(positionSec)),
      });
      if (progressDrain.current) return progressDrain.current;
      const drain = async () => {
        while (pendingProgress.current.size) {
          const [id, pending] = pendingProgress.current.entries().next().value!;
          pendingProgress.current.delete(id);
          if (pending.ownerId === sessionRef.current?.user.id)
            await mutateLibrary('/progress', 'PUT', {
              episodeId: id,
              positionSec: pending.positionSec,
            });
        }
      };
      progressDrain.current = drain().finally(() => {
        progressDrain.current = null;
      });
      return progressDrain.current;
    },
    [mutateLibrary],
  );

  const updateQueue = useCallback(
    async (episodeIds: string[]) => {
      if (!requireAccount()) return;
      await mutateLibrary('/queue', 'PUT', { episodeIds: [...new Set(episodeIds)] });
    },
    [mutateLibrary, requireAccount],
  );

  const addBookmark = useCallback(
    async (episodeId: string, positionSec: number, label = '') => {
      if (!requireAccount()) return;
      await mutateLibrary('/bookmarks', 'POST', {
        episodeId,
        positionSec: Math.max(0, Math.floor(positionSec)),
        label,
      });
      notify('حفظنا اللحظة في مكتبتك.');
    },
    [mutateLibrary, notify, requireAccount],
  );

  const publicRead = useCallback(
    <T,>(path: string): Promise<T> => {
      if (!config.apiOrigin) return Promise.reject(new Error('تعذّر تحميل المحتوى الآن.'));
      const cached = publicCache.current.get(path);
      if (cached) return cached as Promise<T>;
      const pending = fetch(`${config.apiOrigin}${path}`, {
        headers: { accept: 'application/json', [CLIENT_SURFACE_HEADER]: 'web' },
      })
        .then(async (response) => {
          if (!response.ok) throw new CustomerRequestError(response.status);
          return response.json() as Promise<T>;
        })
        .catch((failure) => {
          publicCache.current.delete(path);
          throw failure;
        });
      publicCache.current.set(path, pending);
      return pending;
    },
    [config.apiOrigin],
  );

  const value = useMemo(
    () => ({
      config,
      client,
      user,
      profile,
      library,
      loading,
      error,
      notice,
      notify,
      requireAccount,
      refresh,
      updateProfile,
      mutateLibrary,
      toggleSaved,
      toggleFollow,
      saveProgress,
      updateQueue,
      addBookmark,
      publicRead,
    }),
    [
      config,
      client,
      user,
      profile,
      library,
      loading,
      error,
      notice,
      notify,
      requireAccount,
      refresh,
      updateProfile,
      mutateLibrary,
      toggleSaved,
      toggleFollow,
      saveProgress,
      updateQueue,
      addBookmark,
      publicRead,
    ],
  );
  return (
    <CustomerContext.Provider value={value}>
      {children}
      <div className="customer-toast" role="status" aria-live="polite" aria-atomic="true">
        {notice && <span>{notice}</span>}
      </div>
    </CustomerContext.Provider>
  );
}

export function useCustomer(): CustomerContextValue {
  const context = useContext(CustomerContext);
  if (!context) throw new Error('useCustomer must be used within CustomerProvider');
  return context;
}
