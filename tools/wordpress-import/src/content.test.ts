import { describe, expect, it } from 'vitest';
import { convertWordPressContent } from './content.ts';
import { rewriteArticleLink } from './legacy-links.ts';

const MEDIA_ID = 'med-0123456789abcdef0123456789abcdef';

describe('WordPress article content conversion', () => {
  it('keeps a mapped linked image as an editable imageBlock without the source host', () => {
    const conversion = convertWordPressContent(
      '<p>قبل <strong>الصورة</strong></p><a href="https://mukhtalif.net/listen?ref=old"><img src="https://mcusercontent.com/example/banner.png" alt="قديم"></a><p><a href="https://mukhtalif.net/suggest?ref=article">شاركنا</a></p>',
      {
        images: [{ mediaId: MEDIA_ID, alt: 'وصف الصورة', linkUrl: '/shows?ref=old' }],
        rewriteLink: rewriteArticleLink,
      },
    );

    expect(conversion.stats).toMatchObject({
      mappedImages: 1,
      externalImages: 0,
      droppedElements: 0,
      droppedUnsafeUrls: 0,
    });
    expect(conversion.document.content?.map((node) => node.type)).toEqual([
      'paragraph',
      'imageBlock',
      'paragraph',
    ]);
    expect(conversion.document.content?.[1]).toEqual({
      type: 'imageBlock',
      attrs: {
        mediaId: MEDIA_ID,
        alt: 'وصف الصورة',
        linkUrl: '/shows?ref=old',
        presentation: 'content',
        alignment: 'center',
        radius: 'none',
      },
    });
    expect(conversion.contentHtml).toContain(`/media/${MEDIA_ID}`);
    expect(conversion.contentHtml).toContain('href="/shows?ref=old"');
    expect(conversion.contentHtml).toContain('href="/suggest?ref=article"');
    expect(conversion.contentHtml).not.toContain('mcusercontent.com');
    expect(conversion.contentHtml).not.toContain('mukhtalif.net');
    expect(conversion.legacyContentHtml).toContain(`/media/${MEDIA_ID}`);
  });

  it('rewrites an internal WordPress embed to a safe relative link', () => {
    const conversion = convertWordPressContent(
      '<!-- wp:embed --><figure class="wp-block-embed"><div class="wp-block-embed__wrapper">https://mukhtalif.net/kkexl/↗</div></figure><!-- /wp:embed -->',
      { rewriteLink: rewriteArticleLink },
    );

    expect(conversion.contentHtml).toContain('href="/kkexl"');
    expect(conversion.contentHtml).not.toContain('href="https://mukhtalif.net');
  });

  it('drops executable elements and reports the fidelity loss', () => {
    const conversion = convertWordPressContent(
      '<p>محتوى آمن</p><script>alert(1)</script><img src="javascript:alert(1)" alt="خطر">',
    );

    expect(conversion.contentHtml).toContain('محتوى آمن');
    expect(conversion.contentHtml).not.toContain('alert(1)');
    expect(conversion.stats.droppedElements).toBe(1);
    expect(conversion.stats.droppedUnsafeUrls).toBe(1);
  });
});
