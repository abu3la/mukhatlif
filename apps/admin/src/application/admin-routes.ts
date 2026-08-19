import type { ArticleId, EpisodeId, GuestId, RoleId, StudioPageId } from '@/lib';

export const adminRouteIds = {
  studio: 'studio',
  login: 'login',
  overview: 'overview',
  episodes: 'episodes',
  episodeNew: 'episode-new',
  episodeDetails: 'episode-details',
  shows: 'shows',
  showNew: 'show-new',
  guests: 'guests',
  guestNew: 'guest-new',
  guestDetails: 'guest-details',
  articles: 'articles',
  articleNew: 'article-new',
  articleDetails: 'article-details',
  subscribers: 'subscribers',
  roles: 'roles',
  roleNew: 'role-new',
  roleDetails: 'role-details',
  studioMembers: 'studio-members',
  studioMemberNew: 'studio-member-new',
  accessLegacy: 'access-legacy',
  notFound: 'not-found',
} as const;

export const adminRoutePatterns = {
  root: '/',
  login: '/login',
  episodes: '/episodes',
  episodeNew: '/episodes/new',
  episodeDetails: '/episodes/:episodeId',
  shows: '/shows',
  showNew: '/shows/new',
  guests: '/guests',
  guestNew: '/guests/new',
  guestDetails: '/guests/:guestId',
  articles: '/articles',
  articleNew: '/articles/new',
  articleDetails: '/articles/:articleId',
  subscribers: '/subscribers',
  roles: '/roles',
  roleNew: '/roles/new',
  roleDetails: '/roles/:roleId',
  studioMembers: '/users',
  studioMemberNew: '/users/new',
  access: '/access',
  notFound: '*',
} as const;

export const adminPaths = {
  overview: adminRoutePatterns.root,
  login: adminRoutePatterns.login,
  episodes: adminRoutePatterns.episodes,
  episodeNew: adminRoutePatterns.episodeNew,
  episode: (episodeId: EpisodeId): `/episodes/${string}` =>
    `/episodes/${encodeURIComponent(episodeId)}`,
  shows: adminRoutePatterns.shows,
  showNew: adminRoutePatterns.showNew,
  guests: adminRoutePatterns.guests,
  guestNew: adminRoutePatterns.guestNew,
  guest: (guestId: GuestId): `/guests/${string}` =>
    `/guests/${encodeURIComponent(guestId)}`,
  articles: adminRoutePatterns.articles,
  articleNew: adminRoutePatterns.articleNew,
  article: (articleId: ArticleId): `/articles/${string}` =>
    `/articles/${encodeURIComponent(articleId)}`,
  subscribers: adminRoutePatterns.subscribers,
  roles: adminRoutePatterns.roles,
  roleNew: adminRoutePatterns.roleNew,
  role: (roleId: RoleId): `/roles/${string}` =>
    `/roles/${encodeURIComponent(roleId)}`,
  studioMembers: adminRoutePatterns.studioMembers,
  studioMemberNew: adminRoutePatterns.studioMemberNew,
  access: adminRoutePatterns.access,
} as const;

export const adminPagePaths = {
  overview: adminPaths.overview,
  episodes: adminPaths.episodes,
  shows: adminPaths.shows,
  guests: adminPaths.guests,
  articles: adminPaths.articles,
  subscribers: adminPaths.subscribers,
  access: adminPaths.roles,
} as const satisfies Record<StudioPageId, string>;

export type AdminRouteId = (typeof adminRouteIds)[keyof typeof adminRouteIds];
export type AdminRoutePattern =
  (typeof adminRoutePatterns)[keyof typeof adminRoutePatterns];
