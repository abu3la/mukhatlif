import { z } from 'zod';
import {
  ARTICLE_AD_FORMATS,
  ARTICLE_AUTHOR_PLACEMENTS,
  ARTICLE_AUTHOR_TYPES,
  ARTICLE_IMAGE_PRESENTATIONS,
  ARTICLE_IMAGE_RADII,
  ARTICLE_STATUSES,
  ARTICLE_TEXT_ALIGNMENTS,
  ARTICLE_TEXT_DIRECTIONS,
  ARTICLE_TEXT_SECTION_HEIGHTS,
  ARTICLE_TEXT_VERTICAL_ALIGNMENTS,
  RICH_TEXT_MARK_TYPES,
  RICH_TEXT_NODE_TYPES,
  type ArticleAdBlockAttributes,
  type ArticleAdFormat,
  type ArticleImageGalleryAttributes,
  type ArticleImageGalleryItem,
  type ArticleImagePresentation,
  type ArticleImageRadius,
  type ArticleTextAlignment,
  type ArticleTextDirection,
  type ArticleTextSectionHeight,
  type ArticleTextVerticalAlignment,
  type RichTextDocument,
} from '@mukhtalif/types';
import { slugSchema } from './show';
import { mediaAssetIdSchema } from './media';

const optionalTrimmedString = (maximum: number) => z.string().trim().min(1).max(maximum).optional();

const nullableOptionalTrimmedString = (maximum: number) =>
  z.string().trim().min(1).max(maximum).nullable().optional();

export const articleImageGalleryItemSchema: z.ZodType<ArticleImageGalleryItem> = z
  .object({
    mediaId: mediaAssetIdSchema,
    alt: z.string().trim().min(1).max(500),
  })
  .strict();

const articleImageGalleryItemsSchema = z
  .array(articleImageGalleryItemSchema)
  .min(2)
  .max(3)
  .superRefine((items, context) => {
    if (new Set(items.map((item) => item.mediaId)).size !== items.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Image galleries cannot repeat an asset',
      });
    }
  });

export const articleImageGalleryAttributesSchema: z.ZodType<ArticleImageGalleryAttributes> = z
  .object({
    items: articleImageGalleryItemsSchema,
    caption: z.string().trim().min(1).max(1_000).optional(),
  })
  .strict();

const articleAuthorControlCharacterPattern = /[\p{Cc}\p{Zl}\p{Zp}]/u;
const articleAuthorBidiControlPattern = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;

export const articleAdPlacementIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Ad placement identifiers accept lowercase letters, numbers, and single hyphens only',
  );

const articleAdLabelSchema = z
  .string()
  .refine(
    (value) => !articleAuthorControlCharacterPattern.test(value),
    'Ad labels must be a single line without control characters',
  )
  .refine(
    (value) => !articleAuthorBidiControlPattern.test(value),
    'Ad labels cannot contain bidirectional control characters',
  )
  .transform((value) => value.trim().normalize('NFC'))
  .pipe(z.string().min(1).max(80));

export const articleAdBlockAttributesSchema: z.ZodType<ArticleAdBlockAttributes> = z
  .object({
    placementId: articleAdPlacementIdSchema,
    format: z.enum(ARTICLE_AD_FORMATS),
    label: articleAdLabelSchema.optional(),
  })
  .strict();

export const articleAuthorDisplayNameSchema = z
  .string()
  .refine(
    (value) => !articleAuthorControlCharacterPattern.test(value),
    'Author name must be a single line without control characters',
  )
  .refine(
    (value) => !articleAuthorBidiControlPattern.test(value),
    'Author name cannot contain bidirectional control characters',
  )
  .transform((value) => value.trim().normalize('NFC'))
  .pipe(z.string().min(2).max(100));

/** Returns the canonical byline, or null for unusable legacy member names. */
export function normalizeArticleAuthorDisplayName(value: string): string | null {
  const parsed = articleAuthorDisplayNameSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * The member variant deliberately accepts only the immutable Studio member ID.
 * Its display name is resolved and snapshotted by the API.
 */
export const articleAuthorInputSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal(ARTICLE_AUTHOR_TYPES[0]),
      studioMemberId: z.string().trim().min(1).max(120),
    })
    .strict(),
  z
    .object({
      type: z.literal(ARTICLE_AUTHOR_TYPES[1]),
      displayName: articleAuthorDisplayNameSchema,
    })
    .strict(),
]);
export type ArticleAuthorInput = z.infer<typeof articleAuthorInputSchema>;

export const articleAuthorPlacementSchema = z.enum(ARTICLE_AUTHOR_PLACEMENTS);

const httpUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine((input) => {
    try {
      const url = new URL(input);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
    } catch {
      return false;
    }
  }, 'URL must be an absolute HTTP(S) URL without credentials');

const safeLinkSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine((href) => {
    if ((href.startsWith('/') && !href.startsWith('//')) || href.startsWith('#')) return true;
    try {
      const url = new URL(href);
      return ['https:', 'mailto:'].includes(url.protocol) && !url.username && !url.password;
    } catch {
      return false;
    }
  }, 'Link must be HTTPS, mail, anchor, or site-relative');

export const articleImageLinkSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine(
    (href) =>
      !articleAuthorControlCharacterPattern.test(href) &&
      !articleAuthorBidiControlPattern.test(href),
    'Image link cannot contain control characters',
  )
  .refine((href) => {
    if (href.startsWith('/') && !href.startsWith('//')) return true;
    try {
      const url = new URL(href);
      return url.protocol === 'https:' && !url.username && !url.password;
    } catch {
      return false;
    }
  }, 'Image link must be HTTPS or site-relative');

export const richTextMarkSchema = z
  .object({
    type: z.enum(RICH_TEXT_MARK_TYPES),
    attrs: z
      .object({
        href: safeLinkSchema.optional(),
        target: z.union([z.literal('_blank'), z.null()]).optional(),
        rel: z
          .string()
          .trim()
          .regex(/^(?:(?:noopener|noreferrer|nofollow|sponsored|ugc)(?:\s+|$))+$/)
          .max(100)
          .nullable()
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((mark, context) => {
    if (mark.type === 'link' && !mark.attrs?.href) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Link marks require an href' });
    }
    if (mark.type !== 'link' && mark.attrs) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${mark.type} marks cannot have attributes`,
      });
    }
  });

type RichTextNodeInput = {
  type: (typeof RICH_TEXT_NODE_TYPES)[number];
  attrs?: {
    level?: 2 | 3;
    start?: number;
    type?: string | null;
    mediaId?: string;
    posterMediaId?: string;
    items?: ArticleImageGalleryItem[];
    alt?: string;
    caption?: string;
    linkUrl?: string;
    presentation?: ArticleImagePresentation;
    alignment?: ArticleTextAlignment;
    radius?: ArticleImageRadius;
    direction?: ArticleTextDirection;
    vertical?: ArticleTextVerticalAlignment;
    height?: ArticleTextSectionHeight;
    provider?: 'youtube' | 'vimeo';
    videoId?: string;
    title?: string;
    placementId?: string;
    format?: ArticleAdFormat;
    label?: string;
  };
  marks?: z.infer<typeof richTextMarkSchema>[];
  text?: string;
  content?: RichTextNodeInput[];
};

export const richTextNodeSchema: z.ZodType<RichTextNodeInput> = z.lazy(() =>
  z
    .object({
      type: z.enum(RICH_TEXT_NODE_TYPES),
      attrs: z
        .object({
          level: z.union([z.literal(2), z.literal(3)]).optional(),
          start: z.number().int().min(1).max(1_000_000).optional(),
          type: z.string().trim().max(20).nullable().optional(),
          mediaId: mediaAssetIdSchema.optional(),
          posterMediaId: mediaAssetIdSchema.optional(),
          items: articleImageGalleryItemsSchema.optional(),
          alt: z.string().trim().min(1).max(500).optional(),
          caption: z.string().trim().min(1).max(1_000).optional(),
          linkUrl: articleImageLinkSchema.optional(),
          presentation: z.enum(ARTICLE_IMAGE_PRESENTATIONS).optional(),
          alignment: z.enum(ARTICLE_TEXT_ALIGNMENTS).optional(),
          radius: z.enum(ARTICLE_IMAGE_RADII).optional(),
          direction: z.enum(ARTICLE_TEXT_DIRECTIONS).optional(),
          vertical: z.enum(ARTICLE_TEXT_VERTICAL_ALIGNMENTS).optional(),
          height: z.enum(ARTICLE_TEXT_SECTION_HEIGHTS).optional(),
          provider: z.enum(['youtube', 'vimeo']).optional(),
          videoId: z.string().trim().min(1).max(32).optional(),
          title: z.string().trim().min(1).max(240).optional(),
          placementId: articleAdPlacementIdSchema.optional(),
          format: z.enum(ARTICLE_AD_FORMATS).optional(),
          label: articleAdLabelSchema.optional(),
        })
        .strict()
        .optional(),
      marks: z.array(richTextMarkSchema).max(8).optional(),
      text: z.string().min(1).max(100_000).optional(),
      content: z.array(richTextNodeSchema).max(2_000).optional(),
    })
    .strict()
    .superRefine((node, context) => {
      if (node.type === 'text') {
        if (node.text === undefined) {
          context.addIssue({ code: z.ZodIssueCode.custom, message: 'Text nodes require text' });
        }
        if (node.content) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Text nodes cannot have content',
          });
        }
        const markTypes = node.marks?.map((mark) => mark.type) ?? [];
        if (new Set(markTypes).size !== markTypes.length) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Text nodes cannot repeat a mark type',
          });
        }
      } else {
        if (node.text !== undefined || node.marks) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Only text nodes can have text or marks',
          });
        }
      }

      if (node.type === 'heading' && !node.attrs?.level) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: 'Headings require a level' });
      }
      if (node.type !== 'heading' && node.attrs?.level !== undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Only headings can have a level',
        });
      }
      if (node.type !== 'orderedList' && node.attrs?.start !== undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Only ordered lists can set a starting number',
        });
      }
      if (node.type !== 'orderedList' && node.attrs?.type !== undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Only ordered lists can set a marker type',
        });
      }

      const mediaAttributes = [
        'mediaId',
        'posterMediaId',
        'items',
        'alt',
        'caption',
        'linkUrl',
        'presentation',
        'radius',
        'provider',
        'videoId',
        'title',
      ] as const;
      const hasMediaAttributes = mediaAttributes.some(
        (attribute) => node.attrs?.[attribute] !== undefined,
      );
      if (!['imageBlock', 'imageGallery', 'videoEmbed'].includes(node.type) && hasMediaAttributes) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Only media nodes can set media attributes',
        });
      }
      if (
        node.attrs?.alignment !== undefined &&
        !['imageBlock', 'textSection'].includes(node.type)
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Only image and text-section nodes can set alignment',
        });
      }
      const hasTextSectionAttributes =
        node.attrs?.direction !== undefined ||
        node.attrs?.vertical !== undefined ||
        node.attrs?.height !== undefined;
      if (node.type !== 'textSection' && hasTextSectionAttributes) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Only text-section nodes can set text layout attributes',
        });
      }
      const hasAdAttributes =
        node.attrs?.placementId !== undefined ||
        node.attrs?.format !== undefined ||
        node.attrs?.label !== undefined;
      if (node.type !== 'adBlock' && hasAdAttributes) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Only ad blocks can set ad placement attributes',
        });
      }
      if (node.type === 'imageBlock') {
        if (!node.attrs?.mediaId || !node.attrs.alt || !node.attrs.presentation) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Image blocks require an asset, alternative text, and presentation',
          });
        }
        if (
          node.attrs?.posterMediaId ||
          node.attrs?.items ||
          node.attrs?.provider ||
          node.attrs?.videoId ||
          node.attrs?.title ||
          node.attrs?.alignment === 'justify'
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Image blocks cannot set video attributes or justified alignment',
          });
        }
      }
      if (node.type === 'imageGallery') {
        if (!node.attrs?.items) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Image galleries require two or three images',
          });
        }
        const unsupportedAttributes = Object.keys(node.attrs ?? {}).filter(
          (attribute) => !['items', 'caption'].includes(attribute),
        );
        if (unsupportedAttributes.length > 0) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Image galleries accept only items and a shared caption',
          });
        }
      }
      if (node.type === 'videoEmbed') {
        if (
          !node.attrs?.provider ||
          !node.attrs.videoId ||
          !node.attrs.title ||
          !node.attrs.posterMediaId
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Video embeds require a provider, video identifier, title, and poster',
          });
        }
        const validVideoId =
          node.attrs?.provider === 'youtube'
            ? /^[A-Za-z0-9_-]{11}$/.test(node.attrs.videoId ?? '')
            : /^\d{6,12}$/.test(node.attrs?.videoId ?? '');
        if (node.attrs?.provider && !validVideoId) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Video identifier does not match its provider',
          });
        }
        if (
          node.attrs?.mediaId ||
          node.attrs?.items ||
          node.attrs?.alt ||
          node.attrs?.linkUrl ||
          node.attrs?.presentation ||
          node.attrs?.alignment ||
          node.attrs?.radius
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Video embeds cannot set image attributes',
          });
        }
      }
      if (node.type === 'textSection') {
        const vertical = node.attrs?.vertical ?? 'top';
        const height = node.attrs?.height ?? 'auto';
        if (vertical !== 'top' && height === 'auto') {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Middle or bottom alignment requires a fixed text-section height',
          });
        }
      }
      if (node.type === 'adBlock') {
        const parsed = articleAdBlockAttributesSchema.safeParse(node.attrs);
        if (!parsed.success) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Ad blocks require a safe internal placement, format, and optional label',
          });
        }
        const unsupportedAttributes = Object.keys(node.attrs ?? {}).filter(
          (attribute) => !['placementId', 'format', 'label'].includes(attribute),
        );
        if (unsupportedAttributes.length > 0) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Ad blocks accept only an internal placement, format, and label',
          });
        }
      }
    }),
);

function countDocument(document: RichTextNodeInput): {
  depth: number;
  nodes: number;
  textCharacters: number;
} {
  let depth = 0;
  let nodes = 0;
  let textCharacters = 0;

  const visit = (node: RichTextNodeInput, currentDepth: number) => {
    nodes += 1;
    depth = Math.max(depth, currentDepth);
    textCharacters += node.text?.length ?? 0;
    node.content?.forEach((child) => visit(child, currentDepth + 1));
  };
  visit(document, 1);
  return { depth, nodes, textCharacters };
}

export const richTextDocumentSchema: z.ZodType<RichTextDocument> = richTextNodeSchema
  .refine((node) => node.type === 'doc', 'The root node must be a document')
  .superRefine((document, context) => {
    const blockChildren = new Set([
      'paragraph',
      'heading',
      'bulletList',
      'orderedList',
      'blockquote',
    ]);
    const documentChildren = new Set([
      ...blockChildren,
      'textSection',
      'imageBlock',
      'imageGallery',
      'videoEmbed',
      'adBlock',
    ]);
    const listItemChildren = new Set([
      'paragraph',
      'heading',
      'bulletList',
      'orderedList',
      'blockquote',
    ]);

    const checkChildren = (node: RichTextNodeInput, path: Array<string | number>) => {
      const children = node.content ?? [];
      if (
        ['doc', 'bulletList', 'orderedList', 'blockquote', 'textSection'].includes(node.type) &&
        children.length === 0
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${node.type} nodes require content`,
          path: [...path, 'content'],
        });
      }
      let allowed: ReadonlySet<string> | null = null;
      switch (node.type) {
        case 'doc':
          allowed = documentChildren;
          break;
        case 'blockquote':
          allowed = blockChildren;
          break;
        case 'textSection':
          allowed = blockChildren;
          break;
        case 'paragraph':
        case 'heading':
          allowed = new Set(['text', 'hardBreak']);
          break;
        case 'bulletList':
        case 'orderedList':
          allowed = new Set(['listItem']);
          break;
        case 'listItem':
          allowed = listItemChildren;
          if (children[0]?.type !== 'paragraph') {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'List items must start with a paragraph',
              path: [...path, 'content', 0],
            });
          }
          break;
        case 'text':
        case 'hardBreak':
        case 'imageBlock':
        case 'videoEmbed':
          if (children.length > 0) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              message: `${node.type} nodes cannot have children`,
              path: [...path, 'content'],
            });
          }
          break;
        case 'adBlock':
          if (node.content !== undefined) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'adBlock nodes cannot have content',
              path: [...path, 'content'],
            });
          }
          break;
        case 'imageGallery':
          if (node.content !== undefined) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'imageGallery nodes cannot have content',
              path: [...path, 'content'],
            });
          }
          break;
      }

      if (allowed) {
        children.forEach((child, index) => {
          if (!allowed?.has(child.type)) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              message: `${child.type} is not allowed inside ${node.type}`,
              path: [...path, 'content', index],
            });
          }
          checkChildren(child, [...path, 'content', index]);
        });
      }
    };

    checkChildren(document, []);
    const topLevel = document.content ?? [];
    const imageCount = topLevel.reduce((total, node) => {
      if (node.type === 'imageBlock') return total + 1;
      if (node.type === 'imageGallery') return total + (node.attrs?.items?.length ?? 0);
      return total;
    }, 0);
    const videoCount = topLevel.filter((node) => node.type === 'videoEmbed').length;
    const adCount = topLevel.filter((node) => node.type === 'adBlock').length;
    if (imageCount > 30) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A document can contain at most 30 images',
      });
    }
    if (videoCount > 5) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A document can contain at most 5 videos',
      });
    }
    if (adCount > 12) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A document can contain at most 12 ad placements',
      });
    }
    const totals = countDocument(document);
    if (totals.depth > 20) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Document nesting is too deep' });
    }
    if (totals.nodes > 5_000) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Document has too many nodes' });
    }
    if (totals.textCharacters > 200_000) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Document text is too long' });
    }
  }) as z.ZodType<RichTextDocument>;

/** A real article body contains visible text or a validated media node. */
export function hasMeaningfulArticleContent(document: RichTextDocument): boolean {
  const visit = (node: RichTextDocument | RichTextNodeInput): boolean => {
    if (node.type === 'text' && node.text?.trim()) return true;
    if (node.type === 'imageBlock' || node.type === 'imageGallery' || node.type === 'videoEmbed') {
      return true;
    }
    return node.content?.some(visit) ?? false;
  };
  return visit(document);
}

export const articleStatusSchema = z.enum(ARTICLE_STATUSES);

const articleSeoInputSchema = z
  .object({
    title: optionalTrimmedString(70),
    description: optionalTrimmedString(170),
    canonicalUrl: httpUrlSchema.optional(),
    socialTitle: optionalTrimmedString(100),
    socialDescription: optionalTrimmedString(200),
    socialImageUrl: httpUrlSchema.optional(),
    noIndex: z.boolean().optional(),
  })
  .strict();

const articleSeoUpdateSchema = z
  .object({
    title: nullableOptionalTrimmedString(70),
    description: nullableOptionalTrimmedString(170),
    canonicalUrl: httpUrlSchema.nullable().optional(),
    socialTitle: nullableOptionalTrimmedString(100),
    socialDescription: nullableOptionalTrimmedString(200),
    socialImageUrl: httpUrlSchema.nullable().optional(),
    noIndex: z.boolean().optional(),
  })
  .strict();

const articleNewsletterInputSchema = z
  .object({
    enabled: z.boolean().optional(),
    subject: optionalTrimmedString(150),
    preheader: optionalTrimmedString(200),
  })
  .strict();

const articleNewsletterUpdateSchema = z
  .object({
    enabled: z.boolean().optional(),
    subject: nullableOptionalTrimmedString(150),
    preheader: nullableOptionalTrimmedString(200),
  })
  .strict();

export const createArticleSchema = z
  .object({
    slug: slugSchema,
    titleAr: z.string().trim().min(1).max(180),
    titleEn: optionalTrimmedString(180),
    author: articleAuthorInputSchema,
    authorPlacement: articleAuthorPlacementSchema.optional(),
    excerptAr: optionalTrimmedString(500),
    coverUrl: httpUrlSchema.optional(),
    coverAlt: optionalTrimmedString(240),
    content: richTextDocumentSchema,
    seo: articleSeoInputSchema.optional(),
    newsletter: articleNewsletterInputSchema.optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (!hasMeaningfulArticleContent(input.content)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['content'],
        message: 'Article content must include text, an image, or a video',
      });
    }
    if (input.coverUrl && !input.coverAlt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['coverAlt'],
        message: 'Cover alternative text is required when a cover URL is set',
      });
    }
  });
export type CreateArticleInput = z.infer<typeof createArticleSchema>;

export const updateArticleSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    slug: slugSchema.optional(),
    titleAr: z.string().trim().min(1).max(180).optional(),
    titleEn: nullableOptionalTrimmedString(180),
    author: articleAuthorInputSchema.optional(),
    authorPlacement: articleAuthorPlacementSchema.optional(),
    excerptAr: nullableOptionalTrimmedString(500),
    coverUrl: httpUrlSchema.nullable().optional(),
    coverAlt: nullableOptionalTrimmedString(240),
    content: richTextDocumentSchema.optional(),
    seo: articleSeoUpdateSchema.optional(),
    newsletter: articleNewsletterUpdateSchema.optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.content && !hasMeaningfulArticleContent(input.content)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['content'],
        message: 'Article content must include text, an image, or a video',
      });
    }
  });
export type UpdateArticleInput = z.infer<typeof updateArticleSchema>;

export const updateArticleStatusSchema = z
  .object({
    status: articleStatusSchema,
    expectedVersion: z.number().int().min(1),
  })
  .strict();
export type UpdateArticleStatusInput = z.infer<typeof updateArticleStatusSchema>;

export const syncNewsletterCampaignSchema = z
  .object({ expectedVersion: z.number().int().min(1) })
  .strict();
export type SyncNewsletterCampaignInput = z.infer<typeof syncNewsletterCampaignSchema>;

export const sendNewsletterSchema = z
  .object({
    confirmation: z.literal('SEND_NEWSLETTER'),
    audienceConfirmationToken: z.string().trim().min(32).max(256),
    expectedVersion: z.number().int().min(1),
    expectedCampaignId: z.string().trim().min(1).max(128),
  })
  .strict();
export type SendNewsletterInput = z.infer<typeof sendNewsletterSchema>;
