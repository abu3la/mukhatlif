import { parseFragment, type DefaultTreeAdapterMap } from 'parse5';
import { checksumObject } from './hash.ts';
import { rewriteLegacyImageLink } from './legacy-links.ts';
import type { WordPressRecord } from './types.ts';

type HtmlNode = DefaultTreeAdapterMap['node'];
type HtmlElement = DefaultTreeAdapterMap['element'];

export interface InlineMediaDependency {
  order: number;
  url: string | null;
  sourceSetUrls: string[];
  attachmentLegacyId: number | null;
  mapping: 'class-id' | 'exact-url' | 'derived-url' | 'external-r2' | 'unresolved';
  alt: string;
  classNames: string[];
  width: number | null;
  height: number | null;
  originalLinkUrl: string | null;
  linkUrl: string | null;
  linkSource: 'html-anchor' | 'elementor' | null;
  linkDisposition: 'internal-rewritten' | 'external-https' | 'rejected' | null;
  mediaId: string | null;
  r2StorageKey: string | null;
  r2Verified: boolean;
  assetEligible: boolean;
  assetBlockers: string[];
}

export interface IframeDependency {
  order: number;
  url: string | null;
  title: string | null;
  classNames: string[];
  supportedVideo: boolean;
}

export interface WordPressBlockMarker {
  marker: string;
  blockName: string;
  closing: boolean;
  supported: boolean;
}

export interface ArticleAdMarker {
  kind: 'class-or-id' | 'shortcode' | 'wordpress-block';
  value: string;
}

export interface ArticleDependencyReport {
  legacyPostId: number;
  articleId: string;
  slug: string;
  featuredMedia: {
    legacyId: number | null;
    url: string | null;
    mapped: boolean;
    mediaId: string | null;
    publicUrl: string | null;
    r2StorageKey: string | null;
    r2Verified: boolean;
    assetEligible: boolean;
    assetBlockers: string[];
  };
  inlineMedia: InlineMediaDependency[];
  shortcodes: string[];
  iframes: IframeDependency[];
  classNames: string[];
  wordpressBlocks: WordPressBlockMarker[];
  unsupportedElements: string[];
  unsupportedAttributes: Array<{ element: string; attribute: string; value: string }>;
  adMarkers: ArticleAdMarker[];
  blockers: string[];
  readyForApply: boolean;
  sourceContentChecksumSha256: string;
}

const SUPPORTED_ELEMENTS = new Set([
  'a',
  'b',
  'blockquote',
  'br',
  'div',
  'em',
  'figcaption',
  'figure',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'iframe',
  'img',
  'li',
  'ol',
  'p',
  'strong',
  'article',
  'ul',
]);

const SUPPORTED_WORDPRESS_BLOCKS = new Set([
  'heading',
  'embed',
  'image',
  'list',
  'list-item',
  'paragraph',
  'quote',
  'uagb/image',
]);

const AD_MARKER =
  /(?:^|[-_\s])(?:ad|ads|advert|advertisement|sponsor|sponsored)(?:$|[-_\s])|إعلان|اعلان|رعاية|راعي/i;
const SHORTCODE = /\[\/?[A-Za-z][A-Za-z0-9_-]*(?:\s+[^\]\r\n]*)?\]/g;

function isElement(node: HtmlNode): node is HtmlElement {
  return 'tagName' in node;
}

function children(node: HtmlNode): HtmlNode[] {
  return 'childNodes' in node ? (node.childNodes as HtmlNode[]) : [];
}

function attribute(element: HtmlElement, name: string): string | null {
  return element.attrs.find((candidate) => candidate.name.toLowerCase() === name)?.value ?? null;
}

function classNames(element: HtmlElement): string[] {
  return (attribute(element, 'class') ?? '').split(/\s+/).filter(Boolean);
}

function safeUrl(value: string | null): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function safeInteger(value: string | null): number | null {
  if (!value || !/^\d{1,8}$/.test(value)) return null;
  const parsed = Number.parseInt(value, 10);
  return parsed > 0 ? parsed : null;
}

function normalizedMediaPath(value: string): string | null {
  try {
    const url = new URL(value);
    const decoded = decodeURIComponent(url.pathname).normalize('NFC');
    return decoded
      .replace(/-\d{2,5}x\d{2,5}(?=\.[^./]+$)/i, '')
      .replace(/-scaled(?=\.[^./]+$)/i, '');
  } catch {
    return null;
  }
}

function sourceSetUrls(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((candidate) => safeUrl(candidate.trim().split(/\s+/)[0] ?? ''))
    .filter((candidate): candidate is string => Boolean(candidate));
}

function mediaIndexes(attachments: WordPressRecord[]): {
  exact: Map<string, number>;
  derived: Map<string, number>;
} {
  const exact = new Map<string, number>();
  const derived = new Map<string, number>();
  for (const attachment of attachments) {
    const source = safeUrl(attachment.media?.sourceUrl ?? null);
    if (source) {
      exact.set(source, attachment.legacyId);
      const normalized = normalizedMediaPath(source);
      if (normalized && !derived.has(normalized)) derived.set(normalized, attachment.legacyId);
    }
  }
  return { exact, derived };
}

function attachmentIdFromClasses(values: string[]): number | null {
  for (const value of values) {
    const match = value.match(/^(?:wp-image|uag-image)-(\d+)$/);
    if (match) return Number.parseInt(match[1]!, 10);
  }
  return null;
}

function resolveInlineMedia(
  element: HtmlElement,
  order: number,
  attachmentsById: Map<number, WordPressRecord>,
  indexes: ReturnType<typeof mediaIndexes>,
): InlineMediaDependency {
  const classes = classNames(element);
  const url = safeUrl(attribute(element, 'src'));
  const classId = attachmentIdFromClasses(classes);
  if (classId && attachmentsById.has(classId)) {
    return {
      order,
      url,
      sourceSetUrls: sourceSetUrls(attribute(element, 'srcset')),
      attachmentLegacyId: classId,
      mapping: 'class-id',
      alt: (attribute(element, 'alt') ?? '').trim(),
      classNames: classes,
      width: safeInteger(attribute(element, 'width')),
      height: safeInteger(attribute(element, 'height')),
      originalLinkUrl: null,
      linkUrl: null,
      linkSource: null,
      linkDisposition: null,
      mediaId: null,
      r2StorageKey: null,
      r2Verified: false,
      assetEligible: false,
      assetBlockers: [],
    };
  }
  const exactId = url ? indexes.exact.get(url) : null;
  const derivedId = url ? indexes.derived.get(normalizedMediaPath(url) ?? '') : null;
  return {
    order,
    url,
    sourceSetUrls: sourceSetUrls(attribute(element, 'srcset')),
    attachmentLegacyId: exactId ?? derivedId ?? null,
    mapping: exactId ? 'exact-url' : derivedId ? 'derived-url' : 'unresolved',
    alt: (attribute(element, 'alt') ?? '').trim(),
    classNames: classes,
    width: safeInteger(attribute(element, 'width')),
    height: safeInteger(attribute(element, 'height')),
    originalLinkUrl: null,
    linkUrl: null,
    linkSource: null,
    linkDisposition: null,
    mediaId: null,
    r2StorageKey: null,
    r2Verified: false,
    assetEligible: false,
    assetBlockers: [],
  };
}

function attachImageLink(
  dependency: InlineMediaDependency,
  link: { value: string; source: 'html-anchor' | 'elementor' } | null,
): InlineMediaDependency {
  if (!link) return dependency;
  const rewritten = rewriteLegacyImageLink(link.value);
  return {
    ...dependency,
    originalLinkUrl: link.value,
    linkUrl: rewritten.linkUrl,
    linkSource: link.source,
    linkDisposition: rewritten.disposition,
  };
}

interface ElementorImageLink {
  legacyId: number;
  url: string;
}

function elementorImageLinks(post: WordPressRecord): Map<number, ElementorImageLink[]> {
  const result = new Map<number, ElementorImageLink[]>();
  if (post.builder?.kind !== 'elementor') return result;
  let parsed: unknown;
  try {
    parsed = JSON.parse(post.builder.data) as unknown;
  } catch {
    return result;
  }
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const child of value) visit(child);
      return;
    }
    const node = value as Record<string, unknown>;
    const settings =
      node.settings && typeof node.settings === 'object' && !Array.isArray(node.settings)
        ? (node.settings as Record<string, unknown>)
        : null;
    const image =
      settings?.image && typeof settings.image === 'object' && !Array.isArray(settings.image)
        ? (settings.image as Record<string, unknown>)
        : null;
    const wrapper =
      settings?.element_pack_wrapper_link &&
      typeof settings.element_pack_wrapper_link === 'object' &&
      !Array.isArray(settings.element_pack_wrapper_link)
        ? (settings.element_pack_wrapper_link as Record<string, unknown>)
        : null;
    const legacyId =
      typeof image?.id === 'number'
        ? image.id
        : typeof image?.id === 'string' && /^\d+$/.test(image.id)
          ? Number.parseInt(image.id, 10)
          : null;
    const url = typeof wrapper?.url === 'string' ? wrapper.url.trim() : '';
    if (legacyId && url) {
      result.set(legacyId, [...(result.get(legacyId) ?? []), { legacyId, url }]);
    }
    for (const child of Object.values(node)) visit(child);
  };
  visit(parsed);
  return result;
}

function isSupportedVideoUrl(value: string | null): boolean {
  if (!value) return false;
  const url = new URL(value);
  if (['youtube.com', 'www.youtube.com', 'www.youtube-nocookie.com'].includes(url.hostname)) {
    return /\/(?:embed|shorts)\/[A-Za-z0-9_-]{11}/.test(url.pathname);
  }
  if (url.hostname === 'youtu.be') return /^\/[A-Za-z0-9_-]{11}\/?$/.test(url.pathname);
  if (['player.vimeo.com', 'vimeo.com', 'www.vimeo.com'].includes(url.hostname)) {
    return /\/\d{6,12}\/?$/.test(url.pathname);
  }
  return false;
}

function commentData(node: HtmlNode): string | null {
  return node.nodeName === '#comment'
    ? (node as DefaultTreeAdapterMap['commentNode']).data.trim()
    : null;
}

function wordpressBlockMarker(value: string): WordPressBlockMarker | null {
  const match = value.match(/^\/?wp:([A-Za-z0-9_/-]+)/);
  if (!match) return null;
  const closing = value.startsWith('/');
  const blockName = match[1]!.toLowerCase();
  return {
    marker: value.slice(0, 500),
    blockName,
    closing,
    supported: SUPPORTED_WORDPRESS_BLOCKS.has(blockName),
  };
}

function unique<T>(values: T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const identity = key(value);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

export function analyzeArticleDependencies(options: {
  post: WordPressRecord;
  attachments: WordPressRecord[];
}): ArticleDependencyReport {
  const { post, attachments } = options;
  const attachmentsById = new Map(
    attachments.map((attachment) => [attachment.legacyId, attachment]),
  );
  const indexes = mediaIndexes(attachments);
  const featured = post.featuredMediaLegacyId
    ? (attachmentsById.get(post.featuredMediaLegacyId) ?? null)
    : null;
  const featuredUrl = safeUrl(featured?.media?.sourceUrl ?? null);
  const inlineMedia: InlineMediaDependency[] = [];
  const iframes: IframeDependency[] = [];
  const shortcodes: string[] = [];
  const allClasses: string[] = [];
  const wordpressBlocks: WordPressBlockMarker[] = [];
  const unsupportedElements: string[] = [];
  const unsupportedAttributes: Array<{ element: string; attribute: string; value: string }> = [];
  const adMarkers: ArticleAdMarker[] = [];
  const fragment = parseFragment(post.contentHtml);
  const elementorLinks = elementorImageLinks(post);

  const visit = (node: HtmlNode, ignoredText = false, anchorHref: string | null = null): void => {
    const comment = commentData(node);
    if (comment !== null) {
      const marker = wordpressBlockMarker(comment);
      if (marker) {
        wordpressBlocks.push(marker);
        if (AD_MARKER.test(marker.blockName)) {
          adMarkers.push({ kind: 'wordpress-block', value: marker.blockName });
        }
      }
      return;
    }
    if (node.nodeName === '#text') {
      if (!ignoredText) {
        const value = (node as DefaultTreeAdapterMap['textNode']).value;
        for (const match of value.matchAll(SHORTCODE)) {
          const shortcode = match[0];
          shortcodes.push(shortcode);
          if (AD_MARKER.test(shortcode)) adMarkers.push({ kind: 'shortcode', value: shortcode });
        }
      }
      return;
    }
    if (!isElement(node)) return;
    const tag = node.tagName.toLowerCase();
    const classes = classNames(node);
    allClasses.push(...classes);
    for (const marker of [attribute(node, 'id'), ...classes]) {
      if (marker && AD_MARKER.test(marker)) {
        adMarkers.push({ kind: 'class-or-id', value: marker });
      }
    }
    if (tag !== 'style' && !SUPPORTED_ELEMENTS.has(tag)) unsupportedElements.push(tag);
    for (const attr of node.attrs) {
      const name = attr.name.toLowerCase();
      const editorOrPresentationMetadata =
        name === 'style' ||
        name === 'dir' ||
        name === 'data-pm-slice' ||
        name === 'data-start' ||
        name === 'data-end' ||
        name === 'data-scroll-anchor' ||
        name === 'data-testid';
      if (!editorOrPresentationMetadata && (name === 'id' || name.startsWith('data-'))) {
        unsupportedAttributes.push({
          element: tag,
          attribute: name,
          value: attr.value.slice(0, 500),
        });
      }
    }
    if (tag === 'img') {
      let dependency = resolveInlineMedia(node, inlineMedia.length, attachmentsById, indexes);
      const builderLink = dependency.attachmentLegacyId
        ? elementorLinks.get(dependency.attachmentLegacyId)?.shift()
        : null;
      dependency = attachImageLink(
        dependency,
        anchorHref
          ? { value: anchorHref, source: 'html-anchor' }
          : builderLink
            ? { value: builderLink.url, source: 'elementor' }
            : null,
      );
      inlineMedia.push(dependency);
    }
    if (tag === 'iframe') {
      const url = safeUrl(attribute(node, 'src'));
      iframes.push({
        order: iframes.length,
        url,
        title: attribute(node, 'title')?.trim() || null,
        classNames: classes,
        supportedVideo: isSupportedVideoUrl(url),
      });
    }
    const ignoresText = ignoredText || tag === 'style' || tag === 'script';
    const childAnchor = tag === 'a' ? attribute(node, 'href') : anchorHref;
    for (const child of children(node)) visit(child, ignoresText, childAnchor);
  };
  for (const node of fragment.childNodes) visit(node as HtmlNode);

  const uniqueBlocks = unique(wordpressBlocks, (marker) => marker.marker);
  const uniqueUnsupportedElements = [...new Set(unsupportedElements)].sort();
  const uniqueUnsupportedAttributes = unique(
    unsupportedAttributes,
    (entry) => `${entry.element}\u0000${entry.attribute}\u0000${entry.value}`,
  );
  const uniqueAdMarkers = unique(adMarkers, (entry) => `${entry.kind}\u0000${entry.value}`);
  const blockers: string[] = [];
  if (!post.featuredMediaLegacyId || !featured || !featuredUrl) {
    blockers.push('missing-featured-media-mapping');
  }
  if (inlineMedia.some((dependency) => dependency.mapping === 'unresolved')) {
    blockers.push('unresolved-inline-media');
  }
  if (inlineMedia.some((dependency) => dependency.linkDisposition === 'rejected')) {
    blockers.push('unsafe-or-unroutable-image-link');
  }
  if (shortcodes.length) blockers.push('shortcode-contract-not-supported');
  if (iframes.some((iframe) => !iframe.supportedVideo)) {
    blockers.push('unsupported-iframe');
  }
  if (uniqueBlocks.some((block) => !block.supported)) {
    blockers.push('unsupported-wordpress-block');
  }
  if (uniqueUnsupportedElements.length) blockers.push('unsupported-html-element');
  if (uniqueUnsupportedAttributes.length) blockers.push('unsupported-html-attributes');
  if (uniqueAdMarkers.length) blockers.push('ad-block-contract-not-supported');

  const uniqueBlockers = [...new Set(blockers)].sort();
  return {
    legacyPostId: post.legacyId,
    articleId: `art-wp-${post.legacyId}`,
    slug: post.suggestedTargetSlug,
    featuredMedia: {
      legacyId: post.featuredMediaLegacyId,
      url: featuredUrl,
      mapped: Boolean(post.featuredMediaLegacyId && featured && featuredUrl),
      mediaId: null,
      publicUrl: null,
      r2StorageKey: null,
      r2Verified: false,
      assetEligible: false,
      assetBlockers: [],
    },
    inlineMedia,
    shortcodes: [...new Set(shortcodes)],
    iframes,
    classNames: [...new Set(allClasses)].sort(),
    wordpressBlocks: uniqueBlocks,
    unsupportedElements: uniqueUnsupportedElements,
    unsupportedAttributes: uniqueUnsupportedAttributes,
    adMarkers: uniqueAdMarkers,
    blockers: uniqueBlockers,
    readyForApply: uniqueBlockers.length === 0,
    sourceContentChecksumSha256: checksumObject(post.contentHtml),
  };
}
