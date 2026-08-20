import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  toPaginatedList,
  type Article,
  type ArticleAuthor,
  type MailchimpCapability,
  type NewsletterCampaignResult,
  type NewsletterSendResult,
} from '@mukhtalif/types';
import {
  articleStatusSchema,
  createArticleSchema,
  isPaginatedRequest,
  listQuerySchema,
  resolveListQuery,
  normalizeArticleAuthorDisplayName,
  sendNewsletterSchema,
  syncNewsletterCampaignSchema,
  updateArticleSchema,
  updateArticleStatusSchema,
  type ArticleAuthorInput,
} from '@mukhtalif/validation';
import { requirePermission, type AppEnv } from '../auth';
import { getMailchimpConfig, getMediaPublicOrigin } from '../env';
import { MailchimpApiError, MailchimpClient } from '../mailchimp/client';
import { ArticleMutationError } from '../publishing/article-record';
import { renderNewsletter } from '../publishing/newsletter';
import { createAudienceConfirmationToken } from '../publishing/mailchimp-confirmation';
import { hasMeaningfulRichText, toPublishedArticle } from '../publishing/rich-text';
import { renderRichText } from '../publishing/rich-text';
import { canonicalizeRichTextMedia, MediaReferenceError } from '../publishing/media';
import { getRepository, type Repository } from '../repo';

const studioArticleListQuerySchema = listQuerySchema
  .extend({ status: articleStatusSchema.optional() })
  .strict();

const newsletterError = (code: string, error: string) => ({ code, error });
const NEWSLETTER_SEND_LEASE_MS = 15 * 60_000;

function newsletterReadiness(article: Article): string | null {
  if (!article.newsletter.enabled) return 'NEWSLETTER_DISABLED';
  if (!article.newsletter.subject?.trim()) return 'NEWSLETTER_SUBJECT_REQUIRED';
  if (!hasMeaningfulRichText(article.content)) return 'NEWSLETTER_CONTENT_REQUIRED';
  return null;
}

function mailchimpFailure(error: unknown): {
  status: 502 | 503;
  body: { code: string; error: string };
} {
  if (error instanceof MailchimpApiError) {
    return {
      status: error.status === 503 ? 503 : 502,
      body: newsletterError('MAILCHIMP_UNAVAILABLE', 'Mailchimp is temporarily unavailable'),
    };
  }
  throw error;
}

async function canonicalContent(
  repo: Repository,
  content: Article['content'],
): Promise<Article['content']> {
  return canonicalizeRichTextMedia(content, (id) => repo.getMediaAsset(id));
}

async function resolveArticleAuthor(
  repo: Repository,
  input: ArticleAuthorInput,
): Promise<ArticleAuthor | null> {
  if (input.type === 'custom') {
    return { type: 'custom', displayName: input.displayName };
  }
  const member = await repo.getStudioMember(input.studioMemberId);
  if (!member) return null;
  const displayName = normalizeArticleAuthorDisplayName(member.displayName);
  if (!displayName) return null;
  return {
    type: 'studio_member',
    studioMemberId: member.id,
    displayName,
  };
}

function mediaReferenceFailure(error: unknown): { code: string; error: string } | null {
  return error instanceof MediaReferenceError
    ? newsletterError(error.code, 'Article media must be uploaded and ready')
    : null;
}

function hasMedia(content: Article['content']): boolean {
  return (content.content ?? []).some((node) =>
    ['imageBlock', 'imageGallery', 'videoEmbed'].includes(node.type),
  );
}

/** Public, published-only API. It never returns Studio source or delivery metadata. */
export const publicArticlesRoute = new Hono<AppEnv>()
  .get('/', zValidator('query', listQuerySchema), async (c) => {
    const input = c.req.valid('query');
    const repo = getRepository(c.env);
    const mediaOrigin = getMediaPublicOrigin(c.env, new URL(c.req.url).origin);
    const render = (article: Article) => ({
      ...toPublishedArticle(article),
      contentHtml: renderRichText(article.content, { mediaBaseUrl: mediaOrigin ?? undefined }),
    });
    const filter = { status: 'published' as const };
    if (!isPaginatedRequest(input)) {
      return c.json((await repo.listArticles(filter)).map(render));
    }
    const query = resolveListQuery(input);
    const page = await repo.listArticlesPage(filter, query);
    return c.json(toPaginatedList({ items: page.items.map(render), total: page.total }, query));
  })
  .get('/:slug', async (c) => {
    const article = await getRepository(c.env).getArticleBySlug(c.req.param('slug'));
    if (!article || article.status !== 'published') {
      return c.json({ error: 'Article not found' }, 404);
    }
    const mediaOrigin = getMediaPublicOrigin(c.env, new URL(c.req.url).origin);
    return c.json({
      ...toPublishedArticle(article),
      contentHtml: renderRichText(article.content, { mediaBaseUrl: mediaOrigin ?? undefined }),
    });
  });

/** Authenticated Studio API for canonical source and publishing operations. */
export const studioArticlesRoute = new Hono<AppEnv>()
  .use('*', requirePermission('articles.view'))
  .get('/authors', async (c) => {
    return c.json(await getRepository(c.env).listArticleAuthorCandidates());
  })
  .get('/mailchimp/capability', async (c) => {
    const config = getMailchimpConfig(c.env);
    if (!config) {
      const capability: MailchimpCapability = { mode: 'live', configured: false };
      return c.json(capability);
    }
    let audience: { name: string; count: number } | null = null;
    try {
      audience = await new MailchimpClient(config).getAudienceSummary();
    } catch (error) {
      if (!(error instanceof MailchimpApiError)) throw error;
    }
    const capability: MailchimpCapability = {
      mode: 'live',
      configured: true,
      fromName: config.fromName,
      replyTo: config.replyTo,
      audienceName: audience?.name,
      audienceCount: audience?.count,
      audienceConfirmationToken: audience
        ? await createAudienceConfirmationToken(config)
        : undefined,
    };
    return c.json(capability);
  })
  .get('/', zValidator('query', studioArticleListQuerySchema), async (c) => {
    const input = c.req.valid('query');
    const filter = { status: input.status };
    const repo = getRepository(c.env);
    if (!isPaginatedRequest(input)) return c.json(await repo.listArticles(filter));
    const query = resolveListQuery(input);
    return c.json(toPaginatedList(await repo.listArticlesPage(filter, query), query));
  })
  .post(
    '/',
    requirePermission('articles.manage'),
    zValidator('json', createArticleSchema),
    async (c) => {
      const input = c.req.valid('json');
      const repo = getRepository(c.env);
      if (await repo.getArticleBySlug(input.slug)) {
        return c.json({ error: 'An article with this slug already exists' }, 422);
      }
      try {
        const author = await resolveArticleAuthor(repo, input.author);
        if (!author) {
          return c.json(
            newsletterError('ARTICLE_AUTHOR_NOT_FOUND', 'Selected Studio author does not exist'),
            422,
          );
        }
        const content = await canonicalContent(repo, input.content);
        const article = await repo.createArticle({ ...input, author, content });
        return c.json(article, 201);
      } catch (error) {
        const failure = mediaReferenceFailure(error);
        if (failure) return c.json(failure, 422);
        throw error;
      }
    },
  )
  .patch(
    '/:id',
    requirePermission('articles.manage'),
    zValidator('json', updateArticleSchema),
    async (c) => {
      const id = c.req.param('id');
      const input = c.req.valid('json');
      const repo = getRepository(c.env);
      const current = await repo.getArticle(id);
      if (!current) return c.json({ error: 'Article not found' }, 404);
      if (input.expectedVersion !== current.version) {
        return c.json(
          newsletterError('ARTICLE_VERSION_CONFLICT', 'Article changed; reload it'),
          409,
        );
      }
      if (input.slug && input.slug !== current.slug) {
        const duplicate = await repo.getArticleBySlug(input.slug);
        if (duplicate && duplicate.id !== id) {
          return c.json({ error: 'An article with this slug already exists' }, 422);
        }
      }
      try {
        const { author: requestedAuthor, content: requestedContent, ...remainingInput } = input;
        const author = requestedAuthor
          ? await resolveArticleAuthor(repo, requestedAuthor)
          : undefined;
        if (requestedAuthor && !author) {
          return c.json(
            newsletterError('ARTICLE_AUTHOR_NOT_FOUND', 'Selected Studio author does not exist'),
            422,
          );
        }
        const content = requestedContent
          ? await canonicalContent(repo, requestedContent)
          : undefined;
        const article = await repo.updateArticle(id, {
          ...remainingInput,
          ...(author ? { author } : {}),
          ...(content ? { content } : {}),
        });
        if (!article) {
          return c.json(
            newsletterError('ARTICLE_WRITE_CONFLICT', 'Article changed; reload it'),
            409,
          );
        }
        return c.json(article);
      } catch (error) {
        if (error instanceof ArticleMutationError) {
          const status = error.code === 'COVER_ALT_REQUIRED' ? 422 : 409;
          return c.json(newsletterError(error.code, 'Article update is not allowed'), status);
        }
        const failure = mediaReferenceFailure(error);
        if (failure) return c.json(failure, 422);
        throw error;
      }
    },
  )
  .patch(
    '/:id/status',
    requirePermission('articles.manage'),
    zValidator('json', updateArticleStatusSchema),
    async (c) => {
      const { status, expectedVersion } = c.req.valid('json');
      const repo = getRepository(c.env);
      const current = await repo.getArticle(c.req.param('id'));
      if (!current) return c.json({ error: 'Article not found' }, 404);
      if (expectedVersion !== current.version) {
        return c.json(
          newsletterError('ARTICLE_VERSION_CONFLICT', 'Article changed; reload it'),
          409,
        );
      }
      if (status === 'published' && !hasMeaningfulRichText(current.content)) {
        return c.json(
          newsletterError('ARTICLE_CONTENT_REQUIRED', 'Article content is required'),
          422,
        );
      }
      if (status === 'published') {
        try {
          await canonicalContent(repo, current.content);
        } catch (error) {
          const failure = mediaReferenceFailure(error);
          if (failure) return c.json(failure, 422);
          throw error;
        }
        const mediaOrigin = getMediaPublicOrigin(c.env, new URL(c.req.url).origin);
        if (hasMedia(current.content) && (!c.env.MEDIA || !mediaOrigin)) {
          return c.json(
            newsletterError('MEDIA_PUBLIC_UNAVAILABLE', 'Article media is not publicly available'),
            503,
          );
        }
      }
      const publishedAt =
        status === 'published' && !current.publishedAt ? new Date().toISOString() : undefined;
      const article = await repo.updateArticleStatus(
        current.id,
        status,
        expectedVersion,
        publishedAt,
      );
      if (!article) {
        return c.json(newsletterError('ARTICLE_WRITE_CONFLICT', 'Article changed; reload it'), 409);
      }
      return c.json(article);
    },
  )
  .post('/:id/newsletter/preview', async (c) => {
    const repo = getRepository(c.env);
    const article = await repo.getArticle(c.req.param('id'));
    if (!article) return c.json({ error: 'Article not found' }, 404);
    if (
      article.newsletter.status === 'sent' &&
      article.newsletter.syncedVersion !== article.version
    ) {
      return c.json(
        newsletterError(
          'SENT_NEWSLETTER_PREVIEW_STALE',
          'The web article changed after this newsletter was sent',
        ),
        409,
      );
    }
    const readiness = newsletterReadiness(article);
    if (readiness) {
      return c.json(newsletterError(readiness, 'Newsletter is not ready'), 422);
    }
    const config = getMailchimpConfig(c.env);
    const mediaOrigin = getMediaPublicOrigin(c.env, new URL(c.req.url).origin);
    if (hasMedia(article.content) && (!c.env.MEDIA || !mediaOrigin)) {
      return c.json(
        newsletterError('MEDIA_PUBLIC_UNAVAILABLE', 'Newsletter media is not publicly available'),
        503,
      );
    }
    try {
      await canonicalContent(repo, article.content);
    } catch (error) {
      const failure = mediaReferenceFailure(error);
      if (failure) return c.json(failure, 422);
      throw error;
    }
    return c.json(renderNewsletter(article, config?.publicWebUrl, mediaOrigin ?? undefined));
  })
  .post(
    '/:id/newsletter/campaign',
    requirePermission('articles.manage'),
    zValidator('json', syncNewsletterCampaignSchema),
    async (c) => {
      const { expectedVersion } = c.req.valid('json');
      const repo = getRepository(c.env);
      const article = await repo.getArticle(c.req.param('id'));
      if (!article) return c.json({ error: 'Article not found' }, 404);
      if (article.version !== expectedVersion) {
        return c.json(
          newsletterError('ARTICLE_VERSION_CONFLICT', 'Article changed; reload it'),
          409,
        );
      }
      let mediaOrigin: string | null;
      try {
        await canonicalContent(repo, article.content);
        mediaOrigin = getMediaPublicOrigin(c.env, new URL(c.req.url).origin);
      } catch (error) {
        const failure = mediaReferenceFailure(error);
        if (failure) return c.json(failure, 422);
        throw error;
      }
      if (hasMedia(article.content) && (!c.env.MEDIA || !mediaOrigin)) {
        return c.json(
          newsletterError('MEDIA_PUBLIC_UNAVAILABLE', 'Newsletter media is not publicly available'),
          503,
        );
      }
      const readiness = newsletterReadiness(article);
      if (readiness) {
        return c.json(newsletterError(readiness, 'Newsletter is not ready'), 422);
      }
      if (article.newsletter.status === 'sent') {
        return c.json(
          newsletterError('NEWSLETTER_SENT', 'Sent newsletters cannot be changed'),
          409,
        );
      }
      if (article.newsletter.status === 'sync_unknown') {
        return c.json(
          newsletterError(
            'NEWSLETTER_SYNC_STATE_UNKNOWN',
            'A previous Mailchimp draft creation has an unknown result',
          ),
          409,
        );
      }
      const config = getMailchimpConfig(c.env);
      if (!config) {
        return c.json(
          newsletterError('MAILCHIMP_NOT_CONFIGURED', 'Mailchimp is not configured'),
          503,
        );
      }

      const claim = await repo.claimArticleNewsletterSync(article.id, expectedVersion);
      if (claim.status === 'version_conflict') {
        return c.json(
          newsletterError('ARTICLE_VERSION_CONFLICT', 'Article changed; reload it'),
          409,
        );
      }
      if (claim.status === 'sync_in_progress') {
        return c.json(
          newsletterError('NEWSLETTER_SYNC_IN_PROGRESS', 'Newsletter sync is in progress'),
          409,
        );
      }
      if (claim.status === 'sent') {
        return c.json(
          newsletterError('NEWSLETTER_SENT', 'Sent newsletters cannot be changed'),
          409,
        );
      }
      if (claim.status === 'sync_unknown') {
        return c.json(
          newsletterError('NEWSLETTER_SYNC_STATE_UNKNOWN', 'Mailchimp sync result is unknown'),
          409,
        );
      }
      if (claim.status !== 'claimed') {
        return c.json(newsletterError('NEWSLETTER_NOT_READY', 'Newsletter is not ready'), 409);
      }

      const snapshot = claim.article;
      const syncToken = claim.syncToken;
      const preview = renderNewsletter(snapshot, config.publicWebUrl, mediaOrigin ?? undefined);
      const client = new MailchimpClient(config);
      const operation: NewsletterCampaignResult['operation'] = snapshot.newsletter.campaignId
        ? 'updated'
        : 'created';
      let campaignId = snapshot.newsletter.campaignId;
      let remoteCampaignCreated = false;
      let campaignPersisted = Boolean(campaignId);
      let attemptedCampaignCreate = false;
      try {
        if (campaignId) {
          const remote = await client.getCampaign(campaignId);
          if (remote.audienceId !== config.audienceId) {
            await repo.releaseArticleNewsletterSync(snapshot.id, syncToken);
            return c.json(
              newsletterError(
                'MAILCHIMP_AUDIENCE_MISMATCH',
                'Mailchimp campaign audience does not match configuration',
              ),
              409,
            );
          }
          if (remote.status === 'sent') {
            await repo.reconcileArticleNewsletterSent(
              snapshot.id,
              remote.sendTime ?? new Date().toISOString(),
            );
            return c.json(newsletterError('NEWSLETTER_SENT', 'Newsletter was already sent'), 409);
          }
          await client.updateCampaign(
            campaignId,
            preview.subject,
            preview.preheader,
            `${snapshot.titleAr} (${snapshot.slug})`,
          );
        } else {
          attemptedCampaignCreate = true;
          const remote = await client.createCampaign(
            preview.subject,
            preview.preheader,
            `${snapshot.titleAr} (${snapshot.slug})`,
          );
          campaignId = remote.id;
          remoteCampaignCreated = true;
          const persisted = await repo.setArticleNewsletterCampaign(
            snapshot.id,
            campaignId,
            syncToken,
          );
          if (!persisted) throw new Error('Campaign reservation was lost');
          campaignPersisted = true;
        }

        await client.setCampaignContent(campaignId, preview.html, preview.text);
        const synced = await repo.markArticleNewsletterSynced(
          snapshot.id,
          campaignId,
          snapshot.version,
          syncToken,
        );
        if (!synced) {
          await repo.releaseArticleNewsletterSync(snapshot.id, syncToken);
          return c.json(
            newsletterError(
              'ARTICLE_CHANGED_DURING_SYNC',
              'Article changed during newsletter sync',
            ),
            409,
          );
        }
        const result: NewsletterCampaignResult = { article: synced, operation };
        return c.json(result);
      } catch (error) {
        const ambiguousCreate =
          !snapshot.newsletter.campaignId &&
          attemptedCampaignCreate &&
          !campaignPersisted &&
          (!(error instanceof MailchimpApiError) || error.status >= 500);
        if ((remoteCampaignCreated && !campaignPersisted) || ambiguousCreate) {
          await repo.markArticleNewsletterSyncUnknown(snapshot.id, syncToken);
          return c.json(
            newsletterError(
              'NEWSLETTER_CAMPAIGN_PARTIAL_FAILURE',
              'Mailchimp draft creation must be reviewed before retrying',
            ),
            503,
          );
        }
        await repo.releaseArticleNewsletterSync(snapshot.id, syncToken);
        const failure = mailchimpFailure(error);
        return c.json(failure.body, failure.status);
      }
    },
  )
  .post('/:id/newsletter/reconcile', requirePermission('articles.manage'), async (c) => {
    const repo = getRepository(c.env);
    const article = await repo.getArticle(c.req.param('id'));
    if (!article) return c.json({ error: 'Article not found' }, 404);
    if (article.newsletter.status === 'sent') {
      const result: NewsletterSendResult = { article, operation: 'already_sent' };
      return c.json(result);
    }
    const campaignId = article.newsletter.campaignId;
    if (!campaignId) {
      return c.json(
        newsletterError('NEWSLETTER_CAMPAIGN_REQUIRED', 'Create a campaign draft first'),
        409,
      );
    }
    const config = getMailchimpConfig(c.env);
    if (!config) {
      return c.json(
        newsletterError('MAILCHIMP_NOT_CONFIGURED', 'Mailchimp is not configured'),
        503,
      );
    }

    try {
      const remote = await new MailchimpClient(config).getCampaign(campaignId);
      if (remote.audienceId !== config.audienceId) {
        return c.json(
          newsletterError(
            'MAILCHIMP_AUDIENCE_MISMATCH',
            'Mailchimp campaign audience does not match configuration',
          ),
          409,
        );
      }
      if (remote.status === 'sent') {
        const reconciled = await repo.reconcileArticleNewsletterSent(
          article.id,
          remote.sendTime ?? new Date().toISOString(),
        );
        if (!reconciled) return c.json({ error: 'Article not found' }, 404);
        const result: NewsletterSendResult = { article: reconciled, operation: 'sent' };
        return c.json(result);
      }
      if (['sending', 'schedule'].includes(remote.status)) {
        const current = (await repo.getArticle(article.id)) ?? article;
        const result: NewsletterSendResult = { article: current, operation: 'accepted' };
        return c.json(result, 202);
      }

      // A remote `save` response does not prove that another request which already
      // owns the local send claim has not yet reached Mailchimp's send action.
      // Keep the claim fenced and require a later reconciliation instead of making
      // the campaign sendable again while that request may still be in flight.
      if (article.newsletter.status === 'sending') {
        const recovered = await repo.recoverStaleArticleNewsletterSend(
          article.id,
          new Date(Date.now() - NEWSLETTER_SEND_LEASE_MS).toISOString(),
        );
        if (recovered) {
          const result: NewsletterSendResult = { article: recovered, operation: 'not_sent' };
          return c.json(result);
        }
        const current = (await repo.getArticle(article.id)) ?? article;
        if (current.newsletter.status === 'sent') {
          const result: NewsletterSendResult = { article: current, operation: 'sent' };
          return c.json(result);
        }
        if (current.newsletter.status !== 'sending') {
          const result: NewsletterSendResult = { article: current, operation: 'not_sent' };
          return c.json(result);
        }
        const result: NewsletterSendResult = { article: current, operation: 'accepted' };
        return c.json(result, 202);
      }

      const result: NewsletterSendResult = {
        article,
        operation: 'not_sent',
      };
      return c.json(result);
    } catch (error) {
      const failure = mailchimpFailure(error);
      return c.json(failure.body, failure.status);
    }
  })
  .post(
    '/:id/newsletter/send',
    requirePermission('articles.manage'),
    zValidator('json', sendNewsletterSchema),
    async (c) => {
      const repo = getRepository(c.env);
      const config = getMailchimpConfig(c.env);
      if (!config) {
        return c.json(
          newsletterError('MAILCHIMP_NOT_CONFIGURED', 'Mailchimp is not configured'),
          503,
        );
      }
      const { audienceConfirmationToken, expectedVersion, expectedCampaignId } =
        c.req.valid('json');
      const expectedAudienceToken = await createAudienceConfirmationToken(config);
      if (audienceConfirmationToken !== expectedAudienceToken) {
        return c.json(
          newsletterError(
            'MAILCHIMP_AUDIENCE_CONFIRMATION_MISMATCH',
            'Audience confirmation is no longer valid',
          ),
          409,
        );
      }

      const client = new MailchimpClient(config);
      const claim = await repo.claimArticleNewsletterSend(
        c.req.param('id'),
        expectedVersion,
        expectedCampaignId,
      );
      if (claim.status === 'not_found') return c.json({ error: 'Article not found' }, 404);
      if (claim.status === 'confirmation_stale') {
        return c.json(
          newsletterError(
            'NEWSLETTER_CONFIRMATION_STALE',
            'Newsletter changed after confirmation was opened',
          ),
          409,
        );
      }
      if (claim.status === 'already_sent') {
        const result: NewsletterSendResult = { article: claim.article, operation: 'already_sent' };
        return c.json(result);
      }
      if (claim.status === 'sync_required') {
        return c.json(
          newsletterError('NEWSLETTER_SYNC_REQUIRED', 'Newsletter draft is outdated'),
          409,
        );
      }
      if (claim.status === 'not_ready') {
        return c.json(
          newsletterError('NEWSLETTER_CAMPAIGN_REQUIRED', 'Create a campaign draft first'),
          409,
        );
      }

      const pending = claim.article;
      const campaignId = pending?.newsletter.campaignId;
      if (!pending || !campaignId) {
        return c.json(
          newsletterError('NEWSLETTER_CAMPAIGN_REQUIRED', 'Create a campaign draft first'),
          409,
        );
      }
      if (claim.status === 'send_in_progress') {
        // Do not poll-and-release here. Mailchimp can still report `save` while the
        // request that acquired the claim is between its checklist and send calls.
        // The explicit reconcile endpoint can observe `sent` later without ever
        // making this campaign eligible for a second send.
        const result: NewsletterSendResult = { article: pending, operation: 'accepted' };
        return c.json(result, 202);
      }
      if (claim.status !== 'claimed') {
        return c.json(
          newsletterError('NEWSLETTER_STATE_CONFLICT', 'Newsletter state changed'),
          409,
        );
      }
      const sendToken = claim.sendToken;

      let mediaOrigin: string | null;
      try {
        await canonicalContent(repo, pending.content);
        mediaOrigin = getMediaPublicOrigin(c.env, new URL(c.req.url).origin);
      } catch (error) {
        await repo.releaseArticleNewsletterSend(pending.id, sendToken);
        const failure = mediaReferenceFailure(error);
        if (failure) return c.json(failure, 422);
        throw error;
      }
      if (hasMedia(pending.content) && (!c.env.MEDIA || !mediaOrigin)) {
        await repo.releaseArticleNewsletterSend(pending.id, sendToken);
        return c.json(
          newsletterError('MEDIA_PUBLIC_UNAVAILABLE', 'Newsletter media is not publicly available'),
          503,
        );
      }

      try {
        await client.getAudienceSummary();
      } catch (error) {
        await repo.releaseArticleNewsletterSend(pending.id, sendToken);
        const failure = mailchimpFailure(error);
        return c.json(
          newsletterError('MAILCHIMP_AUDIENCE_UNVERIFIED', failure.body.error),
          failure.status,
        );
      }

      try {
        const remote = await client.getCampaign(campaignId);
        if (remote.audienceId !== config.audienceId) {
          await repo.releaseArticleNewsletterSend(pending.id, sendToken);
          return c.json(
            newsletterError(
              'MAILCHIMP_AUDIENCE_MISMATCH',
              'Mailchimp campaign audience does not match configuration',
            ),
            409,
          );
        }
        if (remote.status === 'sent') {
          const article = await repo.reconcileArticleNewsletterSent(
            pending.id,
            remote.sendTime ?? new Date().toISOString(),
          );
          if (!article) return c.json({ error: 'Article not found' }, 404);
          const result: NewsletterSendResult = { article, operation: 'already_sent' };
          return c.json(result);
        }
        if (['sending', 'schedule'].includes(remote.status)) {
          const result: NewsletterSendResult = { article: pending, operation: 'accepted' };
          return c.json(result, 202);
        }
        // Mailchimp drafts can be edited outside Studio. Re-apply the canonical
        // confirmed snapshot immediately before the checklist so the provider
        // cannot send drifted subject, HTML, or plain-text content.
        const preview = renderNewsletter(pending, config.publicWebUrl, mediaOrigin ?? undefined);
        await client.updateCampaign(
          campaignId,
          preview.subject,
          preview.preheader,
          `${pending.titleAr} (${pending.slug})`,
        );
        await client.setCampaignContent(campaignId, preview.html, preview.text);
        const ready = await client.isCampaignReady(campaignId);
        if (!ready) {
          await repo.releaseArticleNewsletterSend(pending.id, sendToken);
          return c.json(
            newsletterError('MAILCHIMP_CHECKLIST_FAILED', 'Mailchimp checklist is not ready'),
            409,
          );
        }
      } catch (error) {
        await repo.releaseArticleNewsletterSend(pending.id, sendToken);
        const failure = mailchimpFailure(error);
        return c.json(failure.body, failure.status);
      }

      const activeLease = await repo.touchArticleNewsletterSendLease(pending.id, sendToken);
      if (!activeLease) {
        const current = await repo.getArticle(pending.id);
        if (current?.newsletter.status === 'sent') {
          const result: NewsletterSendResult = { article: current, operation: 'already_sent' };
          return c.json(result);
        }
        return c.json(
          newsletterError(
            'NEWSLETTER_SEND_LEASE_LOST',
            'Newsletter send claim expired; reload before any retry',
          ),
          409,
        );
      }

      try {
        await client.sendCampaign(campaignId);
      } catch {
        // The request may have reached Mailchimp even when the response was lost.
        // Keep `sending` so a later request reconciles remote state without retrying.
        return c.json(
          newsletterError(
            'NEWSLETTER_SEND_STATE_UNKNOWN',
            'Mailchimp send result is unknown; reconcile before any retry',
          ),
          503,
        );
      }

      try {
        const remote = await client.getCampaign(campaignId);
        if (remote.audienceId !== config.audienceId) {
          return c.json(
            newsletterError(
              'MAILCHIMP_AUDIENCE_MISMATCH',
              'Mailchimp campaign audience does not match configuration',
            ),
            409,
          );
        }
        if (remote.status === 'sent') {
          const article = await repo.completeArticleNewsletterSend(
            pending.id,
            remote.sendTime ?? new Date().toISOString(),
            sendToken,
          );
          if (!article) {
            const current = await repo.getArticle(pending.id);
            if (current?.newsletter.status === 'sent') {
              const result: NewsletterSendResult = { article: current, operation: 'sent' };
              return c.json(result);
            }
            return c.json(
              newsletterError('NEWSLETTER_STATE_CONFLICT', 'Newsletter state changed'),
              409,
            );
          }
          const result: NewsletterSendResult = { article, operation: 'sent' };
          return c.json(result);
        }
      } catch {
        // The send action was accepted. Reconciliation can safely happen later.
      }

      const current = await repo.getArticle(pending.id);
      if (!current) return c.json({ error: 'Article not found' }, 404);
      const result: NewsletterSendResult = { article: current, operation: 'accepted' };
      return c.json(result, 202);
    },
  )
  .get('/:idOrSlug', async (c) => {
    const key = c.req.param('idOrSlug');
    const repo = getRepository(c.env);
    const article = (await repo.getArticle(key)) ?? (await repo.getArticleBySlug(key));
    if (!article) return c.json({ error: 'Article not found' }, 404);
    return c.json(article);
  });
