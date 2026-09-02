import { createContext, useContext } from 'react';
import type {
  AdminSubscriberDirectory,
  SubscriptionId,
  SubscriptionStatus,
  UserId,
} from '@/lib';

export interface SubscriberDirectoryContextValue {
  readonly data: AdminSubscriberDirectory;
  readonly isMutating: boolean;
  transitionSubscriptionStatus(
    id: SubscriptionId,
    status: SubscriptionStatus,
  ): Promise<void>;
  activatePlus(userId: UserId): Promise<void>;
}

export const SubscriberDirectoryContext =
  createContext<SubscriberDirectoryContextValue | null>(null);

export function useSubscriberDirectory(): SubscriberDirectoryContextValue {
  const context = useContext(SubscriberDirectoryContext);
  if (!context) {
    throw new Error(
      'useSubscriberDirectory must be used inside SubscriberDirectoryProvider.',
    );
  }
  return context;
}
