import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { CLIENT_SURFACE_HEADER } from '@mukhtalif/types';
import { resolveUser, type AppEnv } from './auth';
import { resolveClientSurface, requireNamespaceSurface } from './surface';
import { ApiConfigurationError, getCorsAllowedOrigins } from './env';
import { publicArticlesRoute, studioArticlesRoute } from './routes/articles';
import { auditRoute } from './routes/audit';
import { plansRoute, subscriberUsersRoute, subscriptionsRoute } from './routes/billing';
import {
  appEpisodesRoute,
  publicEpisodesRoute,
  studioEpisodesRoute,
} from './routes/episodes';
import { studioGuestsRoute } from './routes/guests';
import { publicHomeRoute } from './routes/home';
import { studioInvitationsRoute } from './routes/invitations';
import { followsRoute, meRoute, progressRoute, studioMeRoute } from './routes/me';
import { permissionsRoute } from './routes/permissions';
import { rolesRoute } from './routes/roles';
import { publicShowsRoute, studioShowsRoute } from './routes/shows';
import { studioSummaryRoute } from './routes/summary';
import { studioMembersRoute } from './routes/studio-members';
import { publicMediaRoute, studioMediaRoute } from './routes/media';

/**
 * The API is divided into three namespaces, each with exactly one audience and
 * one authentication model. The division is structural rather than conventional:
 * a handler cannot serve the wrong audience because it is only mounted under the
 * namespace that owns it.
 *
 *   (root)     anonymous published catalogue — no authentication at all
 *   /app/*     signed-in listeners           — an application User
 *   /studio/*  operators                     — a StudioMember plus a permission
 *
 * Before this split, `/shows` and `/episodes` served both the public site and
 * the Studio on one path, and their reads silently widened for a caller holding
 * `episodes.view`. Nothing was deployed yet, so the ambiguous paths were removed
 * outright rather than carried forward as aliases that would preserve exactly
 * the confusion this split exists to end.
 */
const app = new Hono<AppEnv>();

app.use(
  '*',
  cors({
    origin: (origin, c) => {
      const normalized = origin.replace(/\/$/, '');
      return getCorsAllowedOrigins(c.env as AppEnv['Bindings']).includes(normalized)
        ? origin
        : null;
    },
    allowHeaders: ['Authorization', 'Content-Type', 'Accept', 'X-Dev-User', CLIENT_SURFACE_HEADER],
    allowMethods: ['GET', 'HEAD', 'PUT', 'POST', 'DELETE', 'PATCH', 'OPTIONS'],
    maxAge: 600,
  }),
);
app.use('*', resolveClientSurface);
app.use('*', resolveUser);

// A declared surface must match the namespace it is calling. This runs ahead of
// any membership check, so a client wired to the wrong namespace fails plainly
// instead of as a confusing permission error.
app.use('/app/*', requireNamespaceSurface('app'));
app.use('/studio/*', requireNamespaceSurface('studio'));

app.onError((error, c) => {
  if (error instanceof ApiConfigurationError) {
    return c.json({ error: 'API configuration is unavailable' }, 503);
  }
  console.error(error);
  return c.json({ error: 'Internal server error' }, 500);
});

app.get('/', (c) =>
  c.json({
    name: 'mukhtalif-api',
    namespaces: {
      public: {
        audience: 'anonymous',
        surfaces: ['web', 'mobile', 'studio'],
        endpoints: [
          '/home',
          '/shows',
          '/shows/:idOrSlug',
          '/episodes',
          '/episodes/:id',
          '/episodes/:id/audio',
          '/articles',
          '/articles/:slug',
          '/media/:id',
          '/plans',
        ],
      },
      app: {
        audience: 'application user',
        surfaces: ['web', 'mobile'],
        endpoints: [
          '/app/me',
          '/app/me/subscription',
          '/app/follows',
          '/app/progress',
          '/app/episodes/:id/audio',
        ],
      },
      studio: {
        audience: 'studio member',
        surfaces: ['studio'],
        endpoints: [
          '/studio/me',
          '/studio/summary',
          '/studio/invitations/me',
          'POST /studio/invitations/accept',
          '/studio/shows',
          '/studio/episodes',
          '/studio/articles',
          '/studio/guests',
          '/studio/media',
          '/studio/members',
          '/studio/roles',
          '/studio/permissions',
          '/studio/audit-logs',
          '/studio/subscribers',
          '/studio/subscriptions',
        ],
      },
    },
  }),
);

/* ── public: anonymous, published content only ────────────────────────────── */
app.route('/home', publicHomeRoute);
app.route('/shows', publicShowsRoute);
app.route('/episodes', publicEpisodesRoute);
app.route('/articles', publicArticlesRoute);
app.route('/media', publicMediaRoute);
app.route('/plans', plansRoute);

/* ── app: signed-in listeners ─────────────────────────────────────────────── */
app.route('/app/me', meRoute);
app.route('/app/follows', followsRoute);
app.route('/app/progress', progressRoute);
app.route('/app/episodes', appEpisodesRoute);

/* ── studio: operators ────────────────────────────────────────────────────── */
app.route('/studio/me', studioMeRoute);
app.route('/studio/summary', studioSummaryRoute);
app.route('/studio/invitations', studioInvitationsRoute);
app.route('/studio/shows', studioShowsRoute);
app.route('/studio/episodes', studioEpisodesRoute);
app.route('/studio/articles', studioArticlesRoute);
app.route('/studio/guests', studioGuestsRoute);
app.route('/studio/media', studioMediaRoute);
app.route('/studio/members', studioMembersRoute);
app.route('/studio/roles', rolesRoute);
app.route('/studio/permissions', permissionsRoute);
app.route('/studio/audit-logs', auditRoute);
app.route('/studio/subscribers', subscriberUsersRoute);
app.route('/studio/subscriptions', subscriptionsRoute);

export default app;
