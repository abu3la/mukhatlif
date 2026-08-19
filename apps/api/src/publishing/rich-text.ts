import type {
  ArticleImageAlignment,
  ArticleImagePresentation,
  ArticleImageRadius,
  ArticleTextAlignment,
  ArticleTextDirection,
  ArticleTextSectionHeight,
  ArticleTextVerticalAlignment,
  PublishedArticle,
  RichTextDocument,
  RichTextMark,
  RichTextNode,
} from '@mukhtalif/types';
import { hasMeaningfulArticleContent } from '@mukhtalif/validation';

const EMAIL_IMAGE_ALIGNMENT: Record<
  ArticleImageAlignment,
  { readonly html: 'left' | 'center' | 'right'; readonly imageMargin: string }
> = {
  start: { html: 'right', imageMargin: '0 0 0 auto' },
  center: { html: 'center', imageMargin: '0 auto' },
  end: { html: 'left', imageMargin: '0 auto 0 0' },
};

const WEB_IMAGE_PRESENTATION: Record<ArticleImagePresentation, string> = {
  content: 'width:100%;max-width:640px',
  wide: 'width:100%;max-width:none',
};

const WEB_IMAGE_ALIGNMENT: Record<ArticleImageAlignment, string> = {
  start: 'margin-inline-start:0;margin-inline-end:auto',
  center: 'margin-inline-start:auto;margin-inline-end:auto',
  end: 'margin-inline-start:auto;margin-inline-end:0',
};

const IMAGE_RADIUS: Record<ArticleImageRadius, string> = {
  none: '0',
  soft: '12px',
  round: '28px',
};

const TEXT_SECTION_MIN_HEIGHT: Record<ArticleTextSectionHeight, number> = {
  auto: 0,
  short: 120,
  medium: 200,
  tall: 320,
};

const TEXT_SECTION_JUSTIFY_CONTENT: Record<ArticleTextVerticalAlignment, string> = {
  top: 'flex-start',
  middle: 'center',
  bottom: 'flex-end',
};

const EMAIL_VERTICAL_ALIGNMENT: Record<ArticleTextVerticalAlignment, 'top' | 'middle' | 'bottom'> =
  {
    top: 'top',
    middle: 'middle',
    bottom: 'bottom',
  };

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function safeHref(value: string | undefined, relativeLinkBaseUrl?: string): string | null {
  if (!value) return null;
  if (value.startsWith('#')) return value;
  if (value.startsWith('/') && !value.startsWith('//')) {
    return relativeLinkBaseUrl ? new URL(value, `${relativeLinkBaseUrl}/`).toString() : value;
  }
  try {
    const url = new URL(value);
    return ['https:', 'mailto:'].includes(url.protocol) && !url.username && !url.password
      ? value
      : null;
  } catch {
    return null;
  }
}

function renderMark(value: string, mark: RichTextMark, relativeLinkBaseUrl?: string): string {
  if (mark.type === 'bold') return `<strong>${value}</strong>`;
  if (mark.type === 'italic') return `<em>${value}</em>`;
  if (mark.type !== 'link') return value;

  const href = safeHref(mark.attrs?.href, relativeLinkBaseUrl);
  if (!href) return value;
  const target = mark.attrs?.target === '_blank' ? ' target="_blank"' : '';
  const requestedRel = new Set((mark.attrs?.rel ?? '').split(/\s+/).filter(Boolean));
  const rel = new Set<string>();
  if (target) {
    rel.add('noopener');
    rel.add('noreferrer');
  }
  for (const token of ['nofollow', 'sponsored', 'ugc']) {
    if (requestedRel.has(token)) rel.add(token);
  }
  const relAttribute = rel.size ? ` rel="${[...rel].join(' ')}"` : '';
  return `<a href="${escapeHtml(href)}"${target}${relAttribute}>${value}</a>`;
}

function renderChildren(node: RichTextNode, relativeLinkBaseUrl?: string): string {
  return (node.content ?? []).map((child) => renderNode(child, { relativeLinkBaseUrl })).join('');
}

interface RichTextRenderOptions {
  relativeLinkBaseUrl?: string;
  mediaBaseUrl?: string;
  mode?: 'web' | 'email';
}

function mediaUrl(assetId: string | undefined, baseUrl?: string): string | null {
  if (!assetId) return null;
  const path = `/media/${encodeURIComponent(assetId)}`;
  return baseUrl ? new URL(path, `${baseUrl.replace(/\/$/, '')}/`).toString() : path;
}

function galleryItems(
  node: RichTextNode,
  mediaBaseUrl?: string,
): Array<{ src: string; alt: string }> | null {
  const source = node.attrs?.items;
  if (!source || (source.length !== 2 && source.length !== 3)) return null;
  const items = source.map((item) => ({
    src: mediaUrl(item.mediaId, mediaBaseUrl),
    alt: item.alt,
  }));
  if (items.some((item) => !item.src)) return null;
  return items as Array<{ src: string; alt: string }>;
}

function videoUrls(
  provider: 'youtube' | 'vimeo' | undefined,
  videoId: string | undefined,
): { embed: string; watch: string } | null {
  if (!provider || !videoId) return null;
  return provider === 'youtube'
    ? {
        embed: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`,
        watch: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
      }
    : {
        embed: `https://player.vimeo.com/video/${encodeURIComponent(videoId)}`,
        watch: `https://vimeo.com/${encodeURIComponent(videoId)}`,
      };
}

function imageAlignment(value: unknown): ArticleImageAlignment {
  return value === 'start' || value === 'end' ? value : 'center';
}

function imageRadius(value: unknown): ArticleImageRadius {
  return value === 'soft' || value === 'round' ? value : 'none';
}

function textAlignment(value: unknown): ArticleTextAlignment {
  return value === 'center' || value === 'end' || value === 'justify' ? value : 'start';
}

function textDirection(value: unknown): ArticleTextDirection {
  return value === 'ltr' ? 'ltr' : 'rtl';
}

function textVerticalAlignment(value: unknown): ArticleTextVerticalAlignment {
  return value === 'middle' || value === 'bottom' ? value : 'top';
}

function textSectionHeight(value: unknown): ArticleTextSectionHeight {
  return value === 'short' || value === 'medium' || value === 'tall' ? value : 'auto';
}

function emailTextAlignment(
  alignment: ArticleTextAlignment,
  direction: ArticleTextDirection,
): 'left' | 'center' | 'right' | 'justify' {
  if (alignment === 'center' || alignment === 'justify') return alignment;
  if (alignment === 'start') return direction === 'rtl' ? 'right' : 'left';
  return direction === 'rtl' ? 'left' : 'right';
}

function renderNode(node: RichTextNode, options: RichTextRenderOptions): string {
  const { relativeLinkBaseUrl, mediaBaseUrl, mode = 'web' } = options;
  switch (node.type) {
    case 'doc':
      return (node.content ?? []).map((child) => renderNode(child, options)).join('');
    case 'paragraph':
      return `<p>${renderChildren(node, relativeLinkBaseUrl)}</p>`;
    case 'heading': {
      const level = node.attrs?.level === 3 ? 3 : 2;
      return `<h${level}>${renderChildren(node, relativeLinkBaseUrl)}</h${level}>`;
    }
    case 'text': {
      const text = escapeHtml(node.text ?? '');
      return (node.marks ?? []).reduce(
        (value, mark) => renderMark(value, mark, relativeLinkBaseUrl),
        text,
      );
    }
    case 'bulletList':
      return `<ul>${renderChildren(node, relativeLinkBaseUrl)}</ul>`;
    case 'orderedList': {
      const start =
        node.attrs?.start && node.attrs.start !== 1 ? ` start="${node.attrs.start}"` : '';
      return `<ol${start}>${renderChildren(node, relativeLinkBaseUrl)}</ol>`;
    }
    case 'listItem':
      return `<li>${renderChildren(node, relativeLinkBaseUrl)}</li>`;
    case 'blockquote':
      return `<blockquote>${renderChildren(node, relativeLinkBaseUrl)}</blockquote>`;
    case 'hardBreak':
      return '<br>';
    case 'textSection': {
      const alignment = textAlignment(node.attrs?.alignment);
      const direction = textDirection(node.attrs?.direction);
      const height = textSectionHeight(node.attrs?.height);
      const vertical = height === 'auto' ? 'top' : textVerticalAlignment(node.attrs?.vertical);
      const minimumHeight = TEXT_SECTION_MIN_HEIGHT[height];
      const className = `article-text-section article-text-section--align-${alignment} article-text-section--height-${height} article-text-section--vertical-${vertical}`;
      const children = (node.content ?? []).map((child) => renderNode(child, options)).join('');
      if (mode === 'email') {
        const physicalAlignment = emailTextAlignment(alignment, direction);
        const heightAttribute = minimumHeight > 0 ? ` height="${minimumHeight}"` : '';
        const heightStyle = minimumHeight > 0 ? `height:${minimumHeight}px` : 'min-height:0';
        return `<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" dir="${direction}" style="width:100%;border-collapse:collapse;direction:${direction}"><tbody><tr><td${heightAttribute} valign="${EMAIL_VERTICAL_ALIGNMENT[vertical]}" align="${physicalAlignment}" dir="${direction}" style="${heightStyle};vertical-align:${EMAIL_VERTICAL_ALIGNMENT[vertical]};text-align:${physicalAlignment};direction:${direction}">${children}</td></tr></tbody></table>`;
      }
      return `<section class="${className}" data-article-text-section="" data-alignment="${alignment}" data-direction="${direction}" data-vertical="${vertical}" data-height="${height}" dir="${direction}" style="display:flex;flex-direction:column;justify-content:${TEXT_SECTION_JUSTIFY_CONTENT[vertical]};min-height:${minimumHeight}px;text-align:${alignment};direction:${direction}">${children}</section>`;
    }
    case 'imageBlock': {
      const src = mediaUrl(node.attrs?.mediaId, mediaBaseUrl);
      if (!src) return '';
      const alt = escapeHtml(node.attrs?.alt ?? '');
      const caption = escapeHtml(node.attrs?.caption ?? '');
      const alignment = imageAlignment(node.attrs?.alignment);
      const radius = imageRadius(node.attrs?.radius);
      if (mode === 'email') {
        const emailAlignment = EMAIL_IMAGE_ALIGNMENT[alignment];
        const image = `<img src="${escapeHtml(src)}" alt="${alt}" style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:${IMAGE_RADIUS[radius]};margin:${emailAlignment.imageMargin}">`;
        return `<div align="${emailAlignment.html}" style="margin:24px 0;text-align:${emailAlignment.html}">${image}${caption ? `<p style="margin:8px 0 0;color:#4A4E7C;font-size:14px;text-align:${emailAlignment.html}">${caption}</p>` : ''}</div>`;
      }
      const presentation = node.attrs?.presentation === 'wide' ? 'wide' : 'content';
      const figureStyle = `${WEB_IMAGE_PRESENTATION[presentation]};margin-block:24px;${WEB_IMAGE_ALIGNMENT[alignment]}`;
      const image = `<img src="${escapeHtml(src)}" alt="${alt}" style="display:block;width:100%;height:auto;border:0;border-radius:${IMAGE_RADIUS[radius]}" loading="lazy" decoding="async">`;
      return `<figure data-media-kind="image" data-presentation="${presentation}" data-alignment="${alignment}" data-radius="${radius}" style="${figureStyle}">${image}${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
    }
    case 'imageGallery': {
      const items = galleryItems(node, mediaBaseUrl);
      if (!items) return '';
      const columns = items.length;
      const caption = escapeHtml(node.attrs?.caption ?? '');
      if (mode === 'email') {
        const columnWidth = columns === 2 ? '50%' : '33.3333%';
        const maximumImageWidth = columns === 2 ? 300 : 200;
        const cells = items
          .map(
            (item) =>
              `<td width="${columnWidth}" valign="top" style="width:${columnWidth};vertical-align:top;padding:0 4px"><img src="${escapeHtml(item.src)}" alt="${escapeHtml(item.alt)}" style="display:block;width:100%;max-width:${maximumImageWidth}px;height:auto;border:0"></td>`,
          )
          .join('');
        return `<div data-media-kind="image-gallery" style="margin:24px 0"><table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" dir="rtl" style="width:100%;border-collapse:collapse;table-layout:fixed"><tbody><tr>${cells}</tr></tbody></table>${caption ? `<p style="margin:8px 4px 0;color:#4A4E7C;font-size:14px;text-align:right">${caption}</p>` : ''}</div>`;
      }
      const images = items
        .map(
          (item) =>
            `<div style="display:block;flex:1 1 180px;min-width:0"><img src="${escapeHtml(item.src)}" alt="${escapeHtml(item.alt)}" style="display:block;width:100%;height:auto;border:0" loading="lazy" decoding="async"></div>`,
        )
        .join('');
      return `<figure data-media-kind="image-gallery" data-image-count="${columns}" style="margin:24px 0"><div class="article-image-gallery__grid" style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start">${images}</div>${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
    }
    case 'videoEmbed': {
      const urls = videoUrls(node.attrs?.provider, node.attrs?.videoId);
      const poster = mediaUrl(node.attrs?.posterMediaId, mediaBaseUrl);
      if (!urls || !poster) return '';
      const title = escapeHtml(node.attrs?.title ?? 'فيديو');
      const caption = escapeHtml(node.attrs?.caption ?? '');
      if (mode === 'email') {
        return `<div style="margin:24px 0"><a href="${escapeHtml(urls.watch)}" style="color:#171A56;text-decoration:none"><img src="${escapeHtml(poster)}" alt="${title}" style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:8px"><span style="display:block;margin-top:8px;font-weight:700">شاهد الفيديو: ${title}</span></a>${caption ? `<p style="margin:8px 0 0;color:#4A4E7C;font-size:14px">${caption}</p>` : ''}</div>`;
      }
      return `<figure data-media-kind="video"><iframe src="${escapeHtml(urls.embed)}" title="${title}" style="display:block;border:0;border-radius:8px" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="encrypted-media; picture-in-picture" allowfullscreen></iframe>${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
    }
  }
}

export function renderRichText(
  document: RichTextDocument,
  options: RichTextRenderOptions = {},
): string {
  return `<div dir="rtl" lang="ar">${(document.content ?? [])
    .map((child) => renderNode(child, options))
    .join('')}</div>`;
}

function richTextNodeToPlainText(node: RichTextNode, relativeLinkBaseUrl?: string): string {
  const children = () =>
    (node.content ?? [])
      .map((child) => richTextNodeToPlainText(child, relativeLinkBaseUrl))
      .join('');
  switch (node.type) {
    case 'doc':
      return children();
    case 'text': {
      const text = node.text ?? '';
      const link = node.marks?.find((mark) => mark.type === 'link');
      const href = relativeLinkBaseUrl ? safeHref(link?.attrs?.href, relativeLinkBaseUrl) : null;
      return href && text.trim() !== href ? `${text} (${href})` : text;
    }
    case 'hardBreak':
      return '\n';
    case 'paragraph':
    case 'heading':
    case 'blockquote':
      return `${children()}\n\n`;
    case 'textSection':
      return children();
    case 'bulletList':
      return `${(node.content ?? [])
        .map((item) => `• ${richTextNodeToPlainText(item, relativeLinkBaseUrl).trim()}\n`)
        .join('')}\n`;
    case 'orderedList': {
      const start = node.attrs?.start ?? 1;
      return `${(node.content ?? [])
        .map(
          (item, index) =>
            `${start + index}. ${richTextNodeToPlainText(item, relativeLinkBaseUrl).trim()}\n`,
        )
        .join('')}\n`;
    }
    case 'listItem':
      return children();
    case 'imageBlock':
      return `${node.attrs?.caption ?? node.attrs?.alt ?? ''}\n\n`;
    case 'imageGallery': {
      const descriptions = (node.attrs?.items ?? []).map((item) => item.alt);
      if (node.attrs?.caption) descriptions.push(node.attrs.caption);
      return `${descriptions.join('\n')}\n\n`;
    }
    case 'videoEmbed': {
      const urls = videoUrls(node.attrs?.provider, node.attrs?.videoId);
      return `${node.attrs?.title ?? ''}${node.attrs?.caption ? `\n${node.attrs.caption}` : ''}${urls ? `\n${urls.watch}` : ''}\n\n`;
    }
  }
}

export function richTextToPlainText(document: RichTextDocument): string {
  return richTextNodeToPlainText(document)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function richTextToEmailPlainText(
  document: RichTextDocument,
  relativeLinkBaseUrl: string,
): string {
  return richTextNodeToPlainText(document, relativeLinkBaseUrl)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function hasMeaningfulRichText(document: RichTextDocument): boolean {
  return hasMeaningfulArticleContent(document);
}

export function documentFromPlainText(value: string): RichTextDocument {
  const paragraphs = value
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => {
      const lines = paragraph.split('\n');
      return {
        type: 'paragraph' as const,
        content: lines.flatMap((line, index) => [
          ...(index > 0 ? [{ type: 'hardBreak' as const }] : []),
          ...(line ? [{ type: 'text' as const, text: line }] : []),
        ]),
      };
    });
  return { type: 'doc', content: paragraphs };
}

export function toPublishedArticle(article: {
  id: string;
  slug: string;
  titleAr: string;
  titleEn?: string;
  author: { displayName: string };
  authorPlacement: PublishedArticle['authorPlacement'];
  excerptAr?: string;
  coverUrl?: string;
  coverAlt?: string;
  contentHtml: string;
  bodyAr: string;
  seo: PublishedArticle['seo'];
  status: PublishedArticle['status'];
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}): PublishedArticle {
  return {
    id: article.id,
    slug: article.slug,
    titleAr: article.titleAr,
    titleEn: article.titleEn,
    author: { displayName: article.author.displayName },
    authorPlacement: article.authorPlacement,
    excerptAr: article.excerptAr,
    coverUrl: article.coverUrl,
    coverAlt: article.coverAlt,
    contentHtml: article.contentHtml,
    bodyAr: article.bodyAr,
    seo: article.seo,
    status: article.status,
    publishedAt: article.publishedAt,
    createdAt: article.createdAt,
    updatedAt: article.updatedAt,
  };
}
