import { describe, expect, it } from 'vitest';
import { analyzeArticleDependencies } from './article-dependencies.ts';
import type { WordPressRecord } from './types.ts';

const EMPTY_SEO: WordPressRecord['seo'] = {
  title: null,
  description: null,
  canonicalUrl: null,
  noIndex: false,
  focusKeyword: null,
  primaryCategoryLegacyId: null,
  openGraph: { title: null, description: null, imageUrl: null, imageLegacyId: null },
  twitter: { title: null, description: null, imageUrl: null, imageLegacyId: null },
};

function record(overrides: Partial<WordPressRecord>): WordPressRecord {
  return {
    legacyId: 1,
    postType: 'post',
    status: 'publish',
    title: 'مقال تجريبي',
    slug: 'fixture',
    suggestedTargetSlug: 'fixture',
    legacyUrl: 'https://mukhtalif.net/fixture/',
    guid: null,
    authorLogin: 'author',
    publishedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    parentLegacyId: null,
    menuOrder: 0,
    contentHtml: '<p>محتوى</p>',
    excerptHtml: '',
    featuredMediaLegacyId: null,
    terms: [],
    oldSlugs: [],
    seo: EMPTY_SEO,
    builder: null,
    media: null,
    teamMember: null,
    book: null,
    checksumSha256: 'a'.repeat(64),
    ...overrides,
  };
}

function attachment(legacyId: number, sourceUrl: string): WordPressRecord {
  return record({
    legacyId,
    postType: 'attachment',
    status: 'inherit',
    title: 'صورة الغلاف',
    authorLogin: null,
    contentHtml: '',
    featuredMediaLegacyId: null,
    media: {
      source: 'wxr+rest',
      sourceUrl,
      attachedFile: '2026/01/cover.png',
      mimeType: 'image/png',
      altText: 'وصف الصورة',
      captionHtml: null,
      width: 1200,
      height: 800,
      byteSize: 1_000,
    },
  });
}

describe('article media dependency analysis', () => {
  it('maps the cover and inline image, ignores CSS selectors, and restores the Elementor link', () => {
    const media = attachment(10, 'https://mukhtalif.net/wp-content/uploads/cover.png');
    const post = record({
      featuredMediaLegacyId: 10,
      contentHtml:
        '<style>.widget img[src$=".svg"]{width:48px}.thing[class*=size]{display:block}</style><div><img class="wp-image-10" src="https://mukhtalif.net/wp-content/uploads/cover.png" alt="صورة داخلية"></div>',
      builder: {
        kind: 'elementor',
        data: JSON.stringify([
          {
            widgetType: 'image',
            settings: {
              image: { id: 10, url: media.media?.sourceUrl },
              element_pack_wrapper_link: {
                url: 'https://mukhtalif.net/listen?utm_source=mukhtalifnl',
              },
            },
          },
        ]),
        pageSettings: null,
        formSnapshot: null,
        checksumSha256: 'b'.repeat(64),
      },
    });

    const report = analyzeArticleDependencies({ post, attachments: [media] });

    expect(report.featuredMedia).toMatchObject({ legacyId: 10, mapped: true });
    expect(report.inlineMedia).toHaveLength(1);
    expect(report.inlineMedia[0]).toMatchObject({
      attachmentLegacyId: 10,
      mapping: 'class-id',
      linkSource: 'elementor',
      originalLinkUrl: 'https://mukhtalif.net/listen?utm_source=mukhtalifnl',
      linkUrl: '/shows?utm_source=mukhtalifnl',
      linkDisposition: 'internal-rewritten',
    });
    expect(report.shortcodes).toEqual([]);
    expect(report.adMarkers).toEqual([]);
    expect(report.unsupportedElements).toEqual([]);
  });

  it('reports only explicit ad markers and never converts them automatically', () => {
    const media = attachment(10, 'https://mukhtalif.net/wp-content/uploads/cover.png');
    const post = record({
      featuredMediaLegacyId: 10,
      contentHtml:
        '<div class="sponsored-ad">[the_ad id="12"]</div><img class="wp-image-10" src="https://mukhtalif.net/wp-content/uploads/cover.png" alt="صورة">',
    });

    const report = analyzeArticleDependencies({ post, attachments: [media] });

    expect(report.adMarkers).toEqual(
      expect.arrayContaining([
        { kind: 'class-or-id', value: 'sponsored-ad' },
        { kind: 'shortcode', value: '[the_ad id="12"]' },
      ]),
    );
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        'ad-block-contract-not-supported',
        'shortcode-contract-not-supported',
      ]),
    );
    expect(report.readyForApply).toBe(false);
  });

  it('keeps an approved HTTPS App Store image link', () => {
    const media = attachment(10, 'https://mukhtalif.net/wp-content/uploads/cover.png');
    const post = record({
      featuredMediaLegacyId: 10,
      contentHtml:
        '<a href="https://apps.apple.com/sa/app/example/id123"><img class="wp-image-10" src="https://mukhtalif.net/wp-content/uploads/cover.png" alt="التطبيق"></a>',
    });

    const report = analyzeArticleDependencies({ post, attachments: [media] });
    expect(report.inlineMedia[0]).toMatchObject({
      linkSource: 'html-anchor',
      linkUrl: 'https://apps.apple.com/sa/app/example/id123',
      linkDisposition: 'external-https',
    });
    expect(report.blockers).not.toContain('unsafe-or-unroutable-image-link');
  });
});
