import { STUDIO_PAGE_IDS } from '@mukhtalif/types';
import { useMemo } from 'react';
import { Navigate, Outlet, useLocation, useMatches } from 'react-router-dom';
import {
  adminPagePaths,
  canManagePage,
  canViewPage,
  firstViewablePage,
  hasStudioAccess,
  useAdminAuth,
} from '@/application';
import type { AdminRepository } from '@/data';
import type { StudioPageId } from '@/lib';
import { StudioDataProvider } from './providers/studio-data-provider';
import {
  AccessDeniedView,
  AdminRouteDeniedView,
  AuthErrorView,
  AuthLoadingView,
} from './auth-state-views';
import { isStudioPageAvailable, StudioShell } from './layout/studio-shell';

interface StudioRouteRequirement {
  readonly page: StudioPageId;
  readonly action: 'view' | 'manage';
}

function routeRequirementFromMatches(
  matches: ReturnType<typeof useMatches>,
): StudioRouteRequirement | null {
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const handle = matches[index]?.handle;
    if (!handle || typeof handle !== 'object' || !('studioPage' in handle)) continue;
    const page = handle.studioPage;
    if (
      typeof page === 'string' &&
      (STUDIO_PAGE_IDS as readonly string[]).includes(page)
    ) {
      return {
        page: page as StudioPageId,
        action:
          'studioAction' in handle && handle.studioAction === 'manage'
            ? 'manage'
            : 'view',
      };
    }
  }
  return null;
}

export function StudioLayout({ repository }: { repository: AdminRepository }) {
  const location = useLocation();
  const matches = useMatches();
  const auth = useAdminAuth();
  const returnTo = `${location.pathname}${location.search}${location.hash}`;
  const loginRedirectState = useMemo(() => ({ returnTo }), [returnTo]);

  if (auth.status === 'restoring') return <AuthLoadingView />;
  if (auth.status === 'signed-out') {
    return (
      <Navigate
        to="/login"
        replace
        state={loginRedirectState}
      />
    );
  }
  if (auth.status === 'error') return <AuthErrorView />;
  if (auth.status === 'denied') return <AccessDeniedView email={auth.deniedEmail} />;
  if (!auth.viewer || !hasStudioAccess(auth.viewer)) {
    return <AccessDeniedView viewer={auth.viewer} />;
  }

  const viewer = auth.viewer;
  const firstPage = firstViewablePage(viewer, (page) =>
    isStudioPageAvailable(page, repository.capabilities),
  );
  if (!firstPage) return <AccessDeniedView viewer={viewer} />;

  const routeRequirement = routeRequirementFromMatches(matches);
  if (routeRequirement?.page === 'overview' && !canViewPage(viewer, 'overview')) {
    return <Navigate to={adminPagePaths[firstPage]} replace />;
  }
  const routeAllowed = routeRequirement
    ? routeRequirement.action === 'manage'
      ? canManagePage(viewer, routeRequirement.page)
      : canViewPage(viewer, routeRequirement.page)
    : true;
  if (routeRequirement && !routeAllowed) {
    return (
      <StudioShell capabilities={repository.capabilities} viewer={viewer}>
        <AdminRouteDeniedView
          page={routeRequirement.page}
          action={routeRequirement.action}
          fallbackPage={firstPage}
        />
      </StudioShell>
    );
  }

  return (
    <StudioDataProvider repository={repository} viewer={viewer}>
      <StudioShell capabilities={repository.capabilities} viewer={viewer}>
        <Outlet />
      </StudioShell>
    </StudioDataProvider>
  );
}
