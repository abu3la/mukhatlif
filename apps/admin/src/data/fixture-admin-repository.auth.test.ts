import { describe, expect, it } from 'vitest';
import { createDemoData } from '@/lib';
import {
  FIXTURE_ADMIN_ACCOUNTS,
  FIXTURE_CREATED_ACCOUNT_PASSWORD,
  FixtureAdminAuthGateway,
} from './fixture-admin-auth-gateway';
import type { DemoAdminAccount } from './admin-auth-gateway';
import { createFixtureAdminRepository } from './fixture-admin-repository';

async function authenticatedRepository(accountIndex: 0 | 1) {
  const account = FIXTURE_ADMIN_ACCOUNTS[accountIndex];
  const gateway = new FixtureAdminAuthGateway({ storage: null });
  await gateway.signInWithPassword(account.email, account.password);
  const repository = createFixtureAdminRepository({
    getAuthenticatedSubject: () => gateway.getCurrentSession()?.subject ?? null,
    registerAuthAccount: (newAccount) => {
      gateway.registerAccount(newAccount);
    },
    updateAuthAccountRole: (id, role) => {
      gateway.updateAccountRole(id, role);
    },
  });
  return { account, gateway, repository };
}

describe('FixtureAdminRepository Studio authorization', () => {
  it.each([
    [0, 'admin'],
    [1, 'editor'],
  ] as const)('derives the Studio viewer for fixture account %s', async (index, role) => {
    const { account, repository } = await authenticatedRepository(index);

    await expect(repository.readViewer()).resolves.toMatchObject({
      id: account.id,
      email: account.email,
      role,
      permissions:
        role === 'admin'
          ? expect.arrayContaining(['access.view', 'access.manage'])
          : expect.arrayContaining(['overview.view', 'episodes.manage']),
    });
  });

  it('keeps normal demo login options limited to Studio accounts', () => {
    expect(FIXTURE_ADMIN_ACCOUNTS).toHaveLength(2);
    expect(FIXTURE_ADMIN_ACCOUNTS.map((account) => account.role)).toEqual([
      'admin',
      'editor',
    ]);
    expect(FIXTURE_ADMIN_ACCOUNTS.map((account) => account.email)).not.toContain(
      'listener@demo.mukhtalif.local',
    );
  });

  it('denies an app-only listener who authenticates against the Studio fixture', async () => {
    const appOnlyAccount: DemoAdminAccount = {
      id: 'user_noura',
      name: 'نورة الشمري',
      email: 'listener@demo.mukhtalif.local',
      password: 'Listener123!',
      role: 'editor',
      locale: 'ar',
    };
    const gateway = new FixtureAdminAuthGateway({
      storage: null,
      accounts: [appOnlyAccount],
    });
    await gateway.signInWithPassword(appOnlyAccount.email, appOnlyAccount.password);
    const repository = createFixtureAdminRepository({
      getAuthenticatedSubject: () => gateway.getCurrentSession()?.subject ?? null,
    });

    await expect(repository.readViewer()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('allows editors to read content without loading private directories', async () => {
    const { repository } = await authenticatedRepository(1);

    await expect(repository.readContentWorkspace()).resolves.toMatchObject({
      shows: expect.any(Array),
      episodes: expect.any(Array),
    });
    await expect(repository.readSubscriberDirectory()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(repository.readStudioMemberDirectory()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    const authors = await repository.listArticleAuthors();
    expect(authors.length).toBeGreaterThan(0);
    expect(authors[0]).toEqual({
      studioMemberId: expect.any(String),
      displayName: expect.any(String),
    });
    expect(authors[0]).not.toHaveProperty('email');
    expect(authors[0]).not.toHaveProperty('role');
  });

  it('simulates a session-local article image upload with measurable progress', async () => {
    const { repository } = await authenticatedRepository(1);
    const progress: number[] = [];
    const uploaded = await repository.uploadArticleImage({
      body: new Blob(['fixture-image'], { type: 'image/png' }),
      fileName: 'weekly.png',
      mimeType: 'image/png',
      byteSize: 13,
      width: 1200,
      height: 800,
      alt: 'صورة العدد الأسبوعي',
      caption: 'من استوديو مختلف',
      onProgress: (value) => progress.push(value),
    });

    expect(uploaded).toMatchObject({
      kind: 'image',
      status: 'ready',
      defaultAlt: 'صورة العدد الأسبوعي',
      defaultCaption: 'من استوديو مختلف',
    });
    expect(uploaded.publicUrl).toMatch(/^data:image\/png;base64,/);
    await expect(repository.listArticleMedia()).resolves.toEqual([uploaded]);
    expect(progress).toEqual([0, 65, 100]);
  });

  it('renders only allowlisted image styling in fixture web and email output', async () => {
    const { repository } = await authenticatedRepository(1);
    const uploaded = await repository.uploadArticleImage({
      body: new Blob(['fixture-image'], { type: 'image/png' }),
      fileName: 'styled.png',
      mimeType: 'image/png',
      byteSize: 13,
      width: 1200,
      height: 800,
      alt: 'صورة منسقة',
    });

    const article = await repository.createArticle({
      slug: 'styled-fixture-image',
      title: 'تنسيق الصورة',
      author: { type: 'custom', displayName: 'فريق مختلف' },
      authorPlacement: 'after_title',
      content: {
        type: 'doc',
        content: [
          {
            type: 'imageBlock',
            attrs: {
              mediaId: uploaded.id,
              alt: 'صورة بمحاذاة النهاية',
              presentation: 'wide',
              alignment: 'end',
              radius: 'round',
            },
          },
          {
            type: 'imageBlock',
            attrs: {
              mediaId: uploaded.id,
              alt: 'صورة بعقد قديم',
              presentation: 'content',
            },
          },
        ],
      },
      seo: { noIndex: false },
      newsletter: { enabled: true, subject: 'تنسيق آمن للصور' },
    });

    expect(article.contentHtml).toContain('data-presentation="wide"');
    expect(article.contentHtml).toContain('data-alignment="end"');
    expect(article.contentHtml).toContain('data-radius="round"');
    expect(article.contentHtml).toContain('width:100%;max-width:none');
    expect(article.contentHtml).toContain('margin-inline-start:auto;margin-inline-end:0');
    expect(article.contentHtml).toContain('border-radius:28px');
    expect(article.contentHtml).toContain('data-presentation="content"');
    expect(article.contentHtml).toContain('data-alignment="center"');
    expect(article.contentHtml).toContain('data-radius="none"');
    expect(article.contentHtml).toContain('width:100%;max-width:640px');
    expect(article.contentHtml).toContain('margin-inline-start:auto;margin-inline-end:auto');
    expect(article.contentHtml).toContain('border-radius:0');

    const preview = await repository.previewArticleNewsletter(article.id);
    expect(preview.html).toContain('align="left"');
    expect(preview.html).toContain('border-radius:28px');
    expect(preview.html).toContain('margin:0 auto 0 0');
    expect(preview.html).toContain('align="center"');
    expect(preview.html).toContain('border-radius:0');
  });

  it('renders text-section layout in fixture web and newsletter output', async () => {
    const { repository } = await authenticatedRepository(1);
    const article = await repository.createArticle({
      slug: 'fixture-text-section',
      title: 'محاذاة النص',
      author: { type: 'custom', displayName: 'فريق مختلف' },
      authorPlacement: 'after_title',
      content: {
        type: 'doc',
        content: [
          {
            type: 'textSection',
            attrs: {
              alignment: 'justify',
              direction: 'rtl',
              vertical: 'middle',
              height: 'medium',
            },
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'نص تجريبي للمحاذاة' }],
              },
            ],
          },
        ],
      },
      seo: { noIndex: false },
      newsletter: { enabled: true, subject: 'معاينة محاذاة النص' },
    });

    expect(article.contentHtml).toContain('data-article-text-section=""');
    expect(article.contentHtml).toContain('article-text-section--align-justify');
    expect(article.contentHtml).toContain('data-alignment="justify"');
    expect(article.contentHtml).toContain('data-direction="rtl"');
    expect(article.contentHtml).toContain('justify-content:center');
    expect(article.contentHtml).toContain('min-height:200px');
    expect(article.contentHtml).toContain('text-align:justify');

    const preview = await repository.previewArticleNewsletter(article.id);
    expect(preview.html).toContain('<table role="presentation"');
    expect(preview.html).toContain('height="200"');
    expect(preview.html).toContain('valign="middle"');
    expect(preview.html).toContain('align="justify"');
    expect(preview.text).toContain('نص تجريبي للمحاذاة');
  });

  it('returns app users in subscribers and Studio members in access without overlap', async () => {
    const { repository } = await authenticatedRepository(0);

    const subscribers = await repository.readSubscriberDirectory();
    const StudioDirectory = await repository.readStudioMemberDirectory();

    expect(subscribers.users.map((user) => user.email)).toContain(
      'listener@demo.mukhtalif.local',
    );
    expect(subscribers.users.map((user) => user.email)).not.toContain(
      'admin@demo.mukhtalif.local',
    );
    expect(StudioDirectory.studioMembers.map((member) => member.email)).toEqual([
      'admin@demo.mukhtalif.local',
      'editor@demo.mukhtalif.local',
    ]);
    expect(StudioDirectory.studioMembers.map((member) => member.id)).not.toEqual(
      expect.arrayContaining(subscribers.users.map((user) => user.id)),
    );
  });

  it('rejects manage-only permissions and applies a valid role update', async () => {
    const { repository } = await authenticatedRepository(0);

    await expect(
      repository.updateRolePermissions('editor', ['articles.manage']),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(
      repository.updateRolePermissions('editor', [
        'articles.view',
        'articles.manage',
      ]),
    ).resolves.toMatchObject({
      id: 'editor',
      permissions: ['articles.view', 'articles.manage'],
    });
  });

  it('prevents a Studio member from changing their own role', async () => {
    const { repository } = await authenticatedRepository(0);

    await expect(
      repository.updateStudioMemberRole('studio_member_admin_badr', 'editor'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('creates a fixture Studio account once and exposes it only in the Studio directory', async () => {
    const { gateway, repository } = await authenticatedRepository(0);

    const created = await repository.createStudioMember({
      name: '  ليان الحربي  ',
      email: '  LIAN.HARBI@EXAMPLE.COM ',
      role: 'editor',
      locale: 'ar',
    });

    expect(created).toMatchObject({
      name: 'ليان الحربي',
      email: 'lian.harbi@example.com',
      role: 'editor',
    });
    expect(gateway.demoAccounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: created.id,
          email: created.email,
          role: 'editor',
        }),
      ]),
    );
    await expect(repository.readStudioMemberDirectory()).resolves.toMatchObject({
      studioMembers: expect.arrayContaining([created]),
    });
    expect((await repository.readSubscriberDirectory()).users).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ email: created.email })]),
    );
    await expect(
      repository.createStudioMember({
        name: 'اسم آخر',
        email: 'LIAN.HARBI@example.com',
        role: 'editor',
        locale: 'en',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT', operation: 'createStudioMember' });
  });

  it('creates a custom role and lets its Studio member sign in', async () => {
    const { gateway, repository } = await authenticatedRepository(0);
    const role = await repository.createRole({
      name: 'مراجع المحتوى',
      description: 'يراجع المقالات قبل النشر.',
      permissions: ['articles.view'],
    });

    await expect(repository.readRole(role.id)).resolves.toMatchObject({
      memberCount: 0,
    });
    const created = await repository.createStudioMember({
      name: 'سلمى المراجعة',
      email: 'reviewer@example.com',
      role: role.id,
      locale: 'ar',
    });
    await expect(repository.readRole(role.id)).resolves.toMatchObject({ memberCount: 1 });

    await gateway.signOut();
    await gateway.signInWithPassword(created.email, FIXTURE_CREATED_ACCOUNT_PASSWORD);
    await expect(repository.readViewer()).resolves.toMatchObject({
      id: created.id,
      role: role.id,
      roleName: 'مراجع المحتوى',
      permissions: ['articles.view'],
    });
    await expect(repository.readStudioMemberDirectory()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('prevents a custom access manager from assigning the protected role', async () => {
    const { gateway, repository } = await authenticatedRepository(0);
    const role = await repository.createRole({
      name: 'مدير الحسابات',
      description: '',
      permissions: ['access.view', 'access.manage'],
    });
    const manager = await repository.createStudioMember({
      name: 'مدير مخصص',
      email: 'access.manager@example.com',
      role: role.id,
      locale: 'ar',
    });
    await gateway.signOut();
    await gateway.signInWithPassword(manager.email, FIXTURE_CREATED_ACCOUNT_PASSWORD);

    await expect(
      repository.createStudioMember({
        name: 'مشرف غير مسموح',
        email: 'forbidden.admin@example.com',
        role: 'admin',
        locale: 'ar',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      repository.updateStudioMemberRole('studio_member_admin_badr', role.id),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('requires access management before a Studio account can be created', async () => {
    const { repository } = await authenticatedRepository(1);

    await expect(
      repository.createStudioMember({
        name: 'ليان الحربي',
        email: 'lian.harbi@example.com',
        role: 'editor',
        locale: 'ar',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', operation: 'createStudioMember' });
  });

  it('keeps app-user fixtures separate when cloning initial data', async () => {
    const data = createDemoData();
    data.users.push({
      id: 'user_app_only',
      name: 'مستخدم التطبيق',
      email: 'app.only@example.com',
      joinedAt: data.asOf,
    });
    const repository = createFixtureAdminRepository({ initialData: data });

    expect((await repository.readSubscriberDirectory()).users).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'user_app_only' })]),
    );
    expect((await repository.readStudioMemberDirectory()).studioMembers).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'user_app_only' })]),
    );
  });

  it('rejects a stale newsletter confirmation snapshot before simulated delivery', async () => {
    const { repository } = await authenticatedRepository(0);
    const capability = await repository.getMailchimpCapability();
    const article = (await repository.readContentWorkspace()).articles.find(
      (candidate) => candidate.id === 'article_1',
    )!;
    const synced = await repository.syncArticleNewsletterCampaign(
      article.id,
      article.version,
    );
    const campaignId = synced.article.newsletter.campaignId;
    expect(capability.audienceConfirmationToken).toBeTruthy();
    expect(campaignId).toBeTruthy();

    await expect(
      repository.sendArticleNewsletter(
        synced.article.id,
        capability.audienceConfirmationToken!,
        synced.article.version + 1,
        campaignId!,
      ),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      context: { reason: 'NEWSLETTER_CONFIRMATION_STALE' },
    });
  });

  it('includes the canonical video URL in the local plain-text newsletter preview', async () => {
    const { repository } = await authenticatedRepository(1);
    const article = (await repository.readContentWorkspace()).articles.find(
      (candidate) => candidate.id === 'article_1',
    )!;

    const updated = await repository.updateArticle(article.id, {
      expectedVersion: article.version,
      content: {
        type: 'doc',
        content: [
          {
            type: 'videoEmbed',
            attrs: {
              provider: 'youtube',
              videoId: 'M7lc1UVf-VE',
              title: 'جولة داخل استوديو مختلف',
              posterMediaId: 'med-00000000000000000000000000000001',
            },
          },
        ],
      },
    });
    expect(updated.contentHtml).toContain('border-radius:8px');

    const preview = await repository.previewArticleNewsletter(article.id);
    expect(preview.text).toContain('https://www.youtube.com/watch?v=M7lc1UVf-VE');
  });

  it('places the author after the title or at the end in local newsletter previews', async () => {
    const { repository } = await authenticatedRepository(1);
    const article = (await repository.readContentWorkspace()).articles.find(
      (candidate) => candidate.id === 'article_1',
    )!;

    expect(article.authorPlacement).toBe('after_title');
    const afterTitlePreview = await repository.previewArticleNewsletter(article.id);
    expect(afterTitlePreview.html.indexOf('data-article-byline=""')).toBeLessThan(
      afterTitlePreview.html.indexOf(article.body),
    );
    expect(afterTitlePreview.text.indexOf(`بقلم ${article.author.displayName}`)).toBeLessThan(
      afterTitlePreview.text.indexOf(article.body),
    );

    const updated = await repository.updateArticle(article.id, {
      expectedVersion: article.version,
      authorPlacement: 'end',
    });
    expect(updated.authorPlacement).toBe('end');

    const endPreview = await repository.previewArticleNewsletter(updated.id);
    expect(endPreview.html.indexOf('data-article-byline=""')).toBeGreaterThan(
      endPreview.html.indexOf(updated.body),
    );
    expect(endPreview.text.indexOf(`بقلم ${updated.author.displayName}`)).toBeGreaterThan(
      endPreview.text.indexOf(updated.body),
    );
  });

  it('includes the escaped article cover in the local newsletter HTML', async () => {
    const { repository } = await authenticatedRepository(1);
    const article = (await repository.readContentWorkspace()).articles.find(
      (candidate) => candidate.id === 'article_1',
    )!;

    const withFallbackAlt = await repository.updateArticle(article.id, {
      expectedVersion: article.version,
      coverUrl: 'https://media.example.test/weekly-cover.png?edition=1&size=large',
    });
    const fallbackPreview = await repository.previewArticleNewsletter(withFallbackAlt.id);
    expect(fallbackPreview.html).toContain(`alt="${article.title}"`);

    const updated = await repository.updateArticle(article.id, {
      expectedVersion: withFallbackAlt.version,
      coverAlt: 'غلاف "الأسبوع" <الجديد>',
    });
    const preview = await repository.previewArticleNewsletter(updated.id);

    expect(preview.html).toContain('data-article-cover=""');
    expect(preview.html).toContain(
      'src="https://media.example.test/weekly-cover.png?edition=1&amp;size=large"',
    );
    expect(preview.html).toContain('alt="غلاف &quot;الأسبوع&quot; &lt;الجديد&gt;"');
    expect(preview.html).toContain('style="display:block;width:100%;height:auto;');
    expect(preview.html).not.toContain('aspect-ratio:16/9');
    expect(preview.html.indexOf('data-article-cover=""')).toBeLessThan(
      preview.html.indexOf('<h1'),
    );
  });

  it('escapes and bidi-isolates the author in the local newsletter preview', async () => {
    const { repository } = await authenticatedRepository(1);
    const article = (await repository.readContentWorkspace()).articles.find(
      (candidate) => candidate.id === 'article_1',
    )!;
    const authorName = '<>&';

    const updated = await repository.updateArticle(article.id, {
      expectedVersion: article.version,
      author: { type: 'custom', displayName: authorName },
    });
    const preview = await repository.previewArticleNewsletter(updated.id);

    expect(preview.html).toContain(
      'بقلم <bdi dir="auto" style="unicode-bidi:isolate">&lt;&gt;&amp;</bdi>',
    );
    expect(preview.html).not.toContain('<bdi dir="auto" style="unicode-bidi:isolate"><>&</bdi>');
    expect(preview.text).toContain('بقلم <>&');
  });
});
