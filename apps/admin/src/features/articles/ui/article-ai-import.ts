import type { JSONContent } from '@tiptap/react';
import { richTextDocumentSchema } from '@mukhtalif/validation';
import { normalizeArticleDocument } from './rich-text-editor';

const AI_ARTICLE_SCHEMA = 'mukhtalif.article-ai/v1';
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_BLOCKS = 400;
const MAX_LIST_ITEMS = 100;

export interface AiArticleDraft {
  readonly title: string;
  readonly slug: string;
  readonly excerpt?: string;
  readonly seoTitle?: string;
  readonly seoDescription?: string;
  readonly document: JSONContent;
  readonly text: string;
}

type AiArticleBlock =
  | { readonly type: 'paragraph'; readonly text: string }
  | { readonly type: 'heading'; readonly level: 2 | 3; readonly text: string }
  | { readonly type: 'bullets' | 'ordered_list'; readonly items: readonly string[] }
  | { readonly type: 'quote'; readonly text: string };

export const AI_ARTICLE_TEMPLATE = `أنت مساعد تحرير لمجلة مختلف. أنشئ مسودة مقال عربية دقيقة ومفيدة قابلة للمراجعة البشرية.

الموضوع: [اكتب موضوع المقال]
القارئ المقصود: [اكتب الجمهور]
المصادر أو النقاط المعتمدة: [ألصقها هنا]

أعد JSON فقط، من دون أي شرح أو كتلة كود أو HTML، وبالعقد التالي تمامًا:
{
  "schema": "${AI_ARTICLE_SCHEMA}",
  "title": "عنوان عربي واضح",
  "slug": "english-url-slug",
  "excerpt": "ملخص قصير للمقال",
  "seo": {
    "title": "عنوان بحث مختصر",
    "description": "وصف بحث مختصر"
  },
  "blocks": [
    { "type": "paragraph", "text": "افتتاحية المقال." },
    { "type": "heading", "level": 2, "text": "عنوان فرعي" },
    { "type": "paragraph", "text": "فقرة تشرح الفكرة." },
    { "type": "bullets", "items": ["نقطة أولى", "نقطة ثانية"] },
    { "type": "quote", "text": "اقتباس قصير عند الحاجة." }
  ]
}

القيود:
- استخدم العربية السليمة، وتحقق من كل ادعاء من المصادر المرفقة.
- المعرّف slug بحروف إنجليزية صغيرة وأرقام وشرطات فقط.
- الأنواع المسموح بها داخل blocks هي paragraph وheading وbullets وordered_list وquote فقط.
- لا تضف صورًا أو روابطًا أو HTML أو أوامر نشر أو إرسال بريد.`;

export class AiArticleImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiArticleImportError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanPastedJson(value: string): string {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

function readRequiredText(value: unknown, label: string, maximum: number): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AiArticleImportError(`أضف ${label} في ناتج AI.`);
  }
  const text = value.trim();
  if (text.length > maximum) {
    throw new AiArticleImportError(`${label} أطول من الحد المسموح.`);
  }
  return text;
}

function readOptionalText(value: unknown, label: string, maximum: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return readRequiredText(value, label, maximum);
}

function inlineContent(text: string): JSONContent[] {
  return text.split(/\r?\n/).flatMap((line, index, lines) => {
    const nodes: JSONContent[] = [];
    if (line) nodes.push({ type: 'text', text: line });
    if (index < lines.length - 1) nodes.push({ type: 'hardBreak' });
    return nodes;
  });
}

function paragraph(text: string): JSONContent {
  return { type: 'paragraph', content: inlineContent(text) };
}

function readBlock(value: unknown, index: number): AiArticleBlock {
  if (!isRecord(value) || typeof value.type !== 'string') {
    throw new AiArticleImportError(`راجع البند ${index + 1} في blocks.`);
  }

  switch (value.type) {
    case 'paragraph':
      return {
        type: 'paragraph',
        text: readRequiredText(value.text, `نص الفقرة رقم ${index + 1}`, 15_000),
      };
    case 'heading': {
      const level = value.level;
      if (level !== 2 && level !== 3) {
        throw new AiArticleImportError(`اختر المستوى 2 أو 3 للعنوان رقم ${index + 1}.`);
      }
      return {
        type: 'heading',
        level,
        text: readRequiredText(value.text, `نص العنوان رقم ${index + 1}`, 240),
      };
    }
    case 'bullets':
    case 'ordered_list': {
      if (!Array.isArray(value.items) || value.items.length === 0) {
        throw new AiArticleImportError(`أضف عناصر القائمة رقم ${index + 1}.`);
      }
      if (value.items.length > MAX_LIST_ITEMS) {
        throw new AiArticleImportError(`القائمة رقم ${index + 1} طويلة جدًا.`);
      }
      return {
        type: value.type,
        items: value.items.map((item, itemIndex) =>
          readRequiredText(item, `العنصر ${itemIndex + 1} في القائمة رقم ${index + 1}`, 4_000),
        ),
      };
    }
    case 'quote':
      return {
        type: 'quote',
        text: readRequiredText(value.text, `نص الاقتباس رقم ${index + 1}`, 5_000),
      };
    default:
      throw new AiArticleImportError(`نوع البند «${value.type}» غير مدعوم.`);
  }
}

function documentFromBlocks(blocks: readonly AiArticleBlock[]): JSONContent {
  return {
    type: 'doc',
    content: blocks.map((block) => {
      switch (block.type) {
        case 'paragraph':
          return paragraph(block.text);
        case 'heading':
          return {
            type: 'heading',
            attrs: { level: block.level },
            content: inlineContent(block.text),
          };
        case 'bullets':
        case 'ordered_list':
          return {
            type: block.type === 'bullets' ? 'bulletList' : 'orderedList',
            content: block.items.map((item) => ({
              type: 'listItem',
              content: [paragraph(item)],
            })),
          };
        case 'quote':
          return { type: 'blockquote', content: [paragraph(block.text)] };
      }
    }),
  };
}

function plainText(blocks: readonly AiArticleBlock[]): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case 'bullets':
        case 'ordered_list':
          return block.items.join('\n');
        case 'paragraph':
        case 'heading':
        case 'quote':
          return block.text;
      }
    })
    .join('\n\n');
}

/**
 * Parses the deliberately small AI contract into the same validated document
 * structure that the publishing API accepts. Raw HTML, media and permissions
 * never cross this boundary.
 */
export function parseAiArticleDraft(input: string): AiArticleDraft {
  if (!input.trim()) throw new AiArticleImportError('الصق ناتج JSON من مساعدك أولًا.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleanPastedJson(input));
  } catch {
    throw new AiArticleImportError('الصيغة غير مقروءة. الصق JSON فقط من دون شرح إضافي.');
  }

  if (!isRecord(parsed) || parsed.schema !== AI_ARTICLE_SCHEMA) {
    throw new AiArticleImportError('استخدم قالب مختلف الرسمي ثم الصق الناتج كاملًا.');
  }

  const title = readRequiredText(parsed.title, 'عنوان المقال', 180);
  const slug = readRequiredText(parsed.slug, 'المعرّف في الرابط', 180).toLowerCase();
  if (!SLUG_PATTERN.test(slug)) {
    throw new AiArticleImportError('اكتب المعرّف بحروف إنجليزية صغيرة وأرقام وشرطات فقط.');
  }

  const excerpt = readOptionalText(parsed.excerpt, 'ملخص المقال', 500);
  let seoTitle: string | undefined;
  let seoDescription: string | undefined;
  if (parsed.seo !== undefined && parsed.seo !== null) {
    if (!isRecord(parsed.seo)) throw new AiArticleImportError('راجع بيانات البحث seo في ناتج AI.');
    seoTitle = readOptionalText(parsed.seo.title, 'عنوان البحث', 70);
    seoDescription = readOptionalText(parsed.seo.description, 'وصف البحث', 170);
  }

  if (!Array.isArray(parsed.blocks) || parsed.blocks.length === 0) {
    throw new AiArticleImportError('أضف محتوى المقال داخل blocks.');
  }
  if (parsed.blocks.length > MAX_BLOCKS) {
    throw new AiArticleImportError('عدد أقسام المقال كبير جدًا. قسّمه إلى مسودات أصغر.');
  }

  const blocks = parsed.blocks.map(readBlock);
  const normalizedDocument = normalizeArticleDocument(documentFromBlocks(blocks));
  const validatedDocument = richTextDocumentSchema.safeParse(normalizedDocument);
  if (!validatedDocument.success) {
    throw new AiArticleImportError('تعذّر اعتماد بنية المقال. راجع ناتج AI ثم حاول مرة أخرى.');
  }

  return {
    title,
    slug,
    excerpt,
    seoTitle,
    seoDescription,
    document: validatedDocument.data as JSONContent,
    text: plainText(blocks),
  };
}

/** Copies the provider-agnostic prompt with a browser fallback for restricted contexts. */
export async function copyAiArticleTemplate(): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(AI_ARTICLE_TEMPLATE);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = AI_ARTICLE_TEMPLATE;
  textarea.setAttribute('readonly', '');
  textarea.setAttribute('aria-hidden', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  document.body.appendChild(textarea);
  textarea.select();

  try {
    if (!document.execCommand('copy')) throw new Error('Clipboard copy was rejected.');
  } finally {
    textarea.remove();
  }
}
