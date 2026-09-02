import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import type { AdminAuthGateway, AdminRepository } from '@/data';
import { AdminAuthProvider } from './providers/admin-auth-provider';

export function AppProviders({
  children,
  authGateway,
  repository,
  queryClient: providedQueryClient,
}: {
  children: ReactNode;
  authGateway: AdminAuthGateway;
  repository: AdminRepository;
  queryClient?: QueryClient;
}) {
  const [queryClient] = useState(
    () =>
      providedQueryClient ??
      new QueryClient({
          defaultOptions: {
            queries: { staleTime: 30_000, retry: 1 },
            mutations: { retry: 0 },
          },
        }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AdminAuthProvider authGateway={authGateway} repository={repository}>
        {children}
      </AdminAuthProvider>
    </QueryClientProvider>
  );
}
