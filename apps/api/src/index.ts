import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { resolveUser, type AppEnv } from './auth';
import { articlesRoute } from './routes/articles';
import { plansRoute, subscriptionsRoute } from './routes/billing';
import { episodesRoute } from './routes/episodes';
import { followsRoute, meRoute, progressRoute } from './routes/me';
import { showsRoute } from './routes/shows';
import { usersRoute } from './routes/users';

const app = new Hono<AppEnv>();

app.use('*', cors());
app.use('*', resolveUser);

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
      '/plans',
      '/subscriptions',
      '/me',
      '/me/subscription',
      '/follows',
      '/progress',
      '/users',
    ],
  }),
);

app.route('/shows', showsRoute);
app.route('/episodes', episodesRoute);
app.route('/articles', articlesRoute);
app.route('/plans', plansRoute);
app.route('/subscriptions', subscriptionsRoute);
app.route('/me', meRoute);
app.route('/follows', followsRoute);
app.route('/progress', progressRoute);
app.route('/users', usersRoute);

export default app;
