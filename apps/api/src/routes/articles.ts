import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  articleStatusSchema,
  createArticleSchema,
  updateArticleSchema,
  updateArticleStatusSchema,
} from '@mukhtalif/validation';
import { requireAdmin, type AppEnv } from '../auth';
import { getRepository } from '../repo';

const listQuerySchema = z.object({
  status: articleStatusSchema.optional(),
});

export const articlesRoute = new Hono<AppEnv>()
  .get('/', zValidator('query', listQuerySchema), async (c) => {
    const { status } = c.req.valid('query');
    const isAdmin = c.get('user')?.role === 'admin';
    const articles = await getRepository(c.env).listArticles({
      status: isAdmin ? status : 'published',
    });
    return c.json(articles);
  })
  .get('/:slug', async (c) => {
    const article = await getRepository(c.env).getArticleBySlug(c.req.param('slug'));
    const isAdmin = c.get('user')?.role === 'admin';
    if (!article || (!isAdmin && article.status !== 'published')) {
      return c.json({ error: 'Article not found' }, 404);
    }
    return c.json(article);
  })
  .post('/', requireAdmin, zValidator('json', createArticleSchema), async (c) => {
    const input = c.req.valid('json');
    const repo = getRepository(c.env);
    if (await repo.getArticleBySlug(input.slug)) {
      return c.json({ error: 'An article with this slug already exists' }, 422);
    }
    const article = await repo.createArticle(input);
    return c.json(article, 201);
  })
  .patch('/:id', requireAdmin, zValidator('json', updateArticleSchema), async (c) => {
    const article = await getRepository(c.env).updateArticle(
      c.req.param('id'),
      c.req.valid('json'),
    );
    if (!article) return c.json({ error: 'Article not found' }, 404);
    return c.json(article);
  })
  .patch('/:id/status', requireAdmin, zValidator('json', updateArticleStatusSchema), async (c) => {
    const { status } = c.req.valid('json');
    const repo = getRepository(c.env);
    const current = await repo.getArticle(c.req.param('id'));
    if (!current) return c.json({ error: 'Article not found' }, 404);
    const publishedAt =
      status === 'published' && !current.publishedAt ? new Date().toISOString() : undefined;
    const article = await repo.updateArticleStatus(current.id, status, publishedAt);
    return c.json(article);
  });
