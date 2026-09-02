import { Outlet } from 'react-router-dom';
import {
  FormSubmissionRepositoryContext,
  NewsletterRepositoryContext,
  canViewPage,
  useAdminAuth,
} from '@/application';
import type { AdminRepository } from '@/data';
import { AdminRouteDeniedView } from './auth-state-views';
import { StudioMemberDirectoryProvider } from './providers/admin-directory-provider';
import { SubscriberDirectoryProvider } from './providers/subscriber-directory-provider';

export function AdminRouteLayout(_props: { repository: AdminRepository }) {
  const { viewer } = useAdminAuth();
  if (!viewer || !canViewPage(viewer, 'access')) {
    return <AdminRouteDeniedView page="access" />;
  }
  return <Outlet />;
}

export function RoleDirectoryRouteLayout({ repository }: { repository: AdminRepository }) {
  const { retry, viewer } = useAdminAuth();
  if (!viewer || !canViewPage(viewer, 'access')) {
    return <AdminRouteDeniedView page="access" />;
  }
  return (
    <StudioMemberDirectoryProvider
      repository={repository}
      scope="roles"
      viewer={viewer}
      onViewerRoleUpdated={retry}
    >
      <Outlet />
    </StudioMemberDirectoryProvider>
  );
}

export function StudioMemberDirectoryRouteLayout({ repository }: { repository: AdminRepository }) {
  const { viewer } = useAdminAuth();
  if (!viewer || !canViewPage(viewer, 'access')) {
    return <AdminRouteDeniedView page="access" />;
  }
  return (
    <StudioMemberDirectoryProvider repository={repository} scope="members" viewer={viewer}>
      <Outlet />
    </StudioMemberDirectoryProvider>
  );
}

export function SubscriberRouteLayout({ repository }: { repository: AdminRepository }) {
  const { viewer } = useAdminAuth();
  if (!viewer || !canViewPage(viewer, 'subscribers')) {
    return <AdminRouteDeniedView page="subscribers" />;
  }
  return (
    <SubscriberDirectoryProvider repository={repository} viewer={viewer}>
      <Outlet />
    </SubscriberDirectoryProvider>
  );
}

export function FormSubmissionRouteLayout({ repository }: { repository: AdminRepository }) {
  const { viewer } = useAdminAuth();
  if (!viewer || !canViewPage(viewer, 'forms')) {
    return <AdminRouteDeniedView page="forms" />;
  }
  return (
    <FormSubmissionRepositoryContext.Provider value={repository}>
      <Outlet />
    </FormSubmissionRepositoryContext.Provider>
  );
}

export function NewsletterRouteLayout({ repository }: { repository: AdminRepository }) {
  const { viewer } = useAdminAuth();
  if (!viewer || !canViewPage(viewer, 'subscribers')) {
    return <AdminRouteDeniedView page="subscribers" />;
  }
  return (
    <NewsletterRepositoryContext.Provider value={repository}>
      <Outlet />
    </NewsletterRepositoryContext.Provider>
  );
}
