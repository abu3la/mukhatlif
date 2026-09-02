import { describe, expect, it } from 'vitest';
import { AI_ARTICLE_TEMPLATE, AiArticleImportError, parseAiArticleDraft } from './article-ai-import';

const validDraft = {
  schema: 'mukhtalif.article-ai/v1',
  title: 'كيف نختار فكرة المقال',
  slug: 'choosing-an-article-idea',
  excerpt: 'دليل مختصر لاختيار فكرة تستحق الكتابة.',
  seo: {
    title: 'اختيار فكرة المقال',
    description: 'خطوات عملية لاختيار فكرة مقال واضحة ومفيدة.',
  },
  blocks: [
    { type: 'paragraph', text: 'ابدأ من سؤال حقيقي لدى القارئ.' },
    { type: 'heading', level: 2, text: 'حدّد القيمة' },
    { type: 'bullets', items: ['اعرف القارئ', 'تحقق من المصادر'] },
    { type: 'ordered_list', items: ['اجمع المادة', 'اكتب المسودة'] },
    { type: 'quote', text: 'المقال الجيد يجيب عن سؤال واضح.' },
  ],
};

describe('parseAiArticleDraft', () => {
  it('converts the small AI contract into a validated editor document', () => {
    const draft = parseAiArticleDraft(JSON.stringify(validDraft));

    expect(draft).toMatchObject({
      title: validDraft.title,
      slug: validDraft.slug,
      excerpt: validDraft.excerpt,
      seoTitle: validDraft.seo.title,
      seoDescription: validDraft.seo.description,
    });
    expect(draft.document).toMatchObject({
      type: 'doc',
      content: [
        { type: 'paragraph' },
        { type: 'heading', attrs: { level: 2 } },
        { type: 'bulletList' },
        { type: 'orderedList' },
        { type: 'blockquote' },
      ],
    });
    expect(draft.text).toContain('اعرف القارئ');
    expect(draft.text).toContain('المقال الجيد يجيب عن سؤال واضح.');
  });

  it('accepts a JSON fence but rejects a different or unsafe contract', () => {
    const fenced = `\`\`\`json\n${JSON.stringify(validDraft)}\n\`\`\``;
    expect(parseAiArticleDraft(fenced).title).toBe(validDraft.title);

    expect(() =>
      parseAiArticleDraft(
        JSON.stringify({
          ...validDraft,
          schema: 'some-other-contract',
        }),
      ),
    ).toThrow(AiArticleImportError);
    expect(() =>
      parseAiArticleDraft(
        JSON.stringify({
          ...validDraft,
          blocks: [{ type: 'image', url: 'https://example.com/cover.jpg' }],
        }),
      ),
    ).toThrow('غير مدعوم');
  });

  it('requires an English URL slug and usable content', () => {
    expect(() =>
      parseAiArticleDraft(
        JSON.stringify({
          ...validDraft,
          slug: 'معرف-عربي',
        }),
      ),
    ).toThrow('المعرّف');

    expect(() =>
      parseAiArticleDraft(
        JSON.stringify({
          ...validDraft,
          blocks: [],
        }),
      ),
    ).toThrow('blocks');
  });
});

describe('AI_ARTICLE_TEMPLATE', () => {
  it('asks for the exact draft-only contract', () => {
    expect(AI_ARTICLE_TEMPLATE).toContain('mukhtalif.article-ai/v1');
    expect(AI_ARTICLE_TEMPLATE).toContain('لا تضف صورًا أو روابطًا أو HTML');
    expect(AI_ARTICLE_TEMPLATE).toContain('أوامر نشر أو إرسال بريد');
  });
});
