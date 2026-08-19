import { RouterProvider } from 'react-router-dom';
import { useMemo } from 'react';
import type { AdminAuthGateway, AdminRepository } from '@/data';
import { AppProviders } from './app/providers';
import { createAdminRouter } from './app/router';

export function App({
  authGateway,
  repository,
}: {
  authGateway: AdminAuthGateway;
  repository: AdminRepository;
}) {
  const router = useMemo(() => createAdminRouter(repository), [repository]);
  return (
    <AppProviders authGateway={authGateway} repository={repository}>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
