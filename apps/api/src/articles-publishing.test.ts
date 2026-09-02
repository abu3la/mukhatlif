import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Article } from '@mukhtalif/types';
import type { Env } from './env';
import app from './index';
import { getRepository } from './repo';

const localEnv: Env = {
  APP_ENV: 'development',
  ALLOW_DEV_AUTH: 'true',
  CORS_ALLOWED_ORIGINS: 'http://127.0.0.1:3001',
};

const mailchimpEnv: Env = {
  ...localEnv,
  MAILCHIMP_CAMPAIGNS_ENABLED: 'true',
  MAILCHIMP_API_KEY: 'secret-api-key-us1',
  MAILCHIMP_SERVER_PREFIX: 'us1',
  MAILCHIMP_AUDIENCE_ID: 'audience_1',
  MAILCHIMP_RECIPIENT_SEGMENT_ID: '31415',
  MAILCHIMP_FROM_NAME: 'مختلف',
  MAILCHIMP_REPLY_TO: 'studio@mukhtalif.net',
  PUBLIC_WEB_URL: 'https://mukhtalif.net',
};

const headers = { 'Content-Type': 'application/json', 'x-dev-user': 'usr-admin-1' };

function apiRequest(path: string, init: RequestInit = {}, env: Env = localEnv) {
  const requestHeaders = new Headers(init.headers);
  for (const [name, value] of Object.entries(headers)) {
    if (!requestHeaders.has(name)) requestHeaders.set(name, value);
  }
  return app.request(path, { ...init, headers: requestHeaders }, env);
}

function articleInput(slug: string) {
  return {
    slug,
    titleAr: `مقال ${slug}`,
    author: { type: 'custom' as const, displayName: 'فريق مختلف' },
    excerptAr: 'ملخص المقال',
    content: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'محتوى المقال' }] }],
    },
    seo: {
      title: `عنوان ${slug}`,
      description: 'وصف واضح لنتيجة البحث.',
      canonicalUrl: `https://mukhtalif.net/articles/${slug}`,
    },
    newsletter: {
      enabled: true,
      subject: `نشرة ${slug}`,
      preheader: 'ملخص الرسالة البريدية',
    },
  };
}

async function createArticle(slug: string, env: Env = localEnv): Promise<Article> {
  const response = await apiRequest(
    '/studio/articles',
    { method: 'POST', body: JSON.stringify(articleInput(slug)) },
    env,
  );
  expect(response.status).toBe(201);
  return (await response.json()) as Article;
}

async function audienceConfirmationToken(): Promise<string> {
  const response = await apiRequest('/studio/articles/mailchimp/capability', {}, mailchimpEnv);
  const capability = (await response.json()) as { audienceConfirmationToken?: string };
  expect(response.status).toBe(200);
  expect(capability.audienceConfirmationToken).toEqual(expect.any(String));
  return capability.audienceConfirmationToken!;
}

async function newsletterSendInput(articleId: string, audienceToken?: string) {
  const response = await apiRequest(`/studio/articles/${articleId}`, {}, mailchimpEnv);
  const article = (await response.json()) as Article;
  expect(response.status).toBe(200);
  expect(article.newsletter.campaignId).toEqual(expect.any(String));
  return {
    confirmation: 'SEND_NEWSLETTER' as const,
    audienceConfirmationToken: audienceToken ?? (await audienceConfirmationToken()),
    expectedVersion: article.version,
    expectedCampaignId: article.newsletter.campaignId!,
  };
}

async function syncNewsletterCampaign(articleId: string, expectedVersion?: number) {
  let version = expectedVersion;
  if (version === undefined) {
    const response = await apiRequest(`/studio/articles/${articleId}`, {}, mailchimpEnv);
    const article = (await response.json()) as Article;
    expect(response.status).toBe(200);
    version = article.version;
  }
  return apiRequest(
    `/studio/articles/${articleId}/newsletter/campaign`,
    { method: 'POST', body: JSON.stringify({ expectedVersion: version }) },
    mailchimpEnv,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('public and Studio article boundaries', () => {
  it('returns published projections without editor source or delivery metadata', async () => {
    const slug = `boundary-${crypto.randomUUID().slice(0, 8)}`;
    const create = await apiRequest('/studio/articles', {
      method: 'POST',
      body: JSON.stringify({
        ...articleInput(slug),
        author: { type: 'studio_member', studioMemberId: 'usr-editor-1' },
        authorPlacement: 'end',
      }),
    });
    const article = (await create.json()) as Article;
    expect(create.status).toBe(201);
    const missingDraft = await apiRequest(`/articles/${article.slug}`, {
      headers: { 'x-dev-user': '' },
    });
    expect(missingDraft.status).toBe(404);

    const publish = await apiRequest(`/studio/articles/${article.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'published', expectedVersion: article.version }),
    });
    expect(publish.status).toBe(200);

    const publicResponse = await apiRequest(`/articles/${article.slug}`, {
      headers: { 'x-dev-user': '' },
    });
    const publicJson = (await publicResponse.json()) as Record<string, unknown>;
    const serialized = JSON.stringify(publicJson);
    expect(publicResponse.status).toBe(200);
    expect(publicJson.author).toEqual({ displayName: 'محرر مختلف' });
    expect(publicJson.authorPlacement).toBe('end');
    expect(publicJson).not.toHaveProperty('content');
    expect(publicJson).not.toHaveProperty('newsletter');
    expect(serialized).not.toContain('campaignId');
    expect(serialized).not.toContain('syncedVersion');
    expect(serialized).not.toContain('studioMemberId');
    expect(serialized).not.toContain('"type"');

    const publicListResponse = await apiRequest('/articles', {
      headers: { 'x-dev-user': '' },
    });
    const publicList = (await publicListResponse.json()) as Array<Record<string, unknown>>;
    const listed = publicList.find((candidate) => candidate.id === article.id);
    expect(publicListResponse.status).toBe(200);
    expect(listed?.author).toEqual({ displayName: 'محرر مختلف' });
    expect(listed?.authorPlacement).toBe('end');
    expect(JSON.stringify(listed)).not.toContain('studioMemberId');
    expect(JSON.stringify(listed)).not.toContain('"type"');
  });

  it('rebases trusted imported media at every article response boundary without changing storage', async () => {
    const slug = `media-origin-${crypto.randomUUID().slice(0, 8)}`;
    const mediaId = `med-${crypto.randomUUID().replaceAll('-', '')}`;
    const storedOrigin = 'https://mukhtalif-api.mukhtalif-development.workers.dev';
    const runtimeOrigin = 'https://api.mukhtalif.net';
    const storedMediaUrl = `${storedOrigin}/media/${mediaId}`;
    const responseMediaUrl = `${runtimeOrigin}/media/${mediaId}`;
    const env: Env = { ...localEnv, MEDIA_PUBLIC_ORIGIN: runtimeOrigin };
    const input = articleInput(slug);

    const create = await apiRequest(
      '/studio/articles',
      {
        method: 'POST',
        body: JSON.stringify({
          ...input,
          coverUrl: storedMediaUrl,
          coverAlt: 'غلاف المقال',
          seo: { ...input.seo, socialImageUrl: storedMediaUrl },
        }),
      },
      env,
    );
    const created = (await create.json()) as Article;
    expect(create.status).toBe(201);
    expect(created.coverUrl).toBe(responseMediaUrl);
    expect(created.seo.socialImageUrl).toBe(responseMediaUrl);

    const stored = await getRepository(env).getArticle(created.id);
    expect(stored?.coverUrl).toBe(storedMediaUrl);
    expect(stored?.seo.socialImageUrl).toBe(storedMediaUrl);

    const publish = await apiRequest(
      `/studio/articles/${created.id}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status: 'published', expectedVersion: created.version }),
      },
      env,
    );
    expect(publish.status).toBe(200);

    const publicDetail = (await (
      await apiRequest(`/articles/${slug}`, { headers: { 'x-dev-user': '' } }, env)
    ).json()) as Article;
    expect(publicDetail.coverUrl).toBe(responseMediaUrl);
    expect(publicDetail.seo.socialImageUrl).toBe(responseMediaUrl);

    const publicList = (await (
      await apiRequest('/articles', { headers: { 'x-dev-user': '' } }, env)
    ).json()) as Article[];
    expect(publicList.find((article) => article.id === created.id)?.coverUrl).toBe(
      responseMediaUrl,
    );

    const home = (await (
      await apiRequest('/home', { headers: { 'x-dev-user': '' } }, env)
    ).json()) as { latestArticles: Array<{ id: string; coverUrl?: string }> };
    expect(home.latestArticles.find((article) => article.id === created.id)?.coverUrl).toBe(
      responseMediaUrl,
    );

    const studioDetail = (await (
      await apiRequest(`/studio/articles/${created.id}`, {}, env)
    ).json()) as Article;
    expect(studioDetail.coverUrl).toBe(responseMediaUrl);

    const unrelatedUpdate = await apiRequest(
      `/studio/articles/${created.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          expectedVersion: studioDetail.version,
          excerptAr: 'ملخص محدث من الاستوديو',
          coverUrl: studioDetail.coverUrl,
          coverAlt: studioDetail.coverAlt,
          seo: { socialImageUrl: studioDetail.seo.socialImageUrl },
        }),
      },
      env,
    );
    expect(unrelatedUpdate.status).toBe(200);
    const storedAfterRoundTrip = await getRepository(env).getArticle(created.id);
    expect(storedAfterRoundTrip?.coverUrl).toBe(storedMediaUrl);
    expect(storedAfterRoundTrip?.seo.socialImageUrl).toBe(storedMediaUrl);

    const preview = (await (
      await apiRequest(`/studio/articles/${created.id}/newsletter/preview`, { method: 'POST' }, env)
    ).json()) as { html: string };
    expect(preview.html).toContain(`src="${responseMediaUrl}"`);
    expect(preview.html).not.toContain(storedOrigin);
  });

  it('requires Studio access for source and manage access for writes', async () => {
    const listenerRead = await app.request(
      '/studio/articles',
      {
        headers: { 'x-dev-user': 'usr-listener-1' },
      },
      localEnv,
    );
    const anonymousWrite = await app.request(
      '/studio/articles',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
      localEnv,
    );
    expect(listenerRead.status).toBe(403);
    expect(anonymousWrite.status).toBe(401);
  });

  it('lists a minimal author directory for article viewers', async () => {
    const roleResponse = await apiRequest('/studio/roles', {
      method: 'POST',
      body: JSON.stringify({
        name: `قارئ كتّاب ${crypto.randomUUID().slice(0, 6)}`,
        permissions: ['articles.view'],
      }),
    });
    expect(roleResponse.status).toBe(201);
    const role = (await roleResponse.json()) as { id: string };
    const assign = await apiRequest('/studio/members/usr-editor-1/role', {
      method: 'PATCH',
      body: JSON.stringify({ role: role.id }),
    });
    expect(assign.status).toBe(200);

    const editorHeaders = { 'x-dev-user': 'usr-editor-1' };
    const response = await app.request(
      '/studio/articles/authors',
      { headers: editorHeaders },
      localEnv,
    );
    const authors = (await response.json()) as Array<Record<string, unknown>>;
    expect(response.status).toBe(200);
    expect(authors).toContainEqual({
      studioMemberId: 'usr-admin-1',
      displayName: 'فريق مختلف',
    });
    for (const author of authors) {
      expect(Object.keys(author).sort()).toEqual(['displayName', 'studioMemberId']);
      expect(author).not.toHaveProperty('email');
      expect(author).not.toHaveProperty('role');
      expect(author).not.toHaveProperty('permissions');
      expect(author).not.toHaveProperty('authLinked');
    }
    expect(authors.some((author) => author.studioMemberId === 'usr-listener-1')).toBe(false);

    const privateDirectory = await app.request(
      '/studio/members',
      { headers: editorHeaders },
      localEnv,
    );
    expect(privateDirectory.status).toBe(403);

    const listener = await app.request(
      '/studio/articles/authors',
      { headers: { 'x-dev-user': 'usr-listener-1' } },
      localEnv,
    );
    expect(listener.status).toBe(403);

    const restore = await apiRequest('/studio/members/usr-editor-1/role', {
      method: 'PATCH',
      body: JSON.stringify({ role: 'editor' }),
    });
    expect(restore.status).toBe(200);
  });

  it('resolves Studio author names server-side and rejects missing or forged members', async () => {
    const slug = `member-author-${crypto.randomUUID().slice(0, 8)}`;
    const create = await apiRequest('/studio/articles', {
      method: 'POST',
      body: JSON.stringify({
        ...articleInput(slug),
        author: { type: 'studio_member', studioMemberId: 'usr-editor-1' },
      }),
    });
    const article = (await create.json()) as Article;
    expect(create.status).toBe(201);
    expect(article.authorPlacement).toBe('after_title');
    expect(article.author).toEqual({
      type: 'studio_member',
      studioMemberId: 'usr-editor-1',
      displayName: 'محرر مختلف',
    });

    const forged = await apiRequest('/studio/articles', {
      method: 'POST',
      body: JSON.stringify({
        ...articleInput(`forged-${crypto.randomUUID().slice(0, 8)}`),
        author: {
          type: 'studio_member',
          studioMemberId: 'usr-editor-1',
          displayName: 'اسم مزور',
        },
      }),
    });
    expect(forged.status).toBe(400);

    const missing = await apiRequest('/studio/articles', {
      method: 'POST',
      body: JSON.stringify({
        ...articleInput(`missing-${crypto.randomUUID().slice(0, 8)}`),
        author: { type: 'studio_member', studioMemberId: 'usr-missing' },
      }),
    });
    const failure = JSON.stringify(await missing.json());
    expect(missing.status).toBe(422);
    expect(failure).toContain('ARTICLE_AUTHOR_NOT_FOUND');
    expect(failure).not.toContain('studio@mukhtalif.net');
    expect(failure).not.toContain('editor@mukhtalif.net');

    const missingUpdate = await apiRequest(`/studio/articles/${article.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        expectedVersion: article.version,
        author: { type: 'studio_member', studioMemberId: 'usr-missing' },
      }),
    });
    expect(missingUpdate.status).toBe(422);
    expect(await missingUpdate.json()).toMatchObject({ code: 'ARTICLE_AUTHOR_NOT_FOUND' });

    const unchangedResponse = await apiRequest(`/studio/articles/${article.id}`);
    const unchanged = (await unchangedResponse.json()) as Article;
    expect(unchanged.version).toBe(article.version);
    expect(unchanged.author).toEqual(article.author);

    const repo = getRepository(localEnv);
    const getStudioMember = repo.getStudioMember.bind(repo);
    const legacyNameSpy = vi.spyOn(repo, 'getStudioMember').mockImplementation(async (id) => {
      const member = await getStudioMember(id);
      return member && id === 'usr-editor-1' ? { ...member, displayName: 'أ' } : member;
    });
    const unusableCreate = await apiRequest('/studio/articles', {
      method: 'POST',
      body: JSON.stringify({
        ...articleInput(`legacy-name-${crypto.randomUUID().slice(0, 8)}`),
        author: { type: 'studio_member', studioMemberId: 'usr-editor-1' },
      }),
    });
    expect(unusableCreate.status).toBe(422);
    expect(await unusableCreate.json()).toMatchObject({ code: 'ARTICLE_AUTHOR_NOT_FOUND' });

    const unusableUpdate = await apiRequest(`/studio/articles/${article.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        expectedVersion: article.version,
        author: { type: 'studio_member', studioMemberId: 'usr-editor-1' },
      }),
    });
    expect(unusableUpdate.status).toBe(422);
    expect(await unusableUpdate.json()).toMatchObject({ code: 'ARTICLE_AUTHOR_NOT_FOUND' });
    legacyNameSpy.mockRestore();

    const normalizedCreate = await apiRequest('/studio/articles', {
      method: 'POST',
      body: JSON.stringify({
        ...articleInput(`normalized-author-${crypto.randomUUID().slice(0, 8)}`),
        author: { type: 'custom', displayName: '  Cafe\u0301  ' },
      }),
    });
    const normalizedArticle = (await normalizedCreate.json()) as Article;
    expect(normalizedCreate.status).toBe(201);
    expect(normalizedArticle.author).toEqual({ type: 'custom', displayName: 'Café' });

    for (const displayName of ['اسم\nثان', 'اسم\u0007', 'اسم\u202eمخفي']) {
      const invalidCustom = await apiRequest('/studio/articles', {
        method: 'POST',
        body: JSON.stringify({
          ...articleInput(`invalid-author-${crypto.randomUUID().slice(0, 8)}`),
          author: { type: 'custom', displayName },
        }),
      });
      expect(invalidCustom.status).toBe(400);
    }

    const invalidCustomUpdate = await apiRequest(`/studio/articles/${normalizedArticle.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        expectedVersion: normalizedArticle.version,
        author: { type: 'custom', displayName: 'اسم\u2067مضلل' },
      }),
    });
    expect(invalidCustomUpdate.status).toBe(400);
    const normalizedStoredResponse = await apiRequest(`/studio/articles/${normalizedArticle.id}`);
    const normalizedStored = (await normalizedStoredResponse.json()) as Article;
    expect(normalizedStored.version).toBe(normalizedArticle.version);
    expect(normalizedStored.author).toEqual(normalizedArticle.author);
  });

  it('allows article viewers to preview while reserving mutations for managers', async () => {
    const article = await createArticle(`viewer-${crypto.randomUUID().slice(0, 8)}`);
    const roleResponse = await apiRequest('/studio/roles', {
      method: 'POST',
      body: JSON.stringify({
        name: `مراجع المحتوى ${crypto.randomUUID().slice(0, 6)}`,
        permissions: ['articles.view'],
      }),
    });
    expect(roleResponse.status).toBe(201);
    const role = (await roleResponse.json()) as { id: string };
    const assign = await apiRequest('/studio/members/usr-editor-1/role', {
      method: 'PATCH',
      body: JSON.stringify({ role: role.id }),
    });
    expect(assign.status).toBe(200);

    const editorHeaders = { 'Content-Type': 'application/json', 'x-dev-user': 'usr-editor-1' };
    const preview = await app.request(
      `/studio/articles/${article.id}/newsletter/preview`,
      { method: 'POST', headers: editorHeaders },
      localEnv,
    );
    const update = await app.request(
      `/studio/articles/${article.id}`,
      {
        method: 'PATCH',
        headers: editorHeaders,
        body: JSON.stringify({ expectedVersion: article.version, titleAr: 'غير مسموح' }),
      },
      localEnv,
    );
    expect(preview.status).toBe(200);
    expect(update.status).toBe(403);

    const restore = await apiRequest('/studio/members/usr-editor-1/role', {
      method: 'PATCH',
      body: JSON.stringify({ role: 'editor' }),
    });
    expect(restore.status).toBe(200);
  });

  it('rejects stale updates and supports explicit clearing without breaking cover invariants', async () => {
    const article = await createArticle(`version-${crypto.randomUUID().slice(0, 8)}`);
    const first = await apiRequest(`/studio/articles/${article.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        expectedVersion: article.version,
        coverUrl: 'https://cdn.example.com/cover.jpg',
        coverAlt: 'وصف الغلاف',
        seo: { socialImageUrl: 'https://cdn.example.com/social.jpg' },
      }),
    });
    const updated = (await first.json()) as Article;
    expect(first.status).toBe(200);

    const stale = await apiRequest(`/studio/articles/${article.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ expectedVersion: article.version, titleAr: 'كتابة قديمة' }),
    });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ code: 'ARTICLE_VERSION_CONFLICT' });

    const cleared = await apiRequest(`/studio/articles/${article.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        expectedVersion: updated.version,
        coverUrl: null,
        coverAlt: null,
        seo: { canonicalUrl: null, socialImageUrl: null },
        newsletter: { preheader: null },
      }),
    });
    const clearedArticle = (await cleared.json()) as Article;
    expect(cleared.status).toBe(200);
    expect(clearedArticle.coverUrl).toBeUndefined();
    expect(clearedArticle.coverAlt).toBeUndefined();
    expect(clearedArticle.seo.canonicalUrl).toBeUndefined();
    expect(clearedArticle.newsletter.preheader).toBeUndefined();
  });
});

interface MailchimpMockState {
  createCount: number;
  sendCount: number;
  status: string;
  checklistReady: boolean;
  completeOnSend?: boolean;
  audienceId?: string;
  campaignRecipientSegmentId?: number;
  resolvedRecipientSegmentId?: number;
  recipientTag?: string;
  recipientSegmentType?: string;
  recipientCount?: number;
  createdRecipientSegmentId?: number;
  updatedAudienceId?: string;
  updatedRecipientSegmentId?: number;
  driftRecipientSegmentAfterChecklist?: number;
  audienceGate?: Promise<void>;
  onAudienceRequest?: () => void;
  remoteSubject?: string;
  remoteHtml?: string;
  remotePlainText?: string;
  sentSubject?: string;
  sentHtml?: string;
  sentPlainText?: string;
  failSendAfterAcceptance?: boolean;
}

function installMailchimpMock(state: MailchimpMockState) {
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url.includes('/segments/')) {
      return Response.json({
        id: state.resolvedRecipientSegmentId ?? 31415,
        name: state.recipientTag ?? 'nlpage',
        member_count: state.recipientCount ?? 730,
        type: state.recipientSegmentType ?? 'static',
      });
    }
    if (url.includes('/lists/')) {
      state.onAudienceRequest?.();
      await state.audienceGate;
      return Response.json({ name: 'مشتركو النشرة الأسبوعية', stats: { member_count: 1280 } });
    }
    if (url.endsWith('/campaigns') && method === 'POST') {
      state.createCount += 1;
      const body = JSON.parse(String(init?.body)) as {
        settings?: { subject_line?: string };
        recipients?: { list_id?: string; segment_opts?: { saved_segment_id?: number } };
      };
      state.remoteSubject = body.settings?.subject_line;
      state.createdRecipientSegmentId = body.recipients?.segment_opts?.saved_segment_id;
      await Promise.resolve();
      return Response.json({
        id: 'campaign-one',
        status: 'save',
        recipients: {
          list_id: body.recipients?.list_id,
          segment_opts: { saved_segment_id: body.recipients?.segment_opts?.saved_segment_id },
        },
      });
    }
    if (url.endsWith('/send-checklist')) {
      if (state.driftRecipientSegmentAfterChecklist !== undefined) {
        state.campaignRecipientSegmentId = state.driftRecipientSegmentAfterChecklist;
      }
      return Response.json({ is_ready: state.checklistReady });
    }
    if (url.endsWith('/actions/send')) {
      state.sendCount += 1;
      state.sentSubject = state.remoteSubject;
      state.sentHtml = state.remoteHtml;
      state.sentPlainText = state.remotePlainText;
      if (state.failSendAfterAcceptance) throw new Error('connection lost after send request');
      state.status = state.completeOnSend === false ? 'sending' : 'sent';
      return new Response(null, { status: 204 });
    }
    if (url.endsWith('/content') && method === 'PUT') {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body).toHaveProperty('html');
      expect(body).toHaveProperty('plain_text');
      state.remoteHtml = String(body.html);
      state.remotePlainText = String(body.plain_text);
      return new Response(null, { status: 204 });
    }
    if (url.includes('/campaigns/campaign-one') && method === 'PATCH') {
      const body = JSON.parse(String(init?.body)) as {
        settings?: { subject_line?: string };
        recipients?: { list_id?: string; segment_opts?: { saved_segment_id?: number } };
      };
      state.remoteSubject = body.settings?.subject_line;
      state.updatedAudienceId = body.recipients?.list_id;
      state.updatedRecipientSegmentId = body.recipients?.segment_opts?.saved_segment_id;
      state.audienceId = body.recipients?.list_id;
      state.campaignRecipientSegmentId = body.recipients?.segment_opts?.saved_segment_id;
      return Response.json({
        id: 'campaign-one',
        status: state.status,
        recipients: {
          list_id: state.audienceId ?? 'audience_1',
          segment_opts: { saved_segment_id: state.campaignRecipientSegmentId ?? 31415 },
        },
      });
    }
    if (url.includes('/campaigns/campaign-one')) {
      return Response.json({
        id: 'campaign-one',
        status: state.status,
        recipients: {
          list_id: state.audienceId ?? 'audience_1',
          segment_opts: { saved_segment_id: state.campaignRecipientSegmentId ?? 31415 },
        },
        ...(state.status === 'sent' ? { send_time: '2026-08-17T12:00:00Z' } : {}),
      });
    }
    throw new Error(`Unexpected Mailchimp request: ${method} ${url}`);
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

describe('Mailchimp publishing workflow', () => {
  it('does not contact Mailchimp for capability, draft creation, reconciliation, or send while paused', async () => {
    const state: MailchimpMockState = {
      createCount: 0,
      sendCount: 0,
      status: 'save',
      checklistReady: true,
    };
    const fetcher = installMailchimpMock(state);
    const syncedDraft = await createArticle(
      `paused-existing-${crypto.randomUUID().slice(0, 8)}`,
      mailchimpEnv,
    );
    const syncSetup = await syncNewsletterCampaign(syncedDraft.id, syncedDraft.version);
    expect(syncSetup.status).toBe(200);
    const syncedArticle = ((await syncSetup.json()) as { article: Article }).article;
    const audienceToken = await audienceConfirmationToken();
    const unsyncedDraft = await createArticle(
      `paused-new-${crypto.randomUUID().slice(0, 8)}`,
      mailchimpEnv,
    );
    const pausedEnv: Env = { ...mailchimpEnv, MAILCHIMP_CAMPAIGNS_ENABLED: 'false' };
    fetcher.mockClear();

    const capability = await apiRequest('/studio/articles/mailchimp/capability', {}, pausedEnv);
    const create = await apiRequest(
      `/studio/articles/${unsyncedDraft.id}/newsletter/campaign`,
      {
        method: 'POST',
        body: JSON.stringify({ expectedVersion: unsyncedDraft.version }),
      },
      pausedEnv,
    );
    const reconcile = await apiRequest(
      `/studio/articles/${syncedArticle.id}/newsletter/reconcile`,
      { method: 'POST' },
      pausedEnv,
    );
    const send = await apiRequest(
      `/studio/articles/${syncedArticle.id}/newsletter/send`,
      {
        method: 'POST',
        body: JSON.stringify({
          confirmation: 'SEND_NEWSLETTER',
          audienceConfirmationToken: audienceToken,
          expectedVersion: syncedArticle.version,
          expectedCampaignId: syncedArticle.newsletter.campaignId,
        }),
      },
      pausedEnv,
    );

    expect(capability.status).toBe(200);
    expect(await capability.json()).toEqual({ mode: 'live', configured: false });
    for (const response of [create, reconcile, send]) {
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ code: 'MAILCHIMP_NOT_CONFIGURED' });
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('verifies a safe audience summary and reports verification failure without secrets', async () => {
    const state = { createCount: 0, sendCount: 0, status: 'save', checklistReady: true };
    installMailchimpMock(state);
    const verified = await apiRequest('/studio/articles/mailchimp/capability', {}, mailchimpEnv);
    expect(await verified.json()).toMatchObject({
      mode: 'live',
      configured: true,
      fromName: 'مختلف',
      replyTo: 'studio@mukhtalif.net',
      audienceName: 'مشتركو النشرة الأسبوعية',
      audienceCount: 1280,
      recipientTag: 'nlpage',
      recipientCount: 730,
      audienceConfirmationToken: expect.any(String),
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 503 })),
    );
    const unavailable = await apiRequest('/studio/articles/mailchimp/capability', {}, mailchimpEnv);
    const body = JSON.stringify(await unavailable.json());
    expect(unavailable.status).toBe(200);
    expect(body).not.toContain('secret-api-key');
    expect(body).not.toContain('audienceName');
  });

  it('does not create a campaign when the configured segment is not the nlpage tag', async () => {
    const state: MailchimpMockState = {
      createCount: 0,
      sendCount: 0,
      status: 'save',
      checklistReady: true,
      recipientTag: 'other',
    };
    installMailchimpMock(state);
    const article = await createArticle(
      `wrong-tag-${crypto.randomUUID().slice(0, 8)}`,
      mailchimpEnv,
    );

    const sync = await syncNewsletterCampaign(article.id);

    expect(sync.status).toBe(502);
    expect(await sync.json()).toMatchObject({ code: 'MAILCHIMP_UNAVAILABLE' });
    expect(state.createCount).toBe(0);
    const stored = await apiRequest(`/studio/articles/${article.id}`, {}, mailchimpEnv);
    const storedArticle = (await stored.json()) as Article;
    expect(storedArticle.newsletter.status).toBe('draft');
    expect(storedArticle.newsletter).not.toHaveProperty('campaignId');
  });

  it('blocks campaign and reconciliation when the remote recipient segment drifts', async () => {
    const state: MailchimpMockState = {
      createCount: 0,
      sendCount: 0,
      status: 'save',
      checklistReady: true,
    };
    installMailchimpMock(state);
    const article = await createArticle(
      `segment-drift-${crypto.randomUUID().slice(0, 8)}`,
      mailchimpEnv,
    );
    expect((await syncNewsletterCampaign(article.id)).status).toBe(200);
    state.campaignRecipientSegmentId = 27182;

    const resync = await syncNewsletterCampaign(article.id);
    expect(resync.status).toBe(409);
    expect(await resync.json()).toMatchObject({
      code: 'MAILCHIMP_RECIPIENT_SEGMENT_MISMATCH',
    });

    const reconcile = await apiRequest(
      `/studio/articles/${article.id}/newsletter/reconcile`,
      { method: 'POST' },
      mailchimpEnv,
    );
    expect(reconcile.status).toBe(409);
    expect(await reconcile.json()).toMatchObject({
      code: 'MAILCHIMP_RECIPIENT_SEGMENT_MISMATCH',
    });
    expect(state.sendCount).toBe(0);
  });

  it('rejects a stale campaign-sync revision before contacting Mailchimp', async () => {
    const state: MailchimpMockState = {
      createCount: 0,
      sendCount: 0,
      status: 'save',
      checklistReady: true,
    };
    installMailchimpMock(state);
    const article = await createArticle(
      `stale-sync-${crypto.randomUUID().slice(0, 8)}`,
      mailchimpEnv,
    );
    const edit = await apiRequest(
      `/studio/articles/${article.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          expectedVersion: article.version,
          newsletter: { subject: 'موضوع أحدث' },
        }),
      },
      mailchimpEnv,
    );
    expect(edit.status).toBe(200);

    const staleSync = await syncNewsletterCampaign(article.id, article.version);
    expect(staleSync.status).toBe(409);
    expect(await staleSync.json()).toMatchObject({ code: 'ARTICLE_VERSION_CONFLICT' });
    expect(state.createCount).toBe(0);
  });

  it('treats author attribution changes as new revisions that require newsletter resync', async () => {
    const state: MailchimpMockState = {
      createCount: 0,
      sendCount: 0,
      status: 'save',
      checklistReady: true,
    };
    installMailchimpMock(state);
    const article = await createArticle(
      `author-revision-${crypto.randomUUID().slice(0, 8)}`,
      mailchimpEnv,
    );
    const sync = await syncNewsletterCampaign(article.id, article.version);
    const synced = ((await sync.json()) as { article: Article }).article;
    expect(sync.status).toBe(200);
    expect(synced.newsletter.needsSync).toBe(false);

    const update = await apiRequest(
      `/studio/articles/${article.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          expectedVersion: synced.version,
          author: { type: 'custom', displayName: 'كاتبة مستقلة' },
        }),
      },
      mailchimpEnv,
    );
    const updated = (await update.json()) as Article;
    expect(update.status).toBe(200);
    expect(updated.version).toBe(synced.version + 1);
    expect(updated.author).toEqual({ type: 'custom', displayName: 'كاتبة مستقلة' });
    expect(updated.newsletter.needsSync).toBe(true);

    const resync = await syncNewsletterCampaign(article.id, updated.version);
    const resynced = ((await resync.json()) as { article: Article }).article;
    expect(resync.status).toBe(200);
    expect(resynced.newsletter.needsSync).toBe(false);

    const invalidPlacement = await apiRequest(
      `/studio/articles/${article.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          expectedVersion: resynced.version,
          authorPlacement: 'middle',
        }),
      },
      mailchimpEnv,
    );
    expect(invalidPlacement.status).toBe(400);

    const placementUpdate = await apiRequest(
      `/studio/articles/${article.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          expectedVersion: resynced.version,
          authorPlacement: 'end',
        }),
      },
      mailchimpEnv,
    );
    const placed = (await placementUpdate.json()) as Article;
    expect(placementUpdate.status).toBe(200);
    expect(placed.version).toBe(resynced.version + 1);
    expect(placed.authorPlacement).toBe('end');
    expect(placed.newsletter.needsSync).toBe(true);
  });

  it('creates one remote draft under concurrent calls, reuses it, blocks stale send, and sends once', async () => {
    const state: MailchimpMockState = {
      createCount: 0,
      sendCount: 0,
      status: 'save',
      checklistReady: true,
    };
    installMailchimpMock(state);
    const article = await createArticle(`mail-${crypto.randomUUID().slice(0, 8)}`, mailchimpEnv);

    const [one, two] = await Promise.all([
      syncNewsletterCampaign(article.id, article.version),
      syncNewsletterCampaign(article.id, article.version),
    ]);
    expect([one.status, two.status].sort()).toEqual([200, 409]);
    expect(state.createCount).toBe(1);
    expect(state.createdRecipientSegmentId).toBe(31415);
    const syncedResponse = one.status === 200 ? one : two;
    const syncedPayload = (await syncedResponse.json()) as { article: Article };
    expect(JSON.stringify(syncedPayload)).not.toContain('syncToken');
    const synced = syncedPayload.article;

    const repeated = await syncNewsletterCampaign(article.id);
    expect(repeated.status).toBe(200);
    expect(state.createCount).toBe(1);

    const edit = await apiRequest(
      `/studio/articles/${article.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ expectedVersion: synced.version, titleAr: 'عنوان محرر' }),
      },
      mailchimpEnv,
    );
    const edited = (await edit.json()) as Article;
    expect(edited.newsletter.needsSync).toBe(true);

    const staleSend = await apiRequest(
      `/studio/articles/${article.id}/newsletter/send`,
      {
        method: 'POST',
        body: JSON.stringify(await newsletterSendInput(article.id)),
      },
      mailchimpEnv,
    );
    expect(staleSend.status).toBe(409);
    expect(await staleSend.json()).toMatchObject({ code: 'NEWSLETTER_SYNC_REQUIRED' });
    expect(state.sendCount).toBe(0);

    const resync = await syncNewsletterCampaign(article.id);
    expect(resync.status).toBe(200);

    const badConfirmation = await apiRequest(
      `/studio/articles/${article.id}/newsletter/send`,
      {
        method: 'POST',
        body: JSON.stringify({
          ...(await newsletterSendInput(article.id)),
          confirmation: 'yes',
        }),
      },
      mailchimpEnv,
    );
    expect(badConfirmation.status).toBe(400);

    const staleAudience = await apiRequest(
      `/studio/articles/${article.id}/newsletter/send`,
      {
        method: 'POST',
        body: JSON.stringify(await newsletterSendInput(article.id, 'x'.repeat(43))),
      },
      mailchimpEnv,
    );
    expect(staleAudience.status).toBe(409);
    expect(await staleAudience.json()).toMatchObject({
      code: 'MAILCHIMP_AUDIENCE_CONFIRMATION_MISMATCH',
    });

    const sentResponse = await apiRequest(
      `/studio/articles/${article.id}/newsletter/send`,
      {
        method: 'POST',
        body: JSON.stringify(await newsletterSendInput(article.id)),
      },
      mailchimpEnv,
    );
    const sentResult = (await sentResponse.json()) as { article: Article; operation: string };
    expect(sentResponse.status).toBe(200);
    expect(sentResult.operation).toBe('sent');
    expect(sentResult.article.newsletter.status).toBe('sent');
    expect(state.sendCount).toBe(1);

    const again = await apiRequest(
      `/studio/articles/${article.id}/newsletter/send`,
      {
        method: 'POST',
        body: JSON.stringify(await newsletterSendInput(article.id)),
      },
      mailchimpEnv,
    );
    expect((await again.json()) as { operation: string }).toMatchObject({
      operation: 'already_sent',
    });
    expect(state.sendCount).toBe(1);

    const newsletterEdit = await apiRequest(
      `/studio/articles/${article.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          expectedVersion: sentResult.article.version,
          newsletter: { subject: 'موضوع جديد' },
        }),
      },
      mailchimpEnv,
    );
    expect(newsletterEdit.status).toBe(409);
    expect(await newsletterEdit.json()).toMatchObject({ code: 'NEWSLETTER_SENT' });

    const webEdit = await apiRequest(
      `/studio/articles/${article.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          expectedVersion: sentResult.article.version,
          seo: { description: 'وصف ويب بعد إرسال النشرة.' },
        }),
      },
      mailchimpEnv,
    );
    const webEdited = (await webEdit.json()) as Article;
    expect(webEdit.status).toBe(200);
    expect(webEdited.newsletter.status).toBe('sent');
    expect(webEdited.newsletter.needsSync).toBe(false);
  });

  it('fails a blocked send checklist before contacting the send action', async () => {
    const state = { createCount: 0, sendCount: 0, status: 'save', checklistReady: false };
    installMailchimpMock(state);
    const article = await createArticle(`blocked-${crypto.randomUUID().slice(0, 8)}`, mailchimpEnv);
    await syncNewsletterCampaign(article.id);
    const send = await apiRequest(
      `/studio/articles/${article.id}/newsletter/send`,
      {
        method: 'POST',
        body: JSON.stringify(await newsletterSendInput(article.id)),
      },
      mailchimpEnv,
    );
    expect(send.status).toBe(409);
    expect(await send.json()).toMatchObject({ code: 'MAILCHIMP_CHECKLIST_FAILED' });
    expect(state.sendCount).toBe(0);
  });

  it('refuses to send when the persisted campaign belongs to another audience', async () => {
    const state: MailchimpMockState = {
      createCount: 0,
      sendCount: 0,
      status: 'save',
      checklistReady: true,
    };
    installMailchimpMock(state);
    const article = await createArticle(
      `audience-mismatch-${crypto.randomUUID().slice(0, 8)}`,
      mailchimpEnv,
    );
    const sync = await syncNewsletterCampaign(article.id);
    expect(sync.status).toBe(200);

    state.audienceId = 'audience_2';
    const send = await apiRequest(
      `/studio/articles/${article.id}/newsletter/send`,
      {
        method: 'POST',
        body: JSON.stringify(await newsletterSendInput(article.id)),
      },
      mailchimpEnv,
    );
    expect(send.status).toBe(409);
    expect(await send.json()).toMatchObject({ code: 'MAILCHIMP_AUDIENCE_MISMATCH' });
    expect(state.sendCount).toBe(0);
  });

  it('refuses to send when the persisted campaign targets another segment', async () => {
    const state: MailchimpMockState = {
      createCount: 0,
      sendCount: 0,
      status: 'save',
      checklistReady: true,
    };
    installMailchimpMock(state);
    const article = await createArticle(
      `segment-mismatch-${crypto.randomUUID().slice(0, 8)}`,
      mailchimpEnv,
    );
    expect((await syncNewsletterCampaign(article.id)).status).toBe(200);
    state.campaignRecipientSegmentId = 27182;

    const send = await apiRequest(
      `/studio/articles/${article.id}/newsletter/send`,
      {
        method: 'POST',
        body: JSON.stringify(await newsletterSendInput(article.id)),
      },
      mailchimpEnv,
    );

    expect(send.status).toBe(409);
    expect(await send.json()).toMatchObject({
      code: 'MAILCHIMP_RECIPIENT_SEGMENT_MISMATCH',
    });
    expect(state.sendCount).toBe(0);
  });

  it('pins recipients on update and refuses segment drift introduced after the checklist', async () => {
    const state: MailchimpMockState = {
      createCount: 0,
      sendCount: 0,
      status: 'save',
      checklistReady: true,
      driftRecipientSegmentAfterChecklist: 27182,
    };
    installMailchimpMock(state);
    const article = await createArticle(
      `late-segment-drift-${crypto.randomUUID().slice(0, 8)}`,
      mailchimpEnv,
    );
    expect((await syncNewsletterCampaign(article.id)).status).toBe(200);

    const send = await apiRequest(
      `/studio/articles/${article.id}/newsletter/send`,
      {
        method: 'POST',
        body: JSON.stringify(await newsletterSendInput(article.id)),
      },
      mailchimpEnv,
    );

    expect(state.updatedAudienceId).toBe('audience_1');
    expect(state.updatedRecipientSegmentId).toBe(31415);
    expect(send.status).toBe(409);
    expect(await send.json()).toMatchObject({
      code: 'MAILCHIMP_RECIPIENT_SEGMENT_MISMATCH',
    });
    expect(state.sendCount).toBe(0);
    const stored = await apiRequest(`/studio/articles/${article.id}`, {}, mailchimpEnv);
    expect(await stored.json()).toMatchObject({
      newsletter: { status: 'campaign_created' },
    });
  });

  it('overwrites direct Mailchimp draft drift with the confirmed canonical snapshot', async () => {
    const state: MailchimpMockState = {
      createCount: 0,
      sendCount: 0,
      status: 'save',
      checklistReady: true,
    };
    installMailchimpMock(state);
    const slug = `canonical-send-${crypto.randomUUID().slice(0, 8)}`;
    const article = await createArticle(slug, mailchimpEnv);
    const sync = await syncNewsletterCampaign(article.id);
    expect(sync.status).toBe(200);

    state.remoteSubject = 'موضوع عُدّل خارج الاستوديو';
    state.remoteHtml = '<p>محتوى خارجي غير معتمد</p>';
    state.remotePlainText = 'محتوى خارجي غير معتمد';

    const send = await apiRequest(
      `/studio/articles/${article.id}/newsletter/send`,
      {
        method: 'POST',
        body: JSON.stringify(await newsletterSendInput(article.id)),
      },
      mailchimpEnv,
    );
    expect(send.status).toBe(200);
    expect(state.sendCount).toBe(1);
    expect(state.sentSubject).toBe(`نشرة ${slug}`);
    expect(state.sentHtml).toContain('محتوى المقال');
    expect(state.sentPlainText).toContain('محتوى المقال');
    expect(state.sentHtml).not.toContain('محتوى خارجي غير معتمد');
    expect(state.sentPlainText).not.toContain('محتوى خارجي غير معتمد');
  });

  it('rejects a confirmation opened before a later edit and resync', async () => {
    const state: MailchimpMockState = {
      createCount: 0,
      sendCount: 0,
      status: 'save',
      checklistReady: true,
    };
    installMailchimpMock(state);
    const article = await createArticle(
      `stale-confirmation-${crypto.randomUUID().slice(0, 8)}`,
      mailchimpEnv,
    );
    const firstSync = await syncNewsletterCampaign(article.id);
    expect(firstSync.status).toBe(200);
    const staleConfirmation = await newsletterSendInput(article.id);

    const edit = await apiRequest(
      `/studio/articles/${article.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          expectedVersion: staleConfirmation.expectedVersion,
          newsletter: { subject: 'موضوع أحدث' },
        }),
      },
      mailchimpEnv,
    );
    expect(edit.status).toBe(200);
    const resync = await syncNewsletterCampaign(article.id);
    expect(resync.status).toBe(200);

    const staleSend = await apiRequest(
      `/studio/articles/${article.id}/newsletter/send`,
      { method: 'POST', body: JSON.stringify(staleConfirmation) },
      mailchimpEnv,
    );
    expect(staleSend.status).toBe(409);
    expect(await staleSend.json()).toMatchObject({ code: 'NEWSLETTER_CONFIRMATION_STALE' });
    expect(state.sendCount).toBe(0);
  });

  it('returns accepted while Mailchimp is sending and reconciles without sending twice', async () => {
    const state: MailchimpMockState = {
      createCount: 0,
      sendCount: 0,
      status: 'save',
      checklistReady: true,
      completeOnSend: false,
    };
    installMailchimpMock(state);
    const article = await createArticle(
      `reconcile-${crypto.randomUUID().slice(0, 8)}`,
      mailchimpEnv,
    );
    await syncNewsletterCampaign(article.id);
    const send = await apiRequest(
      `/studio/articles/${article.id}/newsletter/send`,
      {
        method: 'POST',
        body: JSON.stringify(await newsletterSendInput(article.id)),
      },
      mailchimpEnv,
    );
    expect(send.status).toBe(202);
    expect(await send.json()).toMatchObject({ operation: 'accepted' });
    expect(state.sendCount).toBe(1);

    state.status = 'sent';
    const reconcile = await apiRequest(
      `/studio/articles/${article.id}/newsletter/reconcile`,
      { method: 'POST' },
      mailchimpEnv,
    );
    expect(reconcile.status).toBe(200);
    expect(await reconcile.json()).toMatchObject({
      operation: 'sent',
      article: { newsletter: { status: 'sent' } },
    });
    expect(state.sendCount).toBe(1);
  });

  it('does not update or send a campaign that Mailchimp already reports as in progress', async () => {
    const state: MailchimpMockState = {
      createCount: 0,
      sendCount: 0,
      status: 'save',
      checklistReady: true,
    };
    installMailchimpMock(state);
    const article = await createArticle(
      `remote-sending-${crypto.randomUUID().slice(0, 8)}`,
      mailchimpEnv,
    );
    const sync = await syncNewsletterCampaign(article.id);
    expect(sync.status).toBe(200);
    state.status = 'sending';
    state.remoteSubject = 'remote in-progress subject';
    state.remoteHtml = '<p>remote in-progress body</p>';

    const send = await apiRequest(
      `/studio/articles/${article.id}/newsletter/send`,
      {
        method: 'POST',
        body: JSON.stringify(await newsletterSendInput(article.id)),
      },
      mailchimpEnv,
    );

    expect(send.status).toBe(202);
    expect(await send.json()).toMatchObject({
      operation: 'accepted',
      article: { newsletter: { status: 'sending' } },
    });
    expect(state.sendCount).toBe(0);
    expect(state.remoteSubject).toBe('remote in-progress subject');
    expect(state.remoteHtml).toBe('<p>remote in-progress body</p>');
  });

  it('keeps an ambiguous send fenced and never asks Mailchimp to send it twice', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-17T12:00:00.000Z'));
    const state: MailchimpMockState = {
      createCount: 0,
      sendCount: 0,
      status: 'save',
      checklistReady: true,
      failSendAfterAcceptance: true,
    };
    installMailchimpMock(state);
    const article = await createArticle(
      `ambiguous-send-${crypto.randomUUID().slice(0, 8)}`,
      mailchimpEnv,
    );
    const sync = await syncNewsletterCampaign(article.id);
    expect(sync.status).toBe(200);
    const confirmation = await newsletterSendInput(article.id);

    const first = await apiRequest(
      `/studio/articles/${article.id}/newsletter/send`,
      { method: 'POST', body: JSON.stringify(confirmation) },
      mailchimpEnv,
    );
    expect(first.status).toBe(503);
    expect(await first.json()).toMatchObject({ code: 'NEWSLETTER_SEND_STATE_UNKNOWN' });

    const repeated = await apiRequest(
      `/studio/articles/${article.id}/newsletter/send`,
      { method: 'POST', body: JSON.stringify(confirmation) },
      mailchimpEnv,
    );
    expect(repeated.status).toBe(202);
    const repeatedBody = await repeated.json();
    expect(repeatedBody).toMatchObject({
      operation: 'accepted',
      article: { newsletter: { status: 'sending' } },
    });
    expect(JSON.stringify(repeatedBody)).not.toContain('sendToken');
    expect(JSON.stringify(repeatedBody)).not.toContain('sendStartedAt');
    expect(state.sendCount).toBe(1);

    vi.advanceTimersByTime(16 * 60_000);
    const recovered = await apiRequest(
      `/studio/articles/${article.id}/newsletter/reconcile`,
      { method: 'POST' },
      mailchimpEnv,
    );
    expect(recovered.status).toBe(200);
    expect(await recovered.json()).toMatchObject({
      operation: 'not_sent',
      article: { newsletter: { status: 'campaign_created' } },
    });
    expect(state.sendCount).toBe(1);
  });

  it('keeps a fresh send claim fenced from concurrent send and reconcile requests', async () => {
    const state: MailchimpMockState = {
      createCount: 0,
      sendCount: 0,
      status: 'save',
      checklistReady: true,
    };
    installMailchimpMock(state);
    const article = await createArticle(
      `concurrent-send-${crypto.randomUUID().slice(0, 8)}`,
      mailchimpEnv,
    );
    const sync = await syncNewsletterCampaign(article.id);
    expect(sync.status).toBe(200);
    const token = await audienceConfirmationToken();
    const sendInput = await newsletterSendInput(article.id, token);

    let releaseAudience!: () => void;
    state.audienceGate = new Promise<void>((resolve) => {
      releaseAudience = resolve;
    });
    let markAudienceRequested!: () => void;
    const audienceRequested = new Promise<void>((resolve) => {
      markAudienceRequested = resolve;
    });
    state.onAudienceRequest = markAudienceRequested;

    const firstSendPromise = apiRequest(
      `/studio/articles/${article.id}/newsletter/send`,
      {
        method: 'POST',
        body: JSON.stringify(sendInput),
      },
      mailchimpEnv,
    );
    await audienceRequested;

    const concurrentSend = await apiRequest(
      `/studio/articles/${article.id}/newsletter/send`,
      {
        method: 'POST',
        body: JSON.stringify(sendInput),
      },
      mailchimpEnv,
    );
    expect(concurrentSend.status).toBe(202);
    expect(await concurrentSend.json()).toMatchObject({
      operation: 'accepted',
      article: { newsletter: { status: 'sending' } },
    });

    const concurrentReconcile = await apiRequest(
      `/studio/articles/${article.id}/newsletter/reconcile`,
      { method: 'POST' },
      mailchimpEnv,
    );
    expect(concurrentReconcile.status).toBe(202);
    expect(await concurrentReconcile.json()).toMatchObject({
      operation: 'accepted',
      article: { newsletter: { status: 'sending' } },
    });
    expect(state.sendCount).toBe(0);

    releaseAudience();
    const firstSend = await firstSendPromise;
    expect(firstSend.status).toBe(200);
    expect(await firstSend.json()).toMatchObject({
      operation: 'sent',
      article: { newsletter: { status: 'sent' } },
    });
    expect(state.sendCount).toBe(1);
  });

  it('revokes a stale owner before it can call the Mailchimp send action', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-17T12:00:00.000Z'));
    const state: MailchimpMockState = {
      createCount: 0,
      sendCount: 0,
      status: 'save',
      checklistReady: true,
    };
    installMailchimpMock(state);
    const article = await createArticle(
      `stale-owner-${crypto.randomUUID().slice(0, 8)}`,
      mailchimpEnv,
    );
    const sync = await syncNewsletterCampaign(article.id);
    expect(sync.status).toBe(200);
    const token = await audienceConfirmationToken();
    const sendInput = await newsletterSendInput(article.id, token);

    let releaseAudience!: () => void;
    state.audienceGate = new Promise<void>((resolve) => {
      releaseAudience = resolve;
    });
    let markAudienceRequested!: () => void;
    const audienceRequested = new Promise<void>((resolve) => {
      markAudienceRequested = resolve;
    });
    state.onAudienceRequest = markAudienceRequested;

    const staleOwner = apiRequest(
      `/studio/articles/${article.id}/newsletter/send`,
      { method: 'POST', body: JSON.stringify(sendInput) },
      mailchimpEnv,
    );
    await audienceRequested;
    vi.advanceTimersByTime(16 * 60_000);

    const recovered = await apiRequest(
      `/studio/articles/${article.id}/newsletter/reconcile`,
      { method: 'POST' },
      mailchimpEnv,
    );
    expect(recovered.status).toBe(200);
    expect(await recovered.json()).toMatchObject({
      operation: 'not_sent',
      article: { newsletter: { status: 'campaign_created' } },
    });

    releaseAudience();
    const staleOwnerResult = await staleOwner;
    expect(staleOwnerResult.status).toBe(409);
    expect(await staleOwnerResult.json()).toMatchObject({
      code: 'NEWSLETTER_SEND_LEASE_LOST',
    });
    expect(state.sendCount).toBe(0);
  });

  it('locks an ambiguous remote create so a retry cannot create a duplicate', async () => {
    let createCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/campaigns')) {
          createCount += 1;
          throw new Error('connection lost');
        }
        if (url.includes('/segments/')) {
          return Response.json({ id: 31415, name: 'nlpage', member_count: 2, type: 'static' });
        }
        if (url.includes('/lists/')) {
          return Response.json({ name: 'القائمة', stats: { member_count: 2 } });
        }
        throw new Error('unexpected');
      }),
    );
    const article = await createArticle(`unknown-${crypto.randomUUID().slice(0, 8)}`, mailchimpEnv);
    const first = await syncNewsletterCampaign(article.id);
    expect(first.status).toBe(503);
    expect(await first.json()).toMatchObject({ code: 'NEWSLETTER_CAMPAIGN_PARTIAL_FAILURE' });

    const second = await syncNewsletterCampaign(article.id);
    expect(second.status).toBe(409);
    expect(createCount).toBe(1);
  });

  it('keeps a persisted campaign retryable when content upload fails', async () => {
    let createCount = 0;
    let contentAttempts = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (url.includes('/segments/')) {
          return Response.json({ id: 31415, name: 'nlpage', member_count: 2, type: 'static' });
        }
        if (url.includes('/lists/')) {
          return Response.json({ name: 'القائمة', stats: { member_count: 2 } });
        }
        if (url.endsWith('/campaigns') && method === 'POST') {
          createCount += 1;
          return Response.json({
            id: 'campaign-retry',
            status: 'save',
            recipients: {
              list_id: 'audience_1',
              segment_opts: { saved_segment_id: 31415 },
            },
          });
        }
        if (url.endsWith('/content')) {
          contentAttempts += 1;
          return contentAttempts === 1
            ? new Response(null, { status: 503 })
            : new Response(null, { status: 204 });
        }
        if (url.includes('/campaigns/campaign-retry') && method === 'PATCH') {
          return Response.json({
            id: 'campaign-retry',
            status: 'save',
            recipients: {
              list_id: 'audience_1',
              segment_opts: { saved_segment_id: 31415 },
            },
          });
        }
        if (url.includes('/campaigns/campaign-retry')) {
          return Response.json({
            id: 'campaign-retry',
            status: 'save',
            recipients: {
              list_id: 'audience_1',
              segment_opts: { saved_segment_id: 31415 },
            },
          });
        }
        throw new Error(`unexpected ${method} ${url}`);
      }),
    );
    const article = await createArticle(`retry-${crypto.randomUUID().slice(0, 8)}`, mailchimpEnv);
    const first = await syncNewsletterCampaign(article.id);
    expect(first.status).toBe(503);

    const stored = await apiRequest(`/studio/articles/${article.id}`, {}, mailchimpEnv);
    expect(await stored.json()).toMatchObject({
      newsletter: { status: 'campaign_created', campaignId: 'campaign-retry', needsSync: true },
    });

    const retry = await syncNewsletterCampaign(article.id);
    expect(retry.status).toBe(200);
    expect(createCount).toBe(1);
    expect(contentAttempts).toBe(2);
  });
});
