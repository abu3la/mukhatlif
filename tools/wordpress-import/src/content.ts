import { parseFragment, type DefaultTreeAdapterMap } from 'parse5';
import type {
  RichTextDocument,
  RichTextMark,
  RichTextNode,
} from '../../../libs/types/src/article.ts';
import { richTextDocumentSchema } from '../../../libs/validation/src/article.ts';
import { renderRichText, richTextToPlainText } from '../../../apps/api/src/publishing/rich-text.ts';

type HtmlNode = DefaultTreeAdapterMap['node'];
type HtmlElement = DefaultTreeAdapterMap['element'];

const BLOCKED_ELEMENTS = new Set([
  'applet',
  'base',
  'button',
  'canvas',
  'embed',
  'form',
  'head',
  'input',
  'link',
  'meta',
  'noscript',
  'object',
  'script',
  'select',
  'style',
  'svg',
  'template',
  'textarea',
]);

const BLOCK_ELEMENTS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'div',
  'figure',
  'figcaption',
  'footer',
  'header',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'section',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'ul',
]);

export interface WordPressContentConversion {
  document: RichTextDocument;
  contentHtml: string;
  legacyContentHtml: string;
  plainText: string;
  stats: {
    mappedImages: number;
    externalImages: number;
    videoEmbeds: number;
    droppedUnsafeUrls: number;
    droppedElements: number;
  };
}

interface MutableStats {
  mappedImages: number;
  externalImages: number;
  videoEmbeds: number;
  droppedUnsafeUrls: number;
  droppedElements: number;
}

export interface WordPressContentImageMapping {
  mediaId: string;
  alt: string;
  linkUrl?: string;
}

export interface WordPressContentConversionOptions {
  images?: WordPressContentImageMapping[];
  rewriteLink?: (href: string) => string | null;
  videoPosterMediaId?: string;
  defaultVideoTitle?: string;
}

interface ConversionContext {
  stats: MutableStats;
  imageMappings: WordPressContentImageMapping[];
  imageIndex: number;
  rewriteLink?: (href: string) => string | null;
  videoPosterMediaId?: string;
  defaultVideoTitle?: string;
}

function isElement(node: HtmlNode): node is HtmlElement {
  return 'tagName' in node;
}

function children(node: HtmlNode): HtmlNode[] {
  return 'childNodes' in node ? (node.childNodes as HtmlNode[]) : [];
}

function attribute(element: HtmlElement, name: string): string | null {
  return element.attrs.find((candidate) => candidate.name.toLowerCase() === name)?.value ?? null;
}

function textContent(node: HtmlNode): string {
  if (node.nodeName === '#text') return (node as DefaultTreeAdapterMap['textNode']).value;
  return children(node).map(textContent).join('');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function safeUrl(value: string | null, kind: 'link' | 'media', stats: MutableStats): string | null {
  if (!value?.trim()) return null;
  const normalized = value.trim();
  if (kind === 'link' && (normalized.startsWith('#') || /^\/(?!\/)/.test(normalized))) {
    return normalized;
  }
  try {
    const url = new URL(normalized);
    if (url.username || url.password) throw new Error('credentials are not allowed');
    const protocols = kind === 'link' ? ['https:', 'mailto:'] : ['https:'];
    if (!protocols.includes(url.protocol)) throw new Error('protocol is not allowed');
    return url.toString();
  } catch {
    stats.droppedUnsafeUrls += 1;
    return null;
  }
}

function safeDimension(value: string | null): string | null {
  if (!value || !/^\d{1,5}$/.test(value)) return null;
  const number = Number.parseInt(value, 10);
  return number > 0 && number <= 8192 ? String(number) : null;
}

function videoAttributes(element: HtmlElement, stats: MutableStats): RichTextNode['attrs'] | null {
  const src = safeUrl(attribute(element, 'src'), 'media', stats);
  if (!src) return null;
  const url = new URL(src);
  let provider: 'youtube' | 'vimeo' | null = null;
  let videoId: string | null = null;
  if (['youtube.com', 'www.youtube.com', 'www.youtube-nocookie.com'].includes(url.hostname)) {
    const match = url.pathname.match(/\/(?:embed|shorts)\/([A-Za-z0-9_-]{11})/);
    if (match) {
      provider = 'youtube';
      videoId = match[1];
    }
  } else if (url.hostname === 'youtu.be') {
    const candidate = url.pathname.split('/').filter(Boolean)[0];
    if (candidate && /^[A-Za-z0-9_-]{11}$/.test(candidate)) {
      provider = 'youtube';
      videoId = candidate;
    }
  } else if (['player.vimeo.com', 'vimeo.com', 'www.vimeo.com'].includes(url.hostname)) {
    const candidate = url.pathname.split('/').filter(Boolean).at(-1);
    if (candidate && /^\d{6,12}$/.test(candidate)) {
      provider = 'vimeo';
      videoId = candidate;
    }
  }
  if (!provider || !videoId) return null;
  const title = attribute(element, 'title')?.trim().slice(0, 240);
  return { provider, videoId, ...(title ? { title } : {}) };
}

function sanitizeNode(node: HtmlNode, context: ConversionContext): string {
  const { stats } = context;
  if (node.nodeName === '#text')
    return escapeHtml((node as DefaultTreeAdapterMap['textNode']).value);
  if (!isElement(node)) return '';
  const tag = node.tagName.toLowerCase();
  if (tag === 'style') return '';
  if (BLOCKED_ELEMENTS.has(tag)) {
    stats.droppedElements += 1;
    return '';
  }
  const inner = children(node)
    .map((child) => sanitizeNode(child, context))
    .join('');
  if (tag === 'br') return '<br>';
  if (tag === 'hr') return '<p>***</p>';
  if (tag === 'img') {
    const mapping = context.imageMappings[context.imageIndex] ?? null;
    context.imageIndex += 1;
    const source = mapping
      ? `/media/${encodeURIComponent(mapping.mediaId)}`
      : safeUrl(attribute(node, 'src'), 'media', stats);
    if (!source) return '';
    if (mapping) stats.mappedImages += 1;
    else stats.externalImages += 1;
    const alt = mapping?.alt.trim() || attribute(node, 'alt')?.trim() || '';
    const width = safeDimension(attribute(node, 'width'));
    const height = safeDimension(attribute(node, 'height'));
    return `<img src="${escapeHtml(source)}" alt="${escapeHtml(alt.slice(0, 500))}"${
      width ? ` width="${width}"` : ''
    }${height ? ` height="${height}"` : ''}${
      mapping ? ` data-import-media-id="${escapeHtml(mapping.mediaId)}"` : ''
    }${
      mapping?.linkUrl ? ` data-import-link-url="${escapeHtml(mapping.linkUrl)}"` : ''
    } loading="lazy">`;
  }
  if (tag === 'iframe') {
    const attrs = videoAttributes(node, stats);
    if (!attrs?.provider || !attrs.videoId) {
      stats.droppedElements += 1;
      return '';
    }
    stats.videoEmbeds += 1;
    const src =
      attrs.provider === 'youtube'
        ? `https://www.youtube-nocookie.com/embed/${attrs.videoId}`
        : `https://player.vimeo.com/video/${attrs.videoId}`;
    const title = attrs.title ?? context.defaultVideoTitle?.trim().slice(0, 240);
    return `<iframe src="${src}"${title ? ` title="${escapeHtml(title)}"` : ''}${
      context.videoPosterMediaId
        ? ` data-import-poster-media-id="${escapeHtml(context.videoPosterMediaId)}"`
        : ''
    } loading="lazy" allowfullscreen></iframe>`;
  }
  if (tag === 'a') {
    const sourceHref = attribute(node, 'href');
    const rewrittenHref = sourceHref
      ? context.rewriteLink
        ? context.rewriteLink(sourceHref)
        : sourceHref
      : null;
    const href = safeUrl(rewrittenHref, 'link', stats);
    if (!href) return inner;
    const target = attribute(node, 'target') === '_blank' ? ' target="_blank"' : '';
    const rel = target ? ' rel="noopener noreferrer"' : '';
    return `<a href="${escapeHtml(href)}"${target}${rel}>${inner}</a>`;
  }
  if (tag === 'strong' || tag === 'b') return `<strong>${inner}</strong>`;
  if (tag === 'em' || tag === 'i') return `<em>${inner}</em>`;
  if (tag === 'blockquote') return `<blockquote>${inner}</blockquote>`;
  if (tag === 'ul' || tag === 'ol' || tag === 'li' || tag === 'figure' || tag === 'figcaption') {
    const start = tag === 'ol' ? safeDimension(attribute(node, 'start')) : null;
    return `<${tag}${start ? ` start="${start}"` : ''}>${inner}</${tag}>`;
  }
  if (/^h[1-6]$/.test(tag)) {
    const normalized = tag === 'h1' || tag === 'h2' ? 'h2' : 'h3';
    return `<${normalized}>${inner}</${normalized}>`;
  }
  if (tag === 'p') return `<p>${inner}</p>`;
  if (
    tag === 'div' &&
    (attribute(node, 'class') ?? '').split(/\s+/).includes('wp-block-embed__wrapper')
  ) {
    const sourceHref = textContent(node).trim();
    const rewrittenHref = sourceHref
      ? context.rewriteLink
        ? context.rewriteLink(sourceHref)
        : sourceHref
      : null;
    const href = safeUrl(rewrittenHref, 'link', stats);
    return href
      ? `<p><a href="${escapeHtml(href)}">${escapeHtml(href)}</a></p>`
      : `<div>${inner}</div>`;
  }
  if (['div', 'section', 'article', 'main', 'aside', 'header', 'footer', 'nav'].includes(tag)) {
    return `<div>${inner}</div>`;
  }
  if (['table', 'thead', 'tbody', 'tr', 'th', 'td'].includes(tag)) {
    return `<${tag}>${inner}</${tag}>`;
  }
  return inner;
}

function sameMarks(left: RichTextMark[] | undefined, right: RichTextMark[] | undefined): boolean {
  return JSON.stringify(left ?? []) === JSON.stringify(right ?? []);
}

function mergeTextNodes(nodes: RichTextNode[]): RichTextNode[] {
  const merged: RichTextNode[] = [];
  for (const node of nodes) {
    const previous = merged.at(-1);
    if (
      previous?.type === 'text' &&
      node.type === 'text' &&
      sameMarks(previous.marks, node.marks)
    ) {
      previous.text = `${previous.text ?? ''}${node.text ?? ''}`;
    } else {
      merged.push(node);
    }
  }
  return merged;
}

function addMark(marks: RichTextMark[], mark: RichTextMark): RichTextMark[] {
  return marks.some((candidate) => candidate.type === mark.type) ? marks : [...marks, mark];
}

function inlineNodes(node: HtmlNode, marks: RichTextMark[] = []): RichTextNode[] {
  if (node.nodeName === '#text') {
    const value = (node as DefaultTreeAdapterMap['textNode']).value.replace(/\s+/g, ' ');
    return value ? [{ type: 'text', text: value, ...(marks.length ? { marks } : {}) }] : [];
  }
  if (!isElement(node)) return [];
  const tag = node.tagName.toLowerCase();
  if (tag === 'br') return [{ type: 'hardBreak' }];
  if (tag === 'img') {
    const stats: MutableStats = {
      mappedImages: 0,
      externalImages: 0,
      videoEmbeds: 0,
      droppedUnsafeUrls: 0,
      droppedElements: 0,
    };
    const src = safeUrl(attribute(node, 'src'), 'media', stats);
    if (!src) return [];
    const label = attribute(node, 'alt')?.trim() || src;
    return [
      {
        type: 'text',
        text: label.slice(0, 100_000),
        marks: addMark(marks, { type: 'link', attrs: { href: src } }),
      },
    ];
  }
  let nextMarks = marks;
  if (tag === 'strong' || tag === 'b') nextMarks = addMark(marks, { type: 'bold' });
  if (tag === 'em' || tag === 'i') nextMarks = addMark(marks, { type: 'italic' });
  if (tag === 'a') {
    const stats: MutableStats = {
      mappedImages: 0,
      externalImages: 0,
      videoEmbeds: 0,
      droppedUnsafeUrls: 0,
      droppedElements: 0,
    };
    const href = safeUrl(attribute(node, 'href'), 'link', stats);
    if (href) {
      const target = attribute(node, 'target') === '_blank' ? '_blank' : null;
      nextMarks = addMark(marks, {
        type: 'link',
        attrs: {
          href,
          ...(target ? { target, rel: 'noopener noreferrer' } : {}),
        },
      });
    }
  }
  return mergeTextNodes(children(node).flatMap((child) => inlineNodes(child, nextMarks)));
}

type FlowItem = { kind: 'inline'; node: RichTextNode } | { kind: 'block'; node: RichTextNode };

function mappedImageBlock(element: HtmlElement): RichTextNode | null {
  const mediaId = attribute(element, 'data-import-media-id')?.trim();
  const alt = attribute(element, 'alt')?.trim();
  if (!mediaId || !alt) return null;
  const linkUrl = attribute(element, 'data-import-link-url')?.trim();
  return {
    type: 'imageBlock',
    attrs: {
      mediaId,
      alt: alt.slice(0, 500),
      presentation: 'content',
      alignment: 'center',
      radius: 'none',
      ...(linkUrl ? { linkUrl } : {}),
    },
  };
}

function videoBlock(element: HtmlElement): RichTextNode | null {
  const stats: MutableStats = {
    mappedImages: 0,
    externalImages: 0,
    videoEmbeds: 0,
    droppedUnsafeUrls: 0,
    droppedElements: 0,
  };
  const attrs = videoAttributes(element, stats);
  const posterMediaId = attribute(element, 'data-import-poster-media-id')?.trim();
  if (!attrs?.provider || !attrs.videoId || !attrs.title || !posterMediaId) return null;
  return { type: 'videoEmbed', attrs: { ...attrs, posterMediaId } };
}

function flowItems(node: HtmlNode, marks: RichTextMark[] = []): FlowItem[] {
  if (node.nodeName === '#text') {
    return inlineNodes(node, marks).map((child) => ({ kind: 'inline', node: child }));
  }
  if (!isElement(node)) return [];
  const tag = node.tagName.toLowerCase();
  if (tag === 'br') return [{ kind: 'inline', node: { type: 'hardBreak' } }];
  if (tag === 'img') {
    const block = mappedImageBlock(node);
    if (block) return [{ kind: 'block', node: block }];
    return inlineNodes(node, marks).map((child) => ({ kind: 'inline', node: child }));
  }
  if (tag === 'iframe') {
    const block = videoBlock(node);
    return block ? [{ kind: 'block', node: block }] : [];
  }
  let nextMarks = marks;
  if (tag === 'strong' || tag === 'b') nextMarks = addMark(nextMarks, { type: 'bold' });
  if (tag === 'em' || tag === 'i') nextMarks = addMark(nextMarks, { type: 'italic' });
  if (tag === 'a') {
    const stats: MutableStats = {
      mappedImages: 0,
      externalImages: 0,
      videoEmbeds: 0,
      droppedUnsafeUrls: 0,
      droppedElements: 0,
    };
    const href = safeUrl(attribute(node, 'href'), 'link', stats);
    if (href) {
      const target = attribute(node, 'target') === '_blank' ? '_blank' : null;
      nextMarks = addMark(nextMarks, {
        type: 'link',
        attrs: {
          href,
          ...(target ? { target, rel: 'noopener noreferrer' } : {}),
        },
      });
    }
  }
  return children(node).flatMap((child) => flowItems(child, nextMarks));
}

function blocksFromFlow(nodes: HtmlNode[]): RichTextNode[] {
  const result: RichTextNode[] = [];
  let inline: RichTextNode[] = [];
  const flush = () => {
    const content = mergeTextNodes(inline);
    const meaningful = content.some(
      (node) => node.type === 'hardBreak' || (node.type === 'text' && node.text?.trim()),
    );
    if (meaningful) result.push({ type: 'paragraph', content });
    inline = [];
  };
  for (const item of nodes.flatMap((node) => flowItems(node))) {
    if (item.kind === 'inline') inline.push(item.node);
    else {
      flush();
      result.push(item.node);
    }
  }
  flush();
  return result;
}

function paragraphFrom(nodes: HtmlNode[]): RichTextNode | null {
  const content = mergeTextNodes(nodes.flatMap((node) => inlineNodes(node)));
  const meaningful = content.some(
    (node) => node.type === 'hardBreak' || (node.type === 'text' && node.text?.trim()),
  );
  return meaningful ? { type: 'paragraph', content } : null;
}

function listItem(element: HtmlElement): RichTextNode {
  const inlineChildren = children(element).filter(
    (child) => !isElement(child) || !['ul', 'ol'].includes(child.tagName.toLowerCase()),
  );
  const firstParagraph = paragraphFrom(inlineChildren) ?? { type: 'paragraph', content: [] };
  const nested = children(element)
    .filter(
      (child): child is HtmlElement => isElement(child) && ['ul', 'ol'].includes(child.tagName),
    )
    .flatMap((child) => blockNodes(child));
  return { type: 'listItem', content: [firstParagraph, ...nested] };
}

function listNode(element: HtmlElement): RichTextNode | null {
  const items = children(element)
    .filter((child): child is HtmlElement => isElement(child) && child.tagName === 'li')
    .map((child) => listItem(child));
  if (!items.length) return null;
  if (element.tagName === 'ul') return { type: 'bulletList', content: items };
  const start = Number.parseInt(attribute(element, 'start') ?? '1', 10);
  return {
    type: 'orderedList',
    ...(Number.isInteger(start) && start > 1 && start <= 1_000_000 ? { attrs: { start } } : {}),
    content: items,
  };
}

function blockNodes(node: HtmlNode): RichTextNode[] {
  if (node.nodeName === '#text') {
    const paragraph = paragraphFrom([node]);
    return paragraph ? [paragraph] : [];
  }
  if (!isElement(node)) return [];
  const tag = node.tagName.toLowerCase();
  if (tag === 'p' || tag === 'figcaption' || tag === 'td' || tag === 'th') {
    return blocksFromFlow(children(node));
  }
  if (/^h[1-6]$/.test(tag)) {
    const content = mergeTextNodes(children(node).flatMap((child) => inlineNodes(child)));
    return content.some((child) => child.type === 'text' && child.text?.trim())
      ? [{ type: 'heading', attrs: { level: tag === 'h1' || tag === 'h2' ? 2 : 3 }, content }]
      : [];
  }
  if (tag === 'ul' || tag === 'ol') {
    const list = listNode(node);
    return list ? [list] : [];
  }
  if (tag === 'blockquote') {
    const content = children(node).flatMap((child) => blockNodes(child));
    const fallback = content.length ? content : [paragraphFrom(children(node))].filter(Boolean);
    return fallback.length ? [{ type: 'blockquote', content: fallback as RichTextNode[] }] : [];
  }
  if (tag === 'iframe') {
    const block = videoBlock(node);
    return block ? [block] : [];
  }
  if (tag === 'img') {
    const block = mappedImageBlock(node);
    if (block) return [block];
    const paragraph = paragraphFrom([node]);
    return paragraph ? [paragraph] : [];
  }
  const result: RichTextNode[] = [];
  let pendingInline: HtmlNode[] = [];
  const flush = () => {
    result.push(...blocksFromFlow(pendingInline));
    pendingInline = [];
  };
  for (const child of children(node)) {
    if (isElement(child) && BLOCK_ELEMENTS.has(child.tagName.toLowerCase())) {
      flush();
      result.push(...blockNodes(child));
    } else if (isElement(child) && child.tagName.toLowerCase() === 'iframe') {
      flush();
      result.push(...blockNodes(child));
    } else {
      pendingInline.push(child);
    }
  }
  flush();
  return result;
}

export function convertWordPressContent(
  sourceHtml: string,
  options: WordPressContentConversionOptions = {},
): WordPressContentConversion {
  const fragment = parseFragment(sourceHtml);
  const stats: MutableStats = {
    mappedImages: 0,
    externalImages: 0,
    videoEmbeds: 0,
    droppedUnsafeUrls: 0,
    droppedElements: 0,
  };
  const context: ConversionContext = {
    stats,
    imageMappings: options.images ?? [],
    imageIndex: 0,
    rewriteLink: options.rewriteLink,
    videoPosterMediaId: options.videoPosterMediaId,
    defaultVideoTitle: options.defaultVideoTitle,
  };
  const legacyContentHtml = fragment.childNodes
    .map((node) => sanitizeNode(node as HtmlNode, context))
    .join('')
    .trim();
  const sanitizedFragment = parseFragment(legacyContentHtml);
  const content = sanitizedFragment.childNodes.flatMap((node) => blockNodes(node as HtmlNode));
  const document: RichTextDocument = {
    type: 'doc',
    content: content.length ? content : [{ type: 'paragraph', content: [] }],
  };
  const validated = richTextDocumentSchema.parse(document);
  return {
    document: validated,
    contentHtml: renderRichText(validated),
    legacyContentHtml,
    plainText: richTextToPlainText(validated),
    stats,
  };
}

export function sanitizedPlainText(sourceHtml: string): string {
  const fragment = parseFragment(sourceHtml);
  const text = fragment.childNodes
    .flatMap((node) => blockNodes(node as HtmlNode))
    .map((node) => richTextToPlainText({ type: 'doc', content: [node] }))
    .join('\n');
  return text.replace(/\n{3,}/g, '\n\n').trim();
}
