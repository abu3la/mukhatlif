import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { resolveUser, type AppEnv } from './auth';
import { ApiConfigurationError, getCorsAllowedOrigins } from './env';
import { publicArticlesRoute, studioArticlesRoute } from './routes/articles';
import { auditRoute } from './routes/audit';
import { plansRoute, subscriberUsersRoute, subscriptionsRoute } from './routes/billing';
import { episodesRoute } from './routes/episodes';
import { studioGuestsRoute } from './routes/guests';
import { studioInvitationsRoute } from './routes/invitations';
import { followsRoute, meRoute, progressRoute, studioMeRoute } from './routes/me';
import { permissionsRoute } from './routes/permissions';
import { rolesRoute } from './routes/roles';
import { showsRoute } from './routes/shows';
import { studioSummaryRoute } from './routes/summary';
import { studioMembersRoute } from './routes/studio-members';
import { publicMediaRoute, studioMediaRoute } from './routes/media';

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
    allowHeaders: ['Authorization', 'Content-Type', 'Accept', 'X-Dev-User'],
    allowMethods: ['GET', 'HEAD', 'PUT', 'POST', 'DELETE', 'PATCH', 'OPTIONS'],
    maxAge: 600,
  }),
);
app.use('*', resolveUser);

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
    endpoints: [
      '/shows',
      '/shows/:idOrSlug',
      '/episodes',
      '/episodes/:id',
      '/episodes/:id/status',
      '/episodes/:id/audio',
      '/articles',
      '/articles/:slug',
      '/media/:id',
      '/studio/media',
      'POST /studio/media/uploads',
      'PUT /studio/media/uploads/:id/content',
      '/studio/guests',
      '/studio/guests/:id',
      '/studio/guests/:id/socials',
      '/studio/guests/socials/:socialId',
      '/studio/guests/:id/appearances',
      '/studio/summary',
      '/studio/invitations/me',
      'POST /studio/invitations/accept',
      '/studio/articles',
      '/studio/articles/:idOrSlug',
      '/studio/articles/mailchimp/capability',
      'POST /studio/articles/:id/newsletter/preview',
      'POST /studio/articles/:id/newsletter/campaign',
      'POST /studio/articles/:id/newsletter/send',
      'POST /studio/articles/:id/newsletter/reconcile',
      '/plans',
      '/subscriptions',
      '/subscriber-users',
      '/me',
      '/studio/me',
      '/me/subscription',
      '/follows',
      '/progress',
      '/studio-members',
      'POST /studio-members',
      '/studio-members/:id/role',
      '/audit-logs',
      '/permissions',
      'PUT /permissions/:roleId',
      '/roles',
      'POST /roles',
      '/roles/:roleId',
    ],
  }),
);

app.route('/shows', showsRoute);
app.route('/episodes', episodesRoute);
app.route('/articles', publicArticlesRoute);
app.route('/studio/articles', studioArticlesRoute);
app.route('/media', publicMediaRoute);
app.route('/studio/media', studioMediaRoute);
app.route('/studio/guests', studioGuestsRoute);
app.route('/studio/summary', studioSummaryRoute);
app.route('/studio/invitations', studioInvitationsRoute);
app.route('/plans', plansRoute);
app.route('/subscriptions', subscriptionsRoute);
app.route('/subscriber-users', subscriberUsersRoute);
app.route('/me', meRoute);
app.route('/studio/me', studioMeRoute);
app.route('/follows', followsRoute);
app.route('/progress', progressRoute);
app.route('/studio-members', studioMembersRoute);
app.route('/audit-logs', auditRoute);
app.route('/permissions', permissionsRoute);
app.route('/roles', rolesRoute);

export default app;
