import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { adminRouteIds, adminRoutePatterns } from '@/application';
import type { AdminAuthGateway, AdminRepository } from '@/data';
import { InviteView } from '@/features/auth/ui/invite-page';
import {
  AdminRouteLayout,
  RoleDirectoryRouteLayout,
  StudioMemberDirectoryRouteLayout,
  SubscriberRouteLayout,
} from './admin-route-layout';
import { NotFoundView } from './not-found-view';
import { RouteErrorView } from './route-error-view';
import { StudioLayout } from './studio-layout';

const featureRoutes = [
  {
    id: adminRouteIds.overview,
    index: true,
    handle: { studioPage: 'overview' },
    lazy: () => import('./routes/overview.route'),
  },
  {
    id: adminRouteIds.episodes,
    path: adminRoutePatterns.episodes,
    handle: { studioPage: 'episodes' },
    lazy: () => import('./routes/episodes.route'),
  },
  {
    id: adminRouteIds.episodeNew,
    path: adminRoutePatterns.episodeNew,
    handle: { studioPage: 'episodes', studioAction: 'manage' },
    lazy: () => import('./routes/episode-editor.route'),
  },
  {
    id: adminRouteIds.episodeDetails,
    path: adminRoutePatterns.episodeDetails,
    handle: { studioPage: 'episodes' },
    lazy: () => import('./routes/episode-editor.route'),
  },
  {
    id: adminRouteIds.shows,
    path: adminRoutePatterns.shows,
    handle: { studioPage: 'shows' },
    lazy: () => import('./routes/shows.route'),
  },
  {
    id: adminRouteIds.showNew,
    path: adminRoutePatterns.showNew,
    handle: { studioPage: 'shows', studioAction: 'manage' },
    lazy: () => import('./routes/show-new.route'),
  },
  {
    id: adminRouteIds.articles,
    path: adminRoutePatterns.articles,
    handle: { studioPage: 'articles' },
    lazy: () => import('./routes/articles.route'),
  },
  {
    id: adminRouteIds.articleNew,
    path: adminRoutePatterns.articleNew,
    handle: { studioPage: 'articles', studioAction: 'manage' },
    lazy: () => import('./routes/article-new.route'),
  },
  {
    id: adminRouteIds.articleDetails,
    path: adminRoutePatterns.articleDetails,
    handle: { studioPage: 'articles' },
    lazy: () => import('./routes/article-editor.route'),
  },
] satisfies RouteObject[];

const guestRoutes = [
  {
    id: adminRouteIds.guests,
    path: adminRoutePatterns.guests,
    handle: { studioPage: 'guests' },
    lazy: () => import('./routes/guests.route'),
  },
  {
    id: adminRouteIds.guestNew,
    path: adminRoutePatterns.guestNew,
    handle: { studioPage: 'guests', studioAction: 'manage' },
    lazy: () => import('./routes/guest-new.route'),
  },
  {
    id: adminRouteIds.guestDetails,
    path: adminRoutePatterns.guestDetails,
    handle: { studioPage: 'guests' },
    lazy: () => import('./routes/guest-profile.route'),
  },
] satisfies RouteObject[];

export function createAdminRoutes(repository: AdminRepository, authGateway: AdminAuthGateway): RouteObject[] {
  return [
    {
      id: adminRouteIds.login,
      path: adminRoutePatterns.login,
      lazy: () => import('./routes/login.route'),
      errorElement: <RouteErrorView />,
    },
    {
      // Public by design: an invitee has no Studio membership until they
      // accept, so this route must sit outside every authenticated layout.
      id: adminRouteIds.invite,
      path: adminRoutePatterns.invite,
      element: <InviteView authGateway={authGateway} repository={repository} />,
      errorElement: <RouteErrorView />,
    },
    {
      id: adminRouteIds.studio,
      path: adminRoutePatterns.root,
      element: <StudioLayout repository={repository} />,
      errorElement: <RouteErrorView />,
      children: [
        ...featureRoutes,
        ...(repository.capabilities['guest-management'] ? guestRoutes : []),
        {
          element: <SubscriberRouteLayout repository={repository} />,
          children: [
            {
              id: adminRouteIds.subscribers,
              path: adminRoutePatterns.subscribers,
              handle: { studioPage: 'subscribers' },
              lazy: () => import('./routes/subscribers.route'),
            },
          ],
        },
        {
          element: <AdminRouteLayout repository={repository} />,
          children: [
            ...(repository.capabilities['access-management']
              ? [
                  {
                    element: <RoleDirectoryRouteLayout repository={repository} />,
                    children: [
                      {
                        id: adminRouteIds.roles,
                        path: adminRoutePatterns.roles,
                        handle: { studioPage: 'access' },
                        lazy: () => import('./routes/roles.route'),
                      },
                      {
                        id: adminRouteIds.roleNew,
                        path: adminRoutePatterns.roleNew,
                        handle: { studioPage: 'access', studioAction: 'manage' },
                        lazy: () => import('./routes/role-new.route'),
                      },
                      {
                        id: adminRouteIds.roleDetails,
                        path: adminRoutePatterns.roleDetails,
                        handle: { studioPage: 'access' },
                        lazy: () => import('./routes/role-details.route'),
                      },
                      {
                        id: adminRouteIds.accessLegacy,
                        path: adminRoutePatterns.access,
                        handle: { studioPage: 'access' },
                        lazy: () => import('./routes/access.route'),
                      },
                    ],
                  },
                  {
                    element: <StudioMemberDirectoryRouteLayout repository={repository} />,
                    children: [
                      {
                        id: adminRouteIds.studioMembers,
                        path: adminRoutePatterns.studioMembers,
                        handle: { studioPage: 'access' },
                        lazy: () => import('./routes/users.route'),
                      },
                      {
                        id: adminRouteIds.studioMemberNew,
                        path: adminRoutePatterns.studioMemberNew,
                        handle: { studioPage: 'access', studioAction: 'manage' },
                        lazy: () => import('./routes/user-new.route'),
                      },
                    ],
                  },
                ]
              : []),
          ],
        },
        {
          id: adminRouteIds.notFound,
          path: adminRoutePatterns.notFound,
          element: <NotFoundView />,
        },
      ],
    },
  ];
}

export function createAdminRouter(repository: AdminRepository, authGateway: AdminAuthGateway) {
  return createBrowserRouter(createAdminRoutes(repository, authGateway));
}
