import { mergeAttributes, Node, type JSONContent } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react';
import { createContext, Fragment, type ReactNode, useContext, useMemo } from 'react';
import type {
  ArticleImageGalleryAttributes,
  ArticleImageGalleryItem,
  ArticleImageAlignment,
  ArticleImagePresentation,
  ArticleImageRadius,
} from '@mukhtalif/types';
import { articleAdBlockAttributesSchema, articleImageLinkSchema } from '@mukhtalif/validation';
import type { ArticleMediaAsset } from '@/data';
import { normalizeArticleTextSectionAttributes } from './article-text-section';

export type ArticleMediaKind = 'image' | 'gallery' | 'video';
export type { ArticleImageAlignment, ArticleImagePresentation, ArticleImageRadius };
export type ImageGalleryAttributes = ArticleImageGalleryAttributes;
export type ImageGalleryItemAttributes = ArticleImageGalleryItem;

export function normalizeArticleImagePresentation(value: unknown): ArticleImagePresentation {
  return value === 'wide' ? 'wide' : 'content';
}

export function normalizeArticleImageAlignment(value: unknown): ArticleImageAlignment {
  return value === 'start' || value === 'end' ? value : 'center';
}

export function normalizeArticleImageRadius(value: unknown): ArticleImageRadius {
  return value === 'soft' || value === 'round' ? value : 'none';
}

export function normalizeArticleImageLink(value: unknown): string | undefined {
  const parsed = articleImageLinkSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export interface ImageBlockAttributes {
  readonly mediaId: string;
  readonly alt: string;
  readonly caption?: string;
  readonly linkUrl?: string;
  readonly presentation: ArticleImagePresentation;
  readonly alignment: ArticleImageAlignment;
  readonly radius: ArticleImageRadius;
}

export function normalizeArticleImageGalleryAttributes(value: unknown): ImageGalleryAttributes {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const seen = new Set<string>();
  const items: ImageGalleryItemAttributes[] = [];
  for (const candidate of Array.isArray(record.items) ? record.items : []) {
    if (!candidate || typeof candidate !== 'object') continue;
    const item = candidate as Record<string, unknown>;
    const mediaId = typeof item.mediaId === 'string' ? item.mediaId : '';
    if (!mediaId || seen.has(mediaId)) continue;
    seen.add(mediaId);
    items.push({
      mediaId,
      alt: typeof item.alt === 'string' ? item.alt : '',
    });
    if (items.length === 3) break;
  }
  const caption = typeof record.caption === 'string' ? record.caption.trim() : '';
  return { items, ...(caption ? { caption } : {}) };
}

export interface VideoEmbedAttributes {
  readonly provider: 'youtube' | 'vimeo';
  readonly videoId: string;
  readonly title: string;
  readonly posterMediaId: string;
  readonly caption?: string;
}

interface MediaEditorContextValue {
  readonly assets: ReadonlyMap<string, ArticleMediaAsset>;
  readonly disabled: boolean;
  edit(kind: ArticleMediaKind): void;
}

const MediaEditorContext = createContext<MediaEditorContextValue | null>(null);

export function ArticleMediaEditorProvider({
  assets,
  disabled,
  edit,
  children,
}: {
  readonly assets: readonly ArticleMediaAsset[];
  readonly disabled: boolean;
  readonly edit: (kind: ArticleMediaKind) => void;
  readonly children: ReactNode;
}) {
  const value = useMemo<MediaEditorContextValue>(
    () => ({
      assets: new Map(assets.map((asset) => [asset.id, asset])),
      disabled,
      edit,
    }),
    [assets, disabled, edit],
  );
  return <MediaEditorContext.Provider value={value}>{children}</MediaEditorContext.Provider>;
}

function ImageBlockNodeView({ node, editor, selected, deleteNode, getPos }: ReactNodeViewProps) {
  const context = useContext(MediaEditorContext);
  const attrs = node.attrs as ImageBlockAttributes;
  const asset = context?.assets.get(attrs.mediaId);
  const presentation = normalizeArticleImagePresentation(attrs.presentation);
  const alignment = normalizeArticleImageAlignment(attrs.alignment);
  const radius = normalizeArticleImageRadius(attrs.radius);
  const linkUrl = normalizeArticleImageLink(attrs.linkUrl);
  return (
    <NodeViewWrapper
      as="figure"
      className={`article-media-node article-media-node--image article-media-node--${presentation} article-media-node--align-${alignment} article-media-node--radius-${radius}${selected ? ' article-media-node--selected' : ''}`}
      data-presentation={presentation}
      data-alignment={alignment}
      data-radius={radius}
      data-drag-handle=""
    >
      {asset?.publicUrl ? (
        <img src={asset.publicUrl} alt={attrs.alt} draggable={false} />
      ) : (
        <div className="article-media-node__missing" role="status">
          تعذّر تحميل الصورة من المكتبة.
        </div>
      )}
      {attrs.caption ? <figcaption>{attrs.caption}</figcaption> : null}
      {linkUrl ? (
        <span className="article-media-node__link" dir="ltr" contentEditable={false}>
          {linkUrl}
        </span>
      ) : null}
      {editor.isEditable && !context?.disabled ? (
        <div className="article-media-node__actions" contentEditable={false}>
          <button
            type="button"
            onClick={() => {
              const position = getPos();
              if (typeof position === 'number') editor.commands.setNodeSelection(position);
              context?.edit('image');
            }}
          >
            تعديل الصورة
          </button>
          <button type="button" onClick={deleteNode}>
            إزالة الصورة
          </button>
        </div>
      ) : null}
    </NodeViewWrapper>
  );
}

function ImageGalleryNodeView({ node, editor, selected, deleteNode, getPos }: ReactNodeViewProps) {
  const context = useContext(MediaEditorContext);
  const attrs = normalizeArticleImageGalleryAttributes(node.attrs);
  return (
    <NodeViewWrapper
      as="figure"
      className={`article-media-node article-media-node--gallery${selected ? ' article-media-node--selected' : ''}`}
      data-article-image-gallery=""
      data-image-count={attrs.items.length}
      data-drag-handle=""
    >
      <div className="article-image-gallery__grid">
        {attrs.items.map((item, index) => {
          const asset = context?.assets.get(item.mediaId);
          return asset?.publicUrl ? (
            <img
              key={`${item.mediaId}-${index}`}
              src={asset.publicUrl}
              alt={item.alt}
              draggable={false}
            />
          ) : (
            <div
              key={`${item.mediaId}-${index}`}
              className="article-media-node__missing"
              role="status"
            >
              تعذّر تحميل الصورة {index + 1} من المكتبة.
            </div>
          );
        })}
      </div>
      {attrs.caption ? <figcaption>{attrs.caption}</figcaption> : null}
      {editor.isEditable && !context?.disabled ? (
        <div className="article-media-node__actions" contentEditable={false}>
          <button
            type="button"
            onClick={() => {
              const position = getPos();
              if (typeof position === 'number') editor.commands.setNodeSelection(position);
              context?.edit('gallery');
            }}
          >
            تعديل المعرض
          </button>
          <button type="button" onClick={deleteNode}>
            إزالة المعرض
          </button>
        </div>
      ) : null}
    </NodeViewWrapper>
  );
}

function VideoEmbedNodeView({ node, editor, selected, deleteNode, getPos }: ReactNodeViewProps) {
  const context = useContext(MediaEditorContext);
  const attrs = node.attrs as VideoEmbedAttributes;
  const poster = context?.assets.get(attrs.posterMediaId);
  return (
    <NodeViewWrapper
      as="figure"
      className={`article-media-node article-media-node--video${selected ? ' article-media-node--selected' : ''}`}
      data-drag-handle=""
    >
      {poster?.publicUrl ? (
        <div className="article-media-node__video-poster">
          <img src={poster.publicUrl} alt="" draggable={false} />
          <strong>{attrs.title}</strong>
          <span>{attrs.provider === 'youtube' ? 'YouTube' : 'Vimeo'}</span>
        </div>
      ) : (
        <div className="article-media-node__missing" role="status">
          تعذّر تحميل ملصق الفيديو.
        </div>
      )}
      {attrs.caption ? <figcaption>{attrs.caption}</figcaption> : null}
      {editor.isEditable && !context?.disabled ? (
        <div className="article-media-node__actions" contentEditable={false}>
          <button
            type="button"
            onClick={() => {
              const position = getPos();
              if (typeof position === 'number') editor.commands.setNodeSelection(position);
              context?.edit('video');
            }}
          >
            تعديل الفيديو
          </button>
          <button type="button" onClick={deleteNode}>
            إزالة الفيديو
          </button>
        </div>
      ) : null}
    </NodeViewWrapper>
  );
}

export const ArticleImageBlock = Node.create({
  name: 'imageBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      mediaId: { default: '' },
      alt: { default: '' },
      caption: { default: null },
      linkUrl: { default: null },
      presentation: { default: 'content' },
      alignment: { default: 'center' },
      radius: { default: 'none' },
    };
  },
  parseHTML() {
    return [{ tag: 'figure[data-article-image]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'figure',
      mergeAttributes(HTMLAttributes, { 'data-article-image': '' }),
      ['span', { 'data-media-placeholder': '' }, HTMLAttributes.alt || 'صورة'],
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageBlockNodeView);
  },
});

export const ArticleImageGallery = Node.create({
  name: 'imageGallery',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return {
      items: { default: [] },
      caption: { default: null },
    };
  },
  parseHTML() {
    return [{ tag: 'figure[data-article-image-gallery]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'figure',
      mergeAttributes(HTMLAttributes, { 'data-article-image-gallery': '' }),
      ['span', { 'data-media-placeholder': '' }, 'معرض صور'],
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageGalleryNodeView);
  },
});

export const ArticleVideoEmbed = Node.create({
  name: 'videoEmbed',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      provider: { default: 'youtube' },
      videoId: { default: '' },
      title: { default: '' },
      posterMediaId: { default: '' },
      caption: { default: null },
    };
  },
  parseHTML() {
    return [{ tag: 'figure[data-article-video]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'figure',
      mergeAttributes(HTMLAttributes, { 'data-article-video': '' }),
      ['span', { 'data-media-placeholder': '' }, HTMLAttributes.title || 'فيديو'],
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(VideoEmbedNodeView);
  },
});

export interface ParsedVideoUrl {
  readonly provider: 'youtube' | 'vimeo';
  readonly videoId: string;
  readonly canonicalUrl: string;
  readonly embedUrl: string;
}

export function parseArticleVideoUrl(value: string): ParsedVideoUrl | null {
  const input = value.trim();
  if (!input) return null;
  let url: URL;
  try {
    url = new URL(/^https:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, '');

  if (host === 'youtu.be' || host === 'youtube.com' || host === 'm.youtube.com') {
    const segments = url.pathname.split('/').filter(Boolean);
    const candidate =
      host === 'youtu.be'
        ? segments[0]
        : (url.searchParams.get('v') ??
          (['embed', 'shorts', 'live'].includes(segments[0] ?? '') ? segments[1] : undefined));
    if (!candidate || !/^[A-Za-z0-9_-]{11}$/.test(candidate)) return null;
    return {
      provider: 'youtube',
      videoId: candidate,
      canonicalUrl: `https://www.youtube.com/watch?v=${candidate}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${candidate}`,
    };
  }

  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const candidate = url.pathname
      .split('/')
      .filter(Boolean)
      .reverse()
      .find((part) => /^\d{6,12}$/.test(part));
    if (!candidate) return null;
    return {
      provider: 'vimeo',
      videoId: candidate,
      canonicalUrl: `https://vimeo.com/${candidate}`,
      embedUrl: `https://player.vimeo.com/video/${candidate}`,
    };
  }
  return null;
}

function canonicalVideoUrl(provider: VideoEmbedAttributes['provider'], videoId: string): string {
  return provider === 'youtube'
    ? `https://www.youtube.com/watch?v=${videoId}`
    : `https://vimeo.com/${videoId}`;
}

function embedVideoUrl(provider: VideoEmbedAttributes['provider'], videoId: string): string {
  return provider === 'youtube'
    ? `https://www.youtube-nocookie.com/embed/${videoId}`
    : `https://player.vimeo.com/video/${videoId}`;
}

function safePreviewHref(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.startsWith('//')) return undefined;
  if (value.startsWith('/') || value.startsWith('#')) return value;
  try {
    const url = new URL(value);
    return ['https:', 'mailto:'].includes(url.protocol) && !url.username && !url.password
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

function renderTextNode(node: JSONContent, key: string): ReactNode {
  let rendered: ReactNode = node.text ?? '';
  for (const [index, mark] of (node.marks ?? []).entries()) {
    if (mark.type === 'bold') rendered = <strong key={`${key}-b-${index}`}>{rendered}</strong>;
    if (mark.type === 'italic') rendered = <em key={`${key}-i-${index}`}>{rendered}</em>;
    if (mark.type === 'link') {
      const href = safePreviewHref(mark.attrs?.href);
      if (href)
        rendered = (
          <a key={`${key}-a-${index}`} href={href}>
            {rendered}
          </a>
        );
    }
  }
  return rendered;
}

function renderContentNode(
  node: JSONContent,
  key: string,
  assets: ReadonlyMap<string, ArticleMediaAsset>,
  channel: 'web' | 'email',
): ReactNode {
  if (node.type === 'text') return <Fragment key={key}>{renderTextNode(node, key)}</Fragment>;
  if (node.type === 'hardBreak') return <br key={key} />;
  const children = node.content?.map((child, index) =>
    renderContentNode(child, `${key}-${index}`, assets, channel),
  );
  if (node.type === 'textSection') {
    const attributes = normalizeArticleTextSectionAttributes(node.attrs);
    return (
      <section
        key={key}
        className={`article-text-section article-text-section--align-${attributes.alignment} article-text-section--height-${attributes.height} article-text-section--vertical-${attributes.vertical}`}
        dir={attributes.direction}
        data-article-text-section=""
        data-alignment={attributes.alignment}
        data-direction={attributes.direction}
        data-vertical={attributes.vertical}
        data-height={attributes.height}
      >
        {children}
      </section>
    );
  }
  if (node.type === 'paragraph') return <p key={key}>{children}</p>;
  if (node.type === 'heading') {
    return node.attrs?.level === 3 ? <h3 key={key}>{children}</h3> : <h2 key={key}>{children}</h2>;
  }
  if (node.type === 'bulletList') return <ul key={key}>{children}</ul>;
  if (node.type === 'orderedList') {
    const start = typeof node.attrs?.start === 'number' ? node.attrs.start : undefined;
    return (
      <ol key={key} start={start}>
        {children}
      </ol>
    );
  }
  if (node.type === 'listItem') return <li key={key}>{children}</li>;
  if (node.type === 'blockquote') return <blockquote key={key}>{children}</blockquote>;
  if (node.type === 'imageBlock') {
    const attrs = node.attrs as unknown as ImageBlockAttributes;
    const asset = assets.get(attrs.mediaId);
    const presentation = normalizeArticleImagePresentation(attrs.presentation);
    const alignment = normalizeArticleImageAlignment(attrs.alignment);
    const radius = normalizeArticleImageRadius(attrs.radius);
    const linkUrl = normalizeArticleImageLink(attrs.linkUrl);
    const image = asset?.publicUrl ? (
      <img src={asset.publicUrl} alt={attrs.alt} loading="lazy" />
    ) : null;
    const linkedImage =
      image && linkUrl ? (
        <a
          href={linkUrl}
          {...(!linkUrl.startsWith('/') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          {image}
        </a>
      ) : (
        image
      );
    return (
      <figure
        key={key}
        className={`article-content-media article-content-media--${presentation} article-content-media--align-${alignment} article-content-media--radius-${radius}`}
        data-presentation={presentation}
        data-alignment={alignment}
        data-radius={radius}
      >
        {linkedImage}
        {attrs.caption ? <figcaption>{attrs.caption}</figcaption> : null}
      </figure>
    );
  }
  if (node.type === 'imageGallery') {
    const attrs = normalizeArticleImageGalleryAttributes(node.attrs);
    return (
      <figure
        key={key}
        className="article-content-media article-content-media--gallery"
        data-article-image-gallery=""
        data-image-count={attrs.items.length}
      >
        <div className="article-image-gallery__grid">
          {attrs.items.map((item, index) => {
            const asset = assets.get(item.mediaId);
            return asset?.publicUrl ? (
              <img
                key={`${item.mediaId}-${index}`}
                src={asset.publicUrl}
                alt={item.alt}
                loading="lazy"
              />
            ) : null;
          })}
        </div>
        {attrs.caption ? <figcaption>{attrs.caption}</figcaption> : null}
      </figure>
    );
  }
  if (node.type === 'videoEmbed') {
    const attrs = node.attrs as unknown as VideoEmbedAttributes;
    const poster = assets.get(attrs.posterMediaId);
    const watchUrl = canonicalVideoUrl(attrs.provider, attrs.videoId);
    if (channel === 'email') {
      return (
        <figure key={key} className="article-content-media article-content-media--video-email">
          <a href={watchUrl} aria-label={`مشاهدة الفيديو: ${attrs.title}`}>
            {poster?.publicUrl ? <img src={poster.publicUrl} alt="" loading="lazy" /> : null}
            <strong>مشاهدة الفيديو: {attrs.title}</strong>
          </a>
          {attrs.caption ? <figcaption>{attrs.caption}</figcaption> : null}
        </figure>
      );
    }
    return (
      <figure key={key} className="article-content-media article-content-media--video">
        <div className="article-content-media__video-frame">
          <iframe
            src={embedVideoUrl(attrs.provider, attrs.videoId)}
            title={attrs.title}
            loading="lazy"
            allow="fullscreen; picture-in-picture"
            allowFullScreen
          />
        </div>
        {attrs.caption ? <figcaption>{attrs.caption}</figcaption> : null}
      </figure>
    );
  }
  if (node.type === 'adBlock') {
    if (channel === 'email') return null;
    const parsed = articleAdBlockAttributesSchema.safeParse(node.attrs);
    if (!parsed.success) return null;
    return (
      <aside
        key={key}
        className="article-ad-slot"
        data-article-ad=""
        data-ad-placement={parsed.data.placementId}
        data-ad-format={parsed.data.format}
        aria-label="مساحة إعلانية"
      >
        <span className="article-ad-slot__fallback">مساحة إعلانية</span>
      </aside>
    );
  }
  return <Fragment key={key}>{children}</Fragment>;
}

export function ArticleContentPreview({
  document,
  assets,
  channel,
}: {
  readonly document: JSONContent;
  readonly assets: readonly ArticleMediaAsset[];
  readonly channel: 'web' | 'email';
}) {
  const assetMap = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  return (
    <>
      {document.content?.map((node, index) =>
        renderContentNode(node, String(index), assetMap, channel),
      )}
    </>
  );
}
