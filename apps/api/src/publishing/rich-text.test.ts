import { describe, expect, it, vi } from 'vitest';
import type { Article, RichTextDocument } from '@mukhtalif/types';
import {
  articleAuthorInputSchema,
  createArticleSchema,
  richTextDocumentSchema,
  updateArticleSchema,
} from '@mukhtalif/validation';
import { createArticleRecord } from './article-record';
import { canonicalizeRichTextMedia, richTextReferencesMedia } from './media';
import { renderNewsletter } from './newsletter';
import {
  documentFromPlainText,
  renderRichText,
  richTextToEmailPlainText,
  richTextToPlainText,
  toPublishedArticle,
} from './rich-text';

const paragraph = (text: string): RichTextDocument => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

describe('canonical rich-text validation', () => {
  it('accepts the configured Tiptap subset and rejects unsafe links', () => {
    const valid = paragraph('نص');
    valid.content![0].content![0].marks = [
      { type: 'link', attrs: { href: 'https://mukhtalif.net/read', target: '_blank' } },
    ];
    expect(richTextDocumentSchema.safeParse(valid).success).toBe(true);

    for (const href of [
      'javascript:alert(1)',
      'data:text/html,bad',
      'http://example.com',
      'tel:+966500000000',
      '//attacker.example/path',
      'https://user:secret@example.com/path',
    ]) {
      const invalid = paragraph('رابط');
      invalid.content![0].content![0].marks = [{ type: 'link', attrs: { href } }];
      expect(richTextDocumentSchema.safeParse(invalid).success, href).toBe(false);
    }
  });

  it('rejects unknown nodes, impossible nesting, unsupported headings, and duplicate marks', () => {
    expect(
      richTextDocumentSchema.safeParse({ type: 'doc', content: [{ type: 'image' }] }).success,
    ).toBe(false);
    expect(
      richTextDocumentSchema.safeParse({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'paragraph' }] }],
      }).success,
    ).toBe(false);
    expect(
      richTextDocumentSchema.safeParse({
        type: 'doc',
        content: [{ type: 'heading', attrs: { level: 1 }, content: [] }],
      }).success,
    ).toBe(false);
    expect(
      richTextDocumentSchema.safeParse({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'نص', marks: [{ type: 'bold' }, { type: 'bold' }] }],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('matches ProseMirror content cardinality for documents, containers, and text', () => {
    for (const invalid of [
      { type: 'doc' },
      { type: 'doc', content: [] },
      { type: 'doc', content: [{ type: 'bulletList', content: [] }] },
      { type: 'doc', content: [{ type: 'orderedList', content: [] }] },
      { type: 'doc', content: [{ type: 'blockquote', content: [] }] },
      {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }],
      },
    ]) {
      expect(richTextDocumentSchema.safeParse(invalid).success).toBe(false);
    }
    expect(
      richTextDocumentSchema.safeParse({
        type: 'doc',
        content: [{ type: 'paragraph', content: [] }],
      }).success,
    ).toBe(true);
  });

  it('caps nesting depth and requires alternative text for a cover image', () => {
    let child: Record<string, unknown> = { type: 'paragraph', content: [] };
    for (let index = 0; index < 22; index += 1) {
      child = { type: 'blockquote', content: [child] };
    }
    expect(richTextDocumentSchema.safeParse({ type: 'doc', content: [child] }).success).toBe(false);

    expect(
      createArticleSchema.safeParse({
        slug: 'cover-test',
        titleAr: 'غلاف',
        author: { type: 'custom', displayName: 'فريق مختلف' },
        coverUrl: 'https://cdn.example.com/cover.jpg',
        content: paragraph('محتوى'),
      }).success,
    ).toBe(false);
  });

  it('requires meaningful article content while accepting text or real media nodes', () => {
    const base = {
      slug: 'meaningful-content',
      titleAr: 'محتوى المقال',
      author: { type: 'custom' as const, displayName: 'فريق مختلف' },
    };
    const mediaId = 'med-0123456789abcdef0123456789abcdef';
    const secondMediaId = 'med-fedcba9876543210fedcba9876543210';
    const contents: RichTextDocument[] = [
      paragraph('نص فعلي'),
      {
        type: 'doc',
        content: [
          {
            type: 'imageBlock',
            attrs: { mediaId, alt: 'وصف الصورة', presentation: 'content' },
          },
        ],
      },
      {
        type: 'doc',
        content: [
          {
            type: 'imageGallery',
            attrs: {
              items: [
                { mediaId, alt: 'الصورة الأولى' },
                { mediaId: secondMediaId, alt: 'الصورة الثانية' },
              ],
            },
          },
        ],
      },
      {
        type: 'doc',
        content: [
          {
            type: 'videoEmbed',
            attrs: {
              provider: 'youtube',
              videoId: 'dQw4w9WgXcQ',
              title: 'عنوان الفيديو',
              posterMediaId: mediaId,
            },
          },
        ],
      },
    ];
    for (const [index, content] of contents.entries()) {
      expect(
        createArticleSchema.safeParse({ ...base, slug: `${base.slug}-${index}`, content }).success,
      ).toBe(true);
    }

    expect(
      createArticleSchema.safeParse({
        ...base,
        content: { type: 'doc', content: [{ type: 'paragraph', content: [] }] },
      }).success,
    ).toBe(false);
    expect(
      createArticleSchema.safeParse({
        ...base,
        content: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: '   ' }] }],
        },
      }).success,
    ).toBe(false);
    expect(
      updateArticleSchema.safeParse({
        expectedVersion: 1,
        content: { type: 'doc', content: [{ type: 'paragraph', content: [] }] },
      }).success,
    ).toBe(false);
    expect(
      createArticleSchema.safeParse({
        ...base,
        titleAr: '   ',
        content: paragraph('محتوى'),
      }).success,
    ).toBe(false);
  });

  it('enforces the strict top-level image-gallery atom contract', () => {
    const first = 'med-0123456789abcdef0123456789abcdef';
    const second = 'med-fedcba9876543210fedcba9876543210';
    const third = 'med-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const validItems = [
      { mediaId: first, alt: 'الصورة الأولى' },
      { mediaId: second, alt: 'الصورة الثانية' },
    ];

    for (const items of [validItems, [...validItems, { mediaId: third, alt: 'الصورة الثالثة' }]]) {
      expect(
        richTextDocumentSchema.safeParse({
          type: 'doc',
          content: [{ type: 'imageGallery', attrs: { items, caption: 'تعليق مشترك' } }],
        }).success,
      ).toBe(true);
    }

    const invalidGalleries = [
      { attrs: { items: validItems.slice(0, 1) } },
      { attrs: { items: [...validItems, { mediaId: third, alt: '٣' }, { mediaId: first, alt: '٤' }] } },
      { attrs: { items: [validItems[0], { mediaId: first, alt: 'مكرر' }] } },
      { attrs: { items: [{ mediaId: first, alt: '   ' }, validItems[1]] } },
      { attrs: { items: validItems, caption: '   ' } },
      { attrs: { items: validItems, style: 'display:none' } },
      { attrs: { items: validItems, alignment: 'center' } },
      { attrs: { items: validItems }, content: [] },
    ];
    for (const gallery of invalidGalleries) {
      expect(
        richTextDocumentSchema.safeParse({
          type: 'doc',
          content: [{ type: 'imageGallery', ...gallery }],
        }).success,
      ).toBe(false);
    }

    expect(
      richTextDocumentSchema.safeParse({
        type: 'doc',
        content: [{ type: 'blockquote', content: [{ type: 'imageGallery', attrs: { items: validItems } }] }],
      }).success,
    ).toBe(false);

    const exactlyThirty = [
      ...Array.from({ length: 27 }, () => ({
        type: 'imageBlock',
        attrs: { mediaId: first, alt: 'صورة', presentation: 'content' },
      })),
      {
        type: 'imageGallery',
        attrs: {
          items: [
            ...validItems,
            { mediaId: third, alt: 'الصورة الثالثة' },
          ],
        },
      },
    ];
    expect(richTextDocumentSchema.safeParse({ type: 'doc', content: exactlyThirty }).success).toBe(
      true,
    );
    expect(
      richTextDocumentSchema.safeParse({
        type: 'doc',
        content: [
          {
            type: 'imageBlock',
            attrs: { mediaId: first, alt: 'صورة إضافية', presentation: 'content' },
          },
          ...exactlyThirty,
        ],
      }).success,
    ).toBe(false);
  });

  it('normalizes custom author names and rejects multiline or directional controls', () => {
    const normalized = articleAuthorInputSchema.safeParse({
      type: 'custom',
      displayName: '  Cafe\u0301  ',
    });
    expect(normalized.success).toBe(true);
    if (normalized.success && normalized.data.type === 'custom') {
      expect(normalized.data.displayName).toBe('Café');
      expect(normalized.data.displayName).toBe(normalized.data.displayName.normalize('NFC'));
    }

    for (const displayName of [
      'أ',
      'اسم\nثان',
      'اسم\n',
      'اسم\u0007',
      'اسم\u2028ثان',
      'اسم\u202eمخفي',
      'x'.repeat(101),
    ]) {
      expect(
        articleAuthorInputSchema.safeParse({ type: 'custom', displayName }).success,
        JSON.stringify(displayName),
      ).toBe(false);
    }
  });

  it('accepts only the supported author placements and defaults stored articles', () => {
    const base = {
      slug: 'author-placement',
      titleAr: 'موضع الكاتب',
      author: { type: 'custom' as const, displayName: 'فريق مختلف' },
      content: paragraph('محتوى'),
    };
    expect(createArticleSchema.safeParse(base).success).toBe(true);
    for (const authorPlacement of ['after_title', 'end']) {
      expect(createArticleSchema.safeParse({ ...base, authorPlacement }).success).toBe(true);
    }
    expect(createArticleSchema.safeParse({ ...base, authorPlacement: 'sidebar' }).success).toBe(
      false,
    );
    expect(
      updateArticleSchema.safeParse({ expectedVersion: 1, authorPlacement: 'sidebar' }).success,
    ).toBe(false);

    const stored = createArticleRecord('art-placement', base, '2026-08-17T00:00:00Z');
    expect(stored.authorPlacement).toBe('after_title');
  });

  it('accepts safe text sections and rejects invalid layout or nesting', () => {
    expect(
      richTextDocumentSchema.safeParse({
        type: 'doc',
        content: [
          {
            type: 'textSection',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'نص افتراضي' }] }],
          },
          {
            type: 'textSection',
            attrs: {
              alignment: 'justify',
              direction: 'ltr',
              vertical: 'middle',
              height: 'medium',
            },
            content: [{ type: 'heading', attrs: { level: 2 }, content: [] }],
          },
        ],
      }).success,
    ).toBe(true);

    for (const invalid of [
      {
        type: 'doc',
        content: [
          {
            type: 'textSection',
            attrs: { vertical: 'middle', height: 'auto' },
            content: [{ type: 'paragraph', content: [] }],
          },
        ],
      },
      {
        type: 'doc',
        content: [
          {
            type: 'textSection',
            content: [
              {
                type: 'textSection',
                content: [{ type: 'paragraph', content: [] }],
              },
            ],
          },
        ],
      },
      {
        type: 'doc',
        content: [
          {
            type: 'textSection',
            content: [
              {
                type: 'imageBlock',
                attrs: {
                  mediaId: 'med-0123456789abcdef0123456789abcdef',
                  alt: 'صورة',
                  presentation: 'content',
                },
              },
            ],
          },
        ],
      },
      {
        type: 'doc',
        content: [
          {
            type: 'textSection',
            content: [
              {
                type: 'blockquote',
                content: [
                  {
                    type: 'textSection',
                    content: [{ type: 'paragraph', content: [] }],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        type: 'doc',
        content: [
          {
            type: 'textSection',
            content: [
              {
                type: 'blockquote',
                content: [
                  {
                    type: 'videoEmbed',
                    attrs: {
                      provider: 'youtube',
                      videoId: 'dQw4w9WgXcQ',
                      title: 'فيديو',
                      posterMediaId: 'med-0123456789abcdef0123456789abcdef',
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        type: 'doc',
        content: [{ type: 'paragraph', attrs: { direction: 'ltr' }, content: [] }],
      },
      {
        type: 'doc',
        content: [
          {
            type: 'textSection',
            attrs: { style: 'position:fixed', class: 'untrusted' },
            content: [{ type: 'paragraph', content: [] }],
          },
        ],
      },
      {
        type: 'doc',
        content: [
          {
            type: 'imageBlock',
            attrs: {
              mediaId: 'med-0123456789abcdef0123456789abcdef',
              alt: 'صورة',
              presentation: 'content',
              alignment: 'justify',
            },
          },
        ],
      },
    ]) {
      expect(richTextDocumentSchema.safeParse(invalid).success).toBe(false);
    }
  });
});

describe('rich-text rendering', () => {
  it('escapes text and defensively drops an unsafe href', () => {
    const document = paragraph('<img src=x onerror=alert(1)>');
    document.content![0].content![0].marks = [
      { type: 'link', attrs: { href: 'javascript:alert(1)' } },
    ];
    const html = renderRichText(document);
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('javascript:');
  });

  it('preserves ordered-list numbers and single line breaks in plain text', () => {
    const ordered: RichTextDocument = {
      type: 'doc',
      content: [
        {
          type: 'orderedList',
          attrs: { start: 3 },
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'أ' }] }],
            },
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'ب' }] }],
            },
          ],
        },
      ],
    };
    expect(richTextToPlainText(ordered)).toContain('3. أ');
    expect(richTextToPlainText(ordered)).toContain('4. ب');
    expect(richTextToPlainText(documentFromPlainText('سطر أول\nسطر ثان'))).toBe('سطر أول\nسطر ثان');
  });

  it('renders text-section layout safely for web and email without changing plain text', () => {
    const document: RichTextDocument = {
      type: 'doc',
      content: [
        {
          type: 'textSection',
          attrs: {
            alignment: 'end',
            direction: 'ltr',
            vertical: 'bottom',
            height: 'tall',
          },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Aligned text' }] }],
        },
      ],
    };

    const web = renderRichText(document);
    expect(web).toContain('data-article-text-section=""');
    expect(web).toContain('article-text-section--align-end');
    expect(web).toContain('article-text-section--height-tall');
    expect(web).toContain('data-alignment="end"');
    expect(web).toContain('dir="ltr"');
    expect(web).toContain('justify-content:flex-end');
    expect(web).toContain('min-height:320px');
    expect(web).toContain('text-align:end');

    const email = renderRichText(document, { mode: 'email' });
    expect(email).toContain('<table role="presentation"');
    expect(email).toContain('height="320"');
    expect(email).toContain('valign="bottom"');
    expect(email).toContain('align="right"');
    expect(email).toContain('text-align:right');
    expect(email).not.toContain('display:flex');

    expect(richTextToPlainText(document)).toBe('Aligned text');

    const defaults = renderRichText({
      type: 'doc',
      content: [
        {
          type: 'textSection',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'افتراضي' }] }],
        },
      ],
    });
    expect(defaults).toContain('data-alignment="start"');
    expect(defaults).toContain('data-direction="rtl"');
    expect(defaults).toContain('data-vertical="top"');
    expect(defaults).toContain('data-height="auto"');
    expect(defaults).toContain('justify-content:flex-start');
    expect(defaults).toContain('min-height:0px');

    const defaultEmail = renderRichText(
      {
        type: 'doc',
        content: [
          {
            type: 'textSection',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'افتراضي' }] }],
          },
        ],
      },
      { mode: 'email' },
    );
    expect(defaultEmail).toContain('valign="top"');
    expect(defaultEmail).toContain('align="right"');
    expect(defaultEmail).toContain('dir="rtl"');
    expect(defaultEmail).not.toContain(' height=');

    const defensiveFallback = renderRichText({
      type: 'doc',
      content: [
        {
          type: 'textSection',
          attrs: { vertical: 'middle', height: 'auto' },
          content: [{ type: 'paragraph', content: [] }],
        },
      ],
    });
    expect(defensiveFallback).toContain('data-vertical="top"');
    expect(defensiveFallback).toContain('justify-content:flex-start');
  });

  it('renders complete gallery images and one shared caption for web, email, and plain text', () => {
    const document: RichTextDocument = {
      type: 'doc',
      content: [
        {
          type: 'imageGallery',
          attrs: {
            items: [
              {
                mediaId: 'med-0123456789abcdef0123456789abcdef',
                alt: 'الصورة الأولى <آمنة>',
              },
              {
                mediaId: 'med-fedcba9876543210fedcba9876543210',
                alt: 'الصورة الثانية',
              },
              {
                mediaId: 'med-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                alt: 'الصورة الثالثة',
              },
            ],
            caption: 'تعليق <مشترك>',
          },
        },
      ],
    };

    const web = renderRichText(document, { mediaBaseUrl: 'https://media.example.com' });
    expect(web).toContain('data-media-kind="image-gallery"');
    expect(web).toContain('data-image-count="3"');
    expect(web).toContain('display:flex;flex-wrap:wrap');
    expect(web.match(/flex:1 1 180px;min-width:0/g)).toHaveLength(3);
    expect(web.match(/<img /g)).toHaveLength(3);
    expect(web.match(/width:100%;height:auto/g)).toHaveLength(3);
    expect(web).not.toContain('object-fit');
    expect(web).not.toContain('<آمنة>');
    expect(web).toContain('alt="الصورة الأولى &lt;آمنة&gt;"');
    expect(web.indexOf('<figcaption>')).toBeGreaterThan(web.indexOf('</div>'));

    const email = renderRichText(document, {
      mode: 'email',
      mediaBaseUrl: 'https://media.example.com',
    });
    expect(email).toContain('<table role="presentation"');
    expect(email).toContain('table-layout:fixed');
    expect(email.match(/<td width="33\.3333%"/g)).toHaveLength(3);
    expect(email.match(/width:100%;max-width:200px;height:auto/g)).toHaveLength(3);
    expect(email).not.toContain('object-fit');
    expect(email.indexOf('تعليق &lt;مشترك&gt;')).toBeGreaterThan(email.indexOf('</table>'));

    const expectedText =
      'الصورة الأولى <آمنة>\nالصورة الثانية\nالصورة الثالثة\nتعليق <مشترك>';
    expect(richTextToPlainText(document)).toBe(expectedText);
    expect(richTextToEmailPlainText(document, 'https://mukhtalif.net')).toBe(expectedText);
  });

  it('canonicalizes every gallery asset while preserving placement copy and references', async () => {
    const first = 'med-0123456789abcdef0123456789abcdef';
    const second = 'med-fedcba9876543210fedcba9876543210';
    const getAsset = vi.fn(async (id: string) => ({ id, status: 'ready' as const }));
    const document: RichTextDocument = {
      type: 'doc',
      content: [
        {
          type: 'imageGallery',
          attrs: {
            items: [
              { mediaId: first, alt: 'وصف موضعي أول' },
              { mediaId: second, alt: 'وصف موضعي ثان' },
            ],
            caption: 'تعليق موضعي مشترك',
          },
        },
      ],
    };

    const canonical = await canonicalizeRichTextMedia(document, getAsset);
    expect(getAsset).toHaveBeenNthCalledWith(1, first);
    expect(getAsset).toHaveBeenNthCalledWith(2, second);
    expect(canonical.content?.[0]).toEqual(document.content?.[0]);
    expect(canonical.content?.[0]).not.toHaveProperty('content');
    expect(richTextReferencesMedia(canonical, first)).toBe(true);
    expect(richTextReferencesMedia(canonical, second)).toBe(true);
    expect(
      richTextReferencesMedia(canonical, 'med-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
    ).toBe(false);

    await expect(
      canonicalizeRichTextMedia(document, async (id) => ({
        id,
        status: id === second ? 'pending' : 'ready',
      })),
    ).rejects.toMatchObject({ code: 'MEDIA_ASSET_NOT_READY' });
  });

  it('preserves text sections without treating them as media during canonicalization', async () => {
    const getAsset = vi.fn();
    const canonical = await canonicalizeRichTextMedia(
      {
        type: 'doc',
        content: [
          {
            type: 'textSection',
            attrs: {
              alignment: 'justify',
              direction: 'rtl',
              vertical: 'top',
              height: 'short',
            },
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'نص' }] }],
          },
        ],
      },
      getAsset,
    );

    expect(getAsset).not.toHaveBeenCalled();
    expect(canonical.content?.[0]).toMatchObject({
      type: 'textSection',
      attrs: {
        alignment: 'justify',
        direction: 'rtl',
        vertical: 'top',
        height: 'short',
      },
    });
    expect(richTextToPlainText(canonical)).toBe('نص');
  });
});

describe('newsletter and public projection', () => {
  function article(): Article {
    const content = paragraph('اقرأ التفاصيل');
    content.content![0].content![0].marks = [{ type: 'link', attrs: { href: '/inside' } }];
    const value = createArticleRecord(
      'art-test',
      {
        slug: 'weekly',
        titleAr: 'رسالة الأسبوع',
        author: { type: 'custom', displayName: 'فريق مختلف' },
        content,
        newsletter: { enabled: true, subject: 'موضوع الأسبوع', preheader: 'تمهيد الرسالة' },
      },
      '2026-08-17T00:00:00Z',
    );
    value.newsletter.campaignId = 'mc-secret-internal-id';
    return value;
  }

  it('includes preheader and compliance tags in HTML and plain text', () => {
    const preview = renderNewsletter(article(), 'https://mukhtalif.net');
    expect(preview.html).toContain('تمهيد الرسالة');
    expect(preview.html).toContain('*|UNSUB|*');
    expect(preview.html).toContain('*|UPDATE_PROFILE|*');
    expect(preview.html).toContain('*|LIST:ADDRESSLINE|*');
    expect(preview.text).toContain('*|UNSUB|*');
    expect(preview.text).toContain('*|LIST:ADDRESSLINE|*');
    expect(preview.text).toContain('اقرأ التفاصيل (https://mukhtalif.net/inside)');
    expect(preview.html).toContain('href="https://mukhtalif.net/inside"');
    expect(preview.html).toContain(
      'بقلم <span dir="auto" style="unicode-bidi:isolate">فريق مختلف</span>',
    );
    expect(preview.text).toContain('بقلم فريق مختلف');
    expect(preview.html.indexOf('<h1')).toBeLessThan(preview.html.indexOf('بقلم <span'));
    expect(preview.html.indexOf('بقلم <span')).toBeLessThan(preview.html.indexOf('اقرأ التفاصيل'));
    expect(preview.text.indexOf('رسالة الأسبوع')).toBeLessThan(
      preview.text.indexOf('بقلم فريق مختلف'),
    );
    expect(preview.text.indexOf('بقلم فريق مختلف')).toBeLessThan(
      preview.text.indexOf('اقرأ التفاصيل'),
    );

    const latinAuthor = article();
    latinAuthor.author = { type: 'custom', displayName: 'Alice Smith' };
    expect(renderNewsletter(latinAuthor).html).toContain(
      'بقلم <span dir="auto" style="unicode-bidi:isolate">Alice Smith</span>',
    );
  });

  it('moves the byline to the end of newsletter HTML and plain text', () => {
    const value = article();
    value.authorPlacement = 'end';
    const preview = renderNewsletter(value, 'https://mukhtalif.net');
    const bylineHtml = 'بقلم <span dir="auto" style="unicode-bidi:isolate">فريق مختلف</span>';

    expect(preview.html.split(bylineHtml)).toHaveLength(2);
    expect(preview.html.indexOf('اقرأ التفاصيل')).toBeLessThan(preview.html.indexOf(bylineHtml));
    expect(preview.html.indexOf(bylineHtml)).toBeLessThan(
      preview.html.indexOf('اقرأ المقال على موقع مختلف'),
    );
    expect(preview.text.indexOf('اقرأ التفاصيل')).toBeLessThan(
      preview.text.indexOf('بقلم فريق مختلف'),
    );
    expect(preview.text.indexOf('بقلم فريق مختلف')).toBeLessThan(
      preview.text.indexOf('https://mukhtalif.net/articles/weekly'),
    );
  });

  it('keeps text-section direction and vertical alignment in the Mailchimp preview', () => {
    const value = article();
    value.content = {
      type: 'doc',
      content: [
        {
          type: 'textSection',
          attrs: {
            alignment: 'start',
            direction: 'ltr',
            vertical: 'middle',
            height: 'short',
          },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'English summary' }] }],
        },
      ],
    };

    const preview = renderNewsletter(value, 'https://mukhtalif.net');
    expect(preview.html).toContain('<table role="presentation" width="100%"');
    expect(preview.html).toContain('height="120"');
    expect(preview.html).toContain('valign="middle"');
    expect(preview.html).toContain('align="left"');
    expect(preview.html).toContain('dir="ltr"');
    expect(preview.text).toContain('English summary');
  });

  it('removes canonical source and every newsletter field from public output', () => {
    const value = article();
    value.author = {
      type: 'studio_member',
      studioMemberId: 'usr-editor-1',
      displayName: 'محرر مختلف',
    };
    const projection = toPublishedArticle(value);
    const serialized = JSON.stringify(projection);
    expect(projection.author).toEqual({ displayName: 'محرر مختلف' });
    expect(projection.authorPlacement).toBe('after_title');
    expect(serialized).not.toContain('usr-editor-1');
    expect(serialized).not.toContain('studio_member');
    expect(serialized).not.toContain('mc-secret-internal-id');
    expect(serialized).not.toContain('newsletter');
    expect(serialized).not.toContain('"content"');
  });
});
