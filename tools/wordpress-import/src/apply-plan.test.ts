import { describe, expect, it } from 'vitest';
import { buildWordPressApplyPlan } from './apply-plan.ts';
import { checksumObject } from './hash.ts';
import type { VerifiedExternalR2MediaStorage, VerifiedR2MediaStorage } from './r2-media.ts';
import type { ProposedRedirect, WordPressManifest, WordPressRecord } from './types.ts';

const WP_IMAGE_URL = 'https://mukhtalif.net/wp-content/uploads/cover.png';
const EXTERNAL_IMAGE_URL = 'https://mcusercontent.com/example/images/banner.png';

const EMPTY_SEO: WordPressRecord['seo'] = {
  title: 'عنوان البحث',
  description: 'وصف البحث',
  canonicalUrl: null,
  noIndex: false,
  focusKeyword: null,
  primaryCategoryLegacyId: null,
  openGraph: { title: null, description: null, imageUrl: null, imageLegacyId: null },
  twitter: { title: null, description: null, imageUrl: null, imageLegacyId: null },
};

function baseRecord(overrides: Partial<WordPressRecord>): WordPressRecord {
  return {
    legacyId: 1,
    postType: 'post',
    status: 'publish',
    title: 'مقال كامل',
    slug: 'legacy-article',
    suggestedTargetSlug: 'article',
    legacyUrl: 'https://mukhtalif.net/legacy-article/',
    guid: null,
    authorLogin: 'author',
    publishedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    parentLegacyId: null,
    menuOrder: 0,
    contentHtml: '<p>نص المقال</p>',
    excerptHtml: '<p>ملخص</p>',
    featuredMediaLegacyId: null,
    terms: [],
    oldSlugs: [],
    seo: EMPTY_SEO,
    builder: null,
    media: null,
    teamMember: null,
    book: null,
    checksumSha256: '1'.repeat(64),
    ...overrides,
  };
}

function fixtureManifest(): WordPressManifest {
  const attachment = baseRecord({
    legacyId: 10,
    postType: 'attachment',
    status: 'inherit',
    title: 'غلاف المقال',
    slug: 'cover',
    suggestedTargetSlug: 'cover',
    authorLogin: null,
    contentHtml: '',
    excerptHtml: '',
    featuredMediaLegacyId: null,
    media: {
      source: 'wxr+rest',
      sourceUrl: WP_IMAGE_URL,
      attachedFile: '2026/01/cover.png',
      mimeType: 'image/png',
      altText: 'غلاف المقال',
      captionHtml: null,
      width: 1200,
      height: 800,
      byteSize: 2_000,
    },
    checksumSha256: '2'.repeat(64),
  });
  const post = baseRecord({
    featuredMediaLegacyId: 10,
    contentHtml: `<p>بداية المقال</p><a href="https://mukhtalif.net/listen"><img class="wp-image-10" src="${WP_IMAGE_URL}" alt="الصورة الأولى"></a><p><img src="${EXTERNAL_IMAGE_URL}" alt="بنر خارجي"></p>`,
  });
  const draft = {
    schemaVersion: 1 as const,
    source: {
      kind: 'wordpress_wxr' as const,
      siteUrl: 'https://mukhtalif.net',
      blogUrl: 'https://mukhtalif.net',
      title: 'مختلف',
      description: '',
      language: 'ar',
      wxrVersion: '1.2',
      generator: null,
      exportedAt: '2026-01-01T00:00:00.000Z',
      sourceFile: '/private/wordpress.xml',
      sourceChecksumSha256: '3'.repeat(64),
    },
    authors: [
      {
        legacyId: 7,
        login: 'author',
        email: 'author@example.com',
        displayName: 'كاتب مختلف',
        firstName: 'كاتب',
        lastName: 'مختلف',
        checksumSha256: '4'.repeat(64),
      },
    ],
    candidates: {
      post: [post],
      page: [],
      team_member: [],
      book: [],
      attachment: [attachment],
    },
    deferred: [],
    ignored: { byPostType: {}, total: 0 },
    proposedRedirects: [
      {
        source: 'derived',
        legacyRecordType: 'post',
        legacyRecordId: 1,
        sourcePath: '/legacy-article/',
        destination: '/articles/article/',
        reason: 'canonical-route',
        statusCode: 301,
        enabled: true,
        requiresReview: false,
        pluginRedirectId: null,
      },
      {
        source: 'derived',
        legacyRecordType: 'post',
        legacyRecordId: 1,
        sourcePath: '/older-article/',
        destination: '/articles/article/',
        reason: 'old-slug',
        statusCode: 301,
        enabled: true,
        requiresReview: false,
        pluginRedirectId: null,
      },
    ] satisfies ProposedRedirect[],
  };
  return { ...draft, checksumSha256: checksumObject(draft) };
}

function fixtureStorage(): VerifiedR2MediaStorage {
  return {
    schemaVersion: 1,
    deploymentEnvironment: 'development',
    bucket: 'mukhtalif-media',
    prefix: 'legacy/wordpress',
    mediaPublicOrigin: 'https://media.dev.example.com',
    mediaDownloadReportChecksumSha256: '5'.repeat(64),
    r2VerificationReportChecksumSha256: '6'.repeat(64),
    items: [
      {
        legacyId: 10,
        key: 'legacy/wordpress/10/cover.png',
        mimeType: 'image/png',
        byteSize: 2_000,
        checksumSha256: '7'.repeat(64),
        sourceUrl: WP_IMAGE_URL,
        width: 1200,
        height: 800,
      },
    ],
  };
}

function fixtureExternalStorage(): VerifiedExternalR2MediaStorage {
  return {
    schemaVersion: 1,
    bucket: 'mukhtalif-media',
    prefix: 'legacy/wordpress/external',
    r2VerificationReportChecksumSha256: '8'.repeat(64),
    items: [
      {
        sourceUrl: EXTERNAL_IMAGE_URL,
        urlSha256: '9'.repeat(64),
        key: `legacy/wordpress/external/${'9'.repeat(64)}/banner.png`,
        mimeType: 'image/png',
        byteSize: 1_000,
        checksumSha256: 'a'.repeat(64),
        width: 700,
        height: 520,
      },
    ],
  };
}

describe('WordPress apply plan', () => {
  it('plans deterministic R2 media and a complete editable article', () => {
    const manifest = fixtureManifest();
    const plan = buildWordPressApplyPlan(manifest, fixtureStorage(), fixtureExternalStorage());
    const rerun = buildWordPressApplyPlan(manifest, fixtureStorage(), fixtureExternalStorage());

    expect(plan.errors).toEqual([]);
    expect(plan.blockedArticles).toEqual([]);
    expect(plan.articles).toHaveLength(1);
    expect(plan.mediaAssets).toHaveLength(2);
    expect(plan.externalInlineMedia).toEqual([
      expect.objectContaining({
        sourceUrl: EXTERNAL_IMAGE_URL,
        r2Verified: true,
        assetEligible: true,
      }),
    ]);
    const article = plan.articles[0]!.row;
    expect(article.cover_url).toMatch(/^https:\/\/media\.dev\.example\.com\/media\/med-/);
    expect(article.cover_url).not.toContain('mukhtalif.net/wp-content');
    const imageBlocks = (
      article.content_json as { content: Array<Record<string, unknown>> }
    ).content.filter((node) => node.type === 'imageBlock');
    expect(imageBlocks).toHaveLength(2);
    expect(imageBlocks[0]).toMatchObject({ attrs: { linkUrl: '/shows' } });
    expect(article.content_html).not.toContain('mcusercontent.com');
    expect(article.content_html).not.toContain('mukhtalif.net/wp-content');
    expect(plan.redirects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source_path: '/legacy-article/',
          source_label: 'wordpress-canonical',
        }),
        expect.objectContaining({
          source_path: '/older-article/',
          source_label: 'wordpress-old-slug',
        }),
      ]),
    );
    expect(plan.checksumSha256).toBe(rerun.checksumSha256);
  });
});
