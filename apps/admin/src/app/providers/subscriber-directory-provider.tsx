import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
import {
  canManagePage,
  canViewPage,
  SubscriberDirectoryContext,
  type SubscriberDirectoryContextValue,
} from '@/application';
import type { AdminRepository } from '@/data';
import { AdminRepositoryError } from '@/data/repository-error';
import type { AdminViewer } from '@/lib';

function SubscriberDirectoryLoadingState() {
  return (
    <section className="embedded-state" aria-busy="true" aria-live="polite">
      <p>جارٍ تحميل بيانات المشتركين…</p>
    </section>
  );
}

function SubscriberDirectoryErrorState({ onRetry }: { onRetry(): void }) {
  return (
    <section className="embedded-state" role="alert">
      <h1>تعذر تحميل بيانات المشتركين</h1>
      <p>تعذّر تحميل بيانات المشتركين. حاول مرة أخرى.</p>
      <button className="button button--primary" type="button" onClick={onRetry}>
        إعادة المحاولة
      </button>
    </section>
  );
}

function subscribersForbidden(operation: string): AdminRepositoryError {
  return new AdminRepositoryError({
    code: 'FORBIDDEN',
    operation,
    message: 'Subscriber-management permission is required.',
    retryable: false,
    context: { requiredPermission: 'subscribers.manage' },
  });
}

export function SubscriberDirectoryProvider({
  children,
  repository,
  viewer,
}: {
  children: ReactNode;
  repository: AdminRepository;
  viewer: AdminViewer;
}) {
  const queryClient = useQueryClient();
  const [activeOperations, setActiveOperations] = useState(0);
  const queryKey = useMemo(
    () => ['admin-studio', repository.kind, viewer.id, 'subscriber-directory'] as const,
    [repository.kind, viewer.id],
  );
  const directoryQuery = useQuery({
    queryKey,
    queryFn: () => {
      if (!canViewPage(viewer, 'subscribers')) {
        throw subscribersForbidden('readSubscriberDirectory');
      }
      return repository.readSubscriberDirectory();
    },
  });

  const refresh = useCallback(async () => {
    queryClient.setQueryData(queryKey, await repository.readSubscriberDirectory());
  }, [queryClient, queryKey, repository]);

  const runOperation = useCallback(
    async <T,>(operation: () => Promise<T>): Promise<T> => {
      setActiveOperations((count) => count + 1);
      try {
        const result = await operation();
        await refresh();
        return result;
      } finally {
        setActiveOperations((count) => Math.max(0, count - 1));
      }
    },
    [refresh],
  );

  const value = useMemo<SubscriberDirectoryContextValue | null>(() => {
    if (!directoryQuery.data) return null;
    const data = directoryQuery.data;
    return {
      data,
      isMutating: activeOperations > 0,
      transitionSubscriptionStatus: (id, status) =>
        runOperation(async () => {
          if (!canManagePage(viewer, 'subscribers')) {
            throw subscribersForbidden('transitionSubscriptionStatus');
          }
          await repository.transitionSubscription(id, status);
        }),
      activatePlus: (userId) =>
        runOperation(async () => {
          if (!canManagePage(viewer, 'subscribers')) {
            throw subscribersForbidden('activatePlus');
          }
          await repository.createSubscription({ userId, planId: data.plusPlan.id });
        }),
    };
  }, [activeOperations, directoryQuery.data, repository, runOperation, viewer]);

  if (directoryQuery.isPending) return <SubscriberDirectoryLoadingState />;
  if (directoryQuery.error) {
    return (
      <SubscriberDirectoryErrorState onRetry={() => void directoryQuery.refetch()} />
    );
  }
  if (!value) return <SubscriberDirectoryLoadingState />;

  return (
    <SubscriberDirectoryContext.Provider value={value}>
      {children}
    </SubscriberDirectoryContext.Provider>
  );
}
