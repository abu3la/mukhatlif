import { Node } from '@tiptap/core';
import {
  ARTICLE_TEXT_ALIGNMENTS,
  ARTICLE_TEXT_DIRECTIONS,
  ARTICLE_TEXT_SECTION_HEIGHTS,
  ARTICLE_TEXT_VERTICAL_ALIGNMENTS,
  type ArticleTextAlignment,
  type ArticleTextDirection,
  type ArticleTextSectionHeight,
  type ArticleTextVerticalAlignment,
} from '@mukhtalif/types';

export type {
  ArticleTextAlignment,
  ArticleTextDirection,
  ArticleTextSectionHeight,
  ArticleTextVerticalAlignment,
} from '@mukhtalif/types';

export interface ArticleTextSectionAttributes {
  readonly alignment: ArticleTextAlignment;
  readonly direction: ArticleTextDirection;
  readonly vertical: ArticleTextVerticalAlignment;
  readonly height: ArticleTextSectionHeight;
}

export const DEFAULT_ARTICLE_TEXT_SECTION_ATTRIBUTES: ArticleTextSectionAttributes = {
  alignment: 'start',
  direction: 'rtl',
  vertical: 'top',
  height: 'auto',
};

function includesValue<const Values extends readonly string[]>(
  values: Values,
  value: unknown,
): value is Values[number] {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

export function normalizeArticleTextAlignment(value: unknown): ArticleTextAlignment {
  return includesValue(ARTICLE_TEXT_ALIGNMENTS, value) ? value : 'start';
}

export function normalizeArticleTextDirection(value: unknown): ArticleTextDirection {
  return includesValue(ARTICLE_TEXT_DIRECTIONS, value) ? value : 'rtl';
}

export function normalizeArticleTextVerticalAlignment(
  value: unknown,
): ArticleTextVerticalAlignment {
  return includesValue(ARTICLE_TEXT_VERTICAL_ALIGNMENTS, value) ? value : 'top';
}

export function normalizeArticleTextSectionHeight(value: unknown): ArticleTextSectionHeight {
  return includesValue(ARTICLE_TEXT_SECTION_HEIGHTS, value) ? value : 'auto';
}

export function normalizeArticleTextSectionAttributes(
  attributes: Record<string, unknown> | null | undefined,
): ArticleTextSectionAttributes {
  const height = normalizeArticleTextSectionHeight(attributes?.height);
  return {
    alignment: normalizeArticleTextAlignment(attributes?.alignment),
    direction: normalizeArticleTextDirection(attributes?.direction),
    vertical:
      height === 'auto' ? 'top' : normalizeArticleTextVerticalAlignment(attributes?.vertical),
    height,
  };
}

/**
 * A deliberately constrained wrapper for text blocks. Media nodes are omitted
 * from the content expression so changing text layout can never capture an
 * image or video by accident.
 */
export const ArticleTextSection = Node.create({
  name: 'textSection',
  group: 'block',
  content: '(paragraph|heading|bulletList|orderedList|blockquote)+',
  defining: true,

  addAttributes() {
    return {
      alignment: {
        default: DEFAULT_ARTICLE_TEXT_SECTION_ATTRIBUTES.alignment,
        rendered: false,
        parseHTML: (element) => normalizeArticleTextAlignment(element.dataset.alignment),
      },
      direction: {
        default: DEFAULT_ARTICLE_TEXT_SECTION_ATTRIBUTES.direction,
        rendered: false,
        parseHTML: (element) => normalizeArticleTextDirection(element.dataset.direction),
      },
      vertical: {
        default: DEFAULT_ARTICLE_TEXT_SECTION_ATTRIBUTES.vertical,
        rendered: false,
        parseHTML: (element) => normalizeArticleTextVerticalAlignment(element.dataset.vertical),
      },
      height: {
        default: DEFAULT_ARTICLE_TEXT_SECTION_ATTRIBUTES.height,
        rendered: false,
        parseHTML: (element) => normalizeArticleTextSectionHeight(element.dataset.height),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'section[data-article-text-section]' }];
  },

  renderHTML({ node }) {
    const attributes = normalizeArticleTextSectionAttributes(node.attrs);
    return [
      'section',
      {
        class: `article-text-section article-text-section--align-${attributes.alignment} article-text-section--height-${attributes.height} article-text-section--vertical-${attributes.vertical}`,
        dir: attributes.direction,
        'data-article-text-section': '',
        'data-alignment': attributes.alignment,
        'data-direction': attributes.direction,
        'data-vertical': attributes.vertical,
        'data-height': attributes.height,
      },
      0,
    ];
  },
});
