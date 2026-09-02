import { Node as TiptapNode } from '@tiptap/core';
import {
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type JSONContent,
  type ReactNodeViewProps,
  useEditor,
} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  ARTICLE_AD_FORMATS,
  type ArticleAdBlockAttributes,
  type ArticleAdFormat,
} from '@mukhtalif/types';
import { articleAdBlockAttributesSchema, articleAdPlacementIdSchema } from '@mukhtalif/validation';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Images,
  Italic,
  Link,
  List,
  ListOrdered,
  Megaphone,
  Pilcrow,
  PilcrowLeft,
  PilcrowRight,
  Quote,
  Redo2,
  Undo2,
  Unlink,
  Video,
  type LucideIcon,
} from 'lucide-react';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { ArticleMediaAsset, UploadArticleImageCommand } from '@/data';
import {
  ArticleImageBlock,
  ArticleImageGallery,
  ArticleMediaEditorProvider,
  ArticleVideoEmbed,
  type ArticleMediaKind,
  type ImageBlockAttributes,
  type ImageGalleryAttributes,
  normalizeArticleImageAlignment,
  normalizeArticleImageGalleryAttributes,
  normalizeArticleImageLink,
  normalizeArticleImagePresentation,
  normalizeArticleImageRadius,
  type VideoEmbedAttributes,
} from './article-media';
import { ArticleImageGalleryDialog } from './article-image-gallery-dialog';
import { ArticleMediaDialog } from './article-media-dialog';
import {
  ArticleTextSection,
  type ArticleTextSectionAttributes,
  normalizeArticleTextSectionAttributes,
} from './article-text-section';

export interface RichTextValue {
  readonly document: JSONContent;
  readonly html: string;
  readonly text: string;
}

interface RichTextEditorProps {
  readonly initialDocument: JSONContent;
  readonly onChange: (value: RichTextValue) => void;
  readonly disabled?: boolean;
  readonly required?: boolean;
  readonly invalid?: boolean;
  readonly describedBy?: string;
  readonly mediaAssets?: readonly ArticleMediaAsset[];
  readonly refreshMedia?: () => Promise<void>;
  readonly uploadImage?: (command: UploadArticleImageCommand) => Promise<ArticleMediaAsset>;
}

interface ToolbarIconMenuOption<Value extends string> {
  readonly value: Value;
  readonly label: string;
  readonly Icon: LucideIcon;
}

const MAX_ARTICLE_AD_BLOCKS = 12;

export function normalizeArticleAdBlockAttributes(value: unknown): ArticleAdBlockAttributes {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const placement = articleAdPlacementIdSchema.safeParse(record.placementId);
  const format: ArticleAdFormat = record.format === 'banner' ? 'banner' : 'inline';
  const base: ArticleAdBlockAttributes = {
    placementId: placement.success ? placement.data : '',
    format,
  };
  if (typeof record.label !== 'string' || !record.label.trim()) return base;
  const parsed = articleAdBlockAttributesSchema.safeParse({
    ...base,
    label: record.label,
  });
  return parsed.success ? parsed.data : base;
}

interface AdBlockEditorContextValue {
  readonly disabled: boolean;
  edit(attributes: ArticleAdBlockAttributes): void;
}

const AdBlockEditorContext = createContext<AdBlockEditorContextValue | null>(null);

function AdBlockEditorProvider({
  disabled,
  edit,
  children,
}: {
  readonly disabled: boolean;
  readonly edit: (attributes: ArticleAdBlockAttributes) => void;
  readonly children: ReactNode;
}) {
  const value = useMemo<AdBlockEditorContextValue>(() => ({ disabled, edit }), [disabled, edit]);
  return <AdBlockEditorContext.Provider value={value}>{children}</AdBlockEditorContext.Provider>;
}

function AdBlockNodeView({ node, editor, selected, deleteNode, getPos }: ReactNodeViewProps) {
  const context = useContext(AdBlockEditorContext);
  const attributes = normalizeArticleAdBlockAttributes(node.attrs);
  const formatLabel = attributes.format === 'banner' ? 'شريط إعلاني' : 'إعلان داخل المحتوى';
  const displayName = attributes.label || attributes.placementId || 'مساحة غير مكتملة';
  return (
    <NodeViewWrapper
      as="aside"
      className={`article-ad-node${selected ? ' article-ad-node--selected' : ''}`}
      data-article-ad-block=""
      data-ad-format={attributes.format}
      data-drag-handle=""
      aria-label={`مساحة إعلانية: ${displayName}`}
    >
      <div className="article-ad-node__summary" contentEditable={false}>
        <span className="article-ad-node__type">مساحة إعلانية</span>
        <strong>{displayName}</strong>
        <span>{formatLabel}</span>
        {attributes.placementId ? <code dir="ltr">{attributes.placementId}</code> : null}
      </div>
      {editor.isEditable && !context?.disabled ? (
        <div className="article-ad-node__actions" contentEditable={false}>
          <button
            type="button"
            onClick={() => {
              const position = getPos();
              if (typeof position === 'number') editor.commands.setNodeSelection(position);
              context?.edit(attributes);
            }}
          >
            تعديل المساحة
          </button>
          <button type="button" onClick={deleteNode}>
            إزالة المساحة
          </button>
        </div>
      ) : null}
    </NodeViewWrapper>
  );
}

const ArticleAdBlock = TiptapNode.create({
  name: 'adBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      placementId: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-ad-placement') ?? '',
        renderHTML: () => ({}),
      },
      format: {
        default: 'inline',
        parseHTML: (element) =>
          element.getAttribute('data-ad-format') === 'banner' ? 'banner' : 'inline',
        renderHTML: () => ({}),
      },
      label: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-ad-label'),
        renderHTML: () => ({}),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'aside[data-article-ad-block]' }];
  },
  renderHTML({ node }) {
    const attributes = normalizeArticleAdBlockAttributes(node.attrs);
    return [
      'aside',
      {
        'data-article-ad-block': '',
        'data-ad-placement': attributes.placementId,
        'data-ad-format': attributes.format,
      },
      ['span', {}, 'مساحة إعلانية'],
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(AdBlockNodeView);
  },
});

function ToolbarIconMenu<Value extends string>({
  label,
  title,
  value,
  disabled,
  Icon,
  options,
  open,
  onOpenChange,
  onSelect,
}: {
  readonly label: string;
  readonly title: string;
  readonly value: Value;
  readonly disabled: boolean;
  readonly Icon: LucideIcon;
  readonly options: readonly ToolbarIconMenuOption<Value>[];
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSelect: (value: Value) => void;
}) {
  const menuId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const focusFrame = requestAnimationFrame(() => {
      const selected = menuRef.current?.querySelector<HTMLElement>(
        '[role="menuitemradio"][aria-checked="true"]',
      );
      (selected ?? menuRef.current?.querySelector<HTMLElement>('[role="menuitemradio"]'))?.focus();
    });
    const closeFromOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !wrapperRef.current?.contains(event.target)) {
        onOpenChange(false);
      }
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onOpenChange(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', closeFromOutside);
    document.addEventListener('keydown', closeWithEscape);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener('pointerdown', closeFromOutside);
      document.removeEventListener('keydown', closeWithEscape);
    };
  }, [onOpenChange, open]);

  useEffect(() => {
    if (disabled && open) onOpenChange(false);
  }, [disabled, onOpenChange, open]);

  function moveMenuFocus(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [],
    );
    if (!items.length) return;
    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : event.key === 'ArrowDown'
            ? (Math.max(currentIndex, -1) + 1) % items.length
            : (currentIndex <= 0 ? items.length : currentIndex) - 1;
    items[nextIndex]?.focus();
  }

  return (
    <div
      ref={wrapperRef}
      className="article-rich-editor__toolbar-menu"
      onBlur={(event) => {
        if (
          open &&
          (!event.relatedTarget ||
            (event.relatedTarget instanceof Node &&
              !event.currentTarget.contains(event.relatedTarget)))
        ) {
          onOpenChange(false);
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="article-rich-editor__tool article-rich-editor__toolbar-menu-trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        title={title}
        disabled={disabled}
        onClick={() => onOpenChange(!open)}
      >
        <Icon aria-hidden="true" focusable="false" size={19} strokeWidth={1.9} />
        <ChevronDown aria-hidden="true" focusable="false" size={14} strokeWidth={1.9} />
      </button>
      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          className="article-rich-editor__toolbar-menu-popup"
          role="menu"
          aria-label={label}
          onKeyDown={moveMenuFocus}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-label={option.label}
              aria-checked={option.value === value}
              title={option.label}
              tabIndex={-1}
              onClick={() => {
                onSelect(option.value);
                onOpenChange(false);
                requestAnimationFrame(() => triggerRef.current?.focus());
              }}
            >
              <option.Icon aria-hidden="true" focusable="false" size={19} strokeWidth={1.9} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function isAllowedArticleLink(url: string): boolean {
  const normalized = url.trim();
  if (!normalized || normalized.startsWith('//')) return false;
  if (normalized.startsWith('/') || normalized.startsWith('#')) return true;
  try {
    const parsed = new URL(normalized);
    return (
      (parsed.protocol === 'https:' || parsed.protocol === 'mailto:') &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}

/**
 * Keep the canonical document inside the deliberately small schema accepted by
 * the publishing API. Tiptap's Link mark includes nullable presentation attrs
 * that are not editorial data, so they are removed before persistence.
 */
export function normalizeArticleDocument(document: JSONContent): JSONContent {
  const normalized: JSONContent = { type: document.type };

  if (document.text !== undefined) normalized.text = document.text;
  if (document.attrs) {
    if (document.type === 'heading' && (document.attrs.level === 2 || document.attrs.level === 3)) {
      normalized.attrs = { level: document.attrs.level };
    }
    if (document.type === 'orderedList') {
      const attrs: Record<string, number | string | null> = {};
      if (typeof document.attrs.start === 'number') attrs.start = document.attrs.start;
      if (typeof document.attrs.type === 'string' || document.attrs.type === null) {
        attrs.type = document.attrs.type;
      }
      if (Object.keys(attrs).length) normalized.attrs = attrs;
    }
    if (document.type === 'imageBlock') {
      const linkUrl = normalizeArticleImageLink(document.attrs.linkUrl);
      normalized.attrs = {
        mediaId: String(document.attrs.mediaId ?? ''),
        alt: String(document.attrs.alt ?? ''),
        ...(typeof document.attrs.caption === 'string' && document.attrs.caption.trim()
          ? { caption: document.attrs.caption.trim() }
          : {}),
        ...(linkUrl ? { linkUrl } : {}),
        presentation: normalizeArticleImagePresentation(document.attrs.presentation),
        alignment: normalizeArticleImageAlignment(document.attrs.alignment),
        radius: normalizeArticleImageRadius(document.attrs.radius),
      };
    }
    if (document.type === 'imageGallery') {
      normalized.attrs = normalizeArticleImageGalleryAttributes(document.attrs);
    }
    if (document.type === 'videoEmbed') {
      normalized.attrs = {
        provider: document.attrs.provider === 'vimeo' ? 'vimeo' : 'youtube',
        videoId: String(document.attrs.videoId ?? ''),
        title: String(document.attrs.title ?? ''),
        posterMediaId: String(document.attrs.posterMediaId ?? ''),
        ...(typeof document.attrs.caption === 'string' && document.attrs.caption.trim()
          ? { caption: document.attrs.caption.trim() }
          : {}),
      };
    }
    if (document.type === 'textSection') {
      normalized.attrs = normalizeArticleTextSectionAttributes(document.attrs);
    }
    if (document.type === 'adBlock') {
      normalized.attrs = normalizeArticleAdBlockAttributes(document.attrs);
    }
  }
  if (document.content) {
    normalized.content = document.content.map((node) => normalizeArticleDocument(node));
  }
  if (document.marks) {
    normalized.marks = document.marks.map((mark) => {
      if (mark.type !== 'link') return { type: mark.type };

      const attrs: Record<string, string> = {};
      const href = mark.attrs?.href;
      const target = mark.attrs?.target;
      const rel = mark.attrs?.rel;
      if (typeof href === 'string') attrs.href = href;
      if (typeof target === 'string') attrs.target = target;
      if (typeof rel === 'string') attrs.rel = rel;
      return { type: 'link', attrs };
    });
  }

  return normalized;
}

export const EMPTY_ARTICLE_DOCUMENT: JSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

const editorExtensions = [
  StarterKit.configure({
    heading: { levels: [2, 3] },
    link: {
      autolink: true,
      linkOnPaste: true,
      openOnClick: false,
      isAllowedUri: (url) => isAllowedArticleLink(url),
      shouldAutoLink: (url) => isAllowedArticleLink(url),
      HTMLAttributes: {
        rel: 'noopener noreferrer',
      },
    },
    code: false,
    codeBlock: false,
    horizontalRule: false,
    strike: false,
    underline: false,
  }),
  ArticleImageBlock,
  ArticleImageGallery,
  ArticleVideoEmbed,
  ArticleTextSection,
  ArticleAdBlock,
];

export function RichTextEditor({
  initialDocument,
  onChange,
  disabled = false,
  required = false,
  invalid = false,
  describedBy,
  mediaAssets = [],
  refreshMedia,
  uploadImage,
}: RichTextEditorProps) {
  const linkInputId = useId();
  const adPlacementInputId = useId();
  const adLabelInputId = useId();
  const adFormatInputId = useId();
  const adErrorId = useId();
  const [isLinkEditorOpen, setIsLinkEditorOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkError, setLinkError] = useState('');
  const [openTextLayoutMenu, setOpenTextLayoutMenu] = useState<'alignment' | 'direction' | null>(
    null,
  );
  const setAlignmentMenuOpen = useCallback(
    (open: boolean) => setOpenTextLayoutMenu(open ? 'alignment' : null),
    [],
  );
  const setDirectionMenuOpen = useCallback(
    (open: boolean) => setOpenTextLayoutMenu(open ? 'direction' : null),
    [],
  );
  const imageTriggerRef = useRef<HTMLButtonElement>(null);
  const galleryTriggerRef = useRef<HTMLButtonElement>(null);
  const videoTriggerRef = useRef<HTMLButtonElement>(null);
  const adTriggerRef = useRef<HTMLButtonElement>(null);
  const mediaOpenerRef = useRef<HTMLElement | null>(null);
  const adOpenerRef = useRef<HTMLElement | null>(null);
  const [mediaDialog, setMediaDialog] = useState<
    | { readonly kind: 'image'; readonly attributes?: ImageBlockAttributes }
    | { readonly kind: 'gallery'; readonly attributes?: ImageGalleryAttributes }
    | { readonly kind: 'video'; readonly attributes?: VideoEmbedAttributes }
    | null
  >(null);
  const [mediaError, setMediaError] = useState('');
  const [adEditor, setAdEditor] = useState<{
    readonly editing: boolean;
    readonly placementId: string;
    readonly label: string;
    readonly format: ArticleAdFormat;
  } | null>(null);
  const [adError, setAdError] = useState('');
  const editor = useEditor({
    extensions: editorExtensions,
    content: initialDocument,
    editable: !disabled,
    immediatelyRender: true,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        class: 'article-rich-editor__surface',
        dir: 'rtl',
        role: 'textbox',
        'aria-label': 'محتوى المقال',
        'aria-multiline': 'true',
        'aria-readonly': String(disabled),
        'aria-required': String(required),
        'aria-invalid': String(invalid),
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
        spellcheck: 'true',
      },
    },
    onUpdate: ({ editor: currentEditor, transaction }) => {
      if (!transaction.docChanged) return;
      onChange({
        document: normalizeArticleDocument(currentEditor.getJSON()),
        html: currentEditor.getHTML(),
        text: currentEditor.getText({ blockSeparator: '\n\n' }),
      });
    },
  });

  useEffect(() => {
    if (editor && editor.isEditable === disabled) {
      editor.setEditable(!disabled);
    }
    editor?.view.dom.setAttribute('aria-readonly', String(disabled));
    editor?.view.dom.setAttribute('aria-required', String(required));
    editor?.view.dom.setAttribute('aria-invalid', String(invalid));
    if (describedBy) editor?.view.dom.setAttribute('aria-describedby', describedBy);
    else editor?.view.dom.removeAttribute('aria-describedby');
    if (disabled) {
      setIsLinkEditorOpen(false);
      setAdEditor(null);
    }
  }, [describedBy, disabled, editor, invalid, required]);

  function openLinkEditor() {
    const existingHref = editor?.getAttributes('link').href;
    setLinkUrl(typeof existingHref === 'string' ? existingHref : '');
    setLinkError('');
    setIsLinkEditorOpen(true);
  }

  function saveLink() {
    if (!editor) return;

    const normalizedUrl = linkUrl.trim();
    if (!normalizedUrl) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      setIsLinkEditorOpen(false);
      return;
    }
    if (!isAllowedArticleLink(normalizedUrl)) {
      setLinkError('اكتب رابطًا يبدأ بـ https:// أو mailto: أو / أو #.');
      return;
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: normalizedUrl }).run();
    setLinkError('');
    setIsLinkEditorOpen(false);
  }

  const openMediaEditor = useCallback(
    (kind: ArticleMediaKind) => {
      if (!editor || disabled || !refreshMedia || !uploadImage) return;
      mediaOpenerRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setMediaError('');
      if (kind === 'image' && editor.isActive('imageBlock')) {
        setMediaDialog({
          kind,
          attributes: editor.getAttributes('imageBlock') as ImageBlockAttributes,
        });
        return;
      }
      if (kind === 'gallery' && editor.isActive('imageGallery')) {
        setMediaDialog({
          kind,
          attributes: normalizeArticleImageGalleryAttributes(editor.getAttributes('imageGallery')),
        });
        return;
      }
      if (kind === 'video' && editor.isActive('videoEmbed')) {
        setMediaDialog({
          kind,
          attributes: editor.getAttributes('videoEmbed') as VideoEmbedAttributes,
        });
        return;
      }
      setMediaDialog({ kind });
    },
    [disabled, editor, refreshMedia, uploadImage],
  );

  const openAdEditor = useCallback(
    (attributes?: ArticleAdBlockAttributes) => {
      if (!editor || disabled) return;
      adOpenerRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const current = normalizeArticleAdBlockAttributes(
        attributes ?? (editor.isActive('adBlock') ? editor.getAttributes('adBlock') : undefined),
      );
      setAdError('');
      setAdEditor({
        editing: Boolean(attributes || editor.isActive('adBlock')),
        placementId: current.placementId,
        label: current.label ?? '',
        format: current.format,
      });
    },
    [disabled, editor],
  );

  if (!editor) {
    return (
      <div className="article-rich-editor article-rich-editor--loading">جارٍ تجهيز المحرر…</div>
    );
  }

  function closeMediaEditor() {
    const fallback =
      mediaDialog?.kind === 'video'
        ? videoTriggerRef.current
        : mediaDialog?.kind === 'gallery'
          ? galleryTriggerRef.current
          : imageTriggerRef.current;
    const opener = mediaOpenerRef.current;
    setMediaDialog(null);
    requestAnimationFrame(() => {
      if (opener?.isConnected) opener.focus();
      else fallback?.focus();
      mediaOpenerRef.current = null;
    });
  }

  function closeAdEditor() {
    const opener = adOpenerRef.current;
    setAdEditor(null);
    setAdError('');
    requestAnimationFrame(() => {
      if (opener?.isConnected) opener.focus();
      else adTriggerRef.current?.focus();
      adOpenerRef.current = null;
    });
  }

  function saveAdBlock() {
    if (!editor || !adEditor) return;
    const candidate = {
      placementId: adEditor.placementId,
      format: adEditor.format,
      ...(adEditor.label.trim() ? { label: adEditor.label } : {}),
    };
    if (!articleAdPlacementIdSchema.safeParse(candidate.placementId).success) {
      setAdError('استخدم أحرفًا إنجليزية صغيرة وأرقامًا وشرطات، مثل article-middle-1.');
      return;
    }
    const parsed = articleAdBlockAttributesSchema.safeParse(candidate);
    if (!parsed.success) {
      setAdError('اسم المساحة يجب أن يكون سطرًا واحدًا وبحد أقصى 80 حرفًا.');
      return;
    }
    if (!adEditor.editing && countNodes('adBlock') >= MAX_ARTICLE_AD_BLOCKS) {
      setAdError(`وصل المقال إلى الحد الأقصى: ${MAX_ARTICLE_AD_BLOCKS} مساحة إعلانية.`);
      return;
    }
    const chain = editor.chain().focus();
    if (adEditor.editing) {
      chain.updateAttributes('adBlock', { ...parsed.data, label: parsed.data.label ?? null }).run();
    } else chain.insertContent({ type: 'adBlock', attrs: parsed.data }).run();
    closeAdEditor();
  }

  function removeAdBlock() {
    if (!editor || !adEditor?.editing) return;
    if (editor.isActive('adBlock')) editor.chain().focus().deleteSelection().run();
    closeAdEditor();
  }

  function countNodes(type: 'imageBlock' | 'videoEmbed' | 'adBlock'): number {
    if (!editor) return 0;
    let count = 0;
    editor.state.doc.descendants((node) => {
      if (node.type.name === type) count += 1;
      return true;
    });
    return count;
  }

  function countArticleImages(): number {
    if (!editor) return 0;
    let count = 0;
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'imageBlock') count += 1;
      if (node.type.name === 'imageGallery') {
        count += normalizeArticleImageGalleryAttributes(node.attrs).items.length;
      }
      return true;
    });
    return count;
  }

  const selectedGalleryItems = editor.isActive('imageGallery')
    ? normalizeArticleImageGalleryAttributes(editor.getAttributes('imageGallery')).items.length
    : 0;
  const galleryAvailableSlots = Math.max(0, 30 - countArticleImages() + selectedGalleryItems);

  function commitMedia(
    kind: ArticleMediaKind,
    attributes: ImageBlockAttributes | ImageGalleryAttributes | VideoEmbedAttributes,
  ) {
    if (!editor) return;
    const nodeName =
      kind === 'image' ? 'imageBlock' : kind === 'gallery' ? 'imageGallery' : 'videoEmbed';
    if (editor.isActive(nodeName)) {
      if (kind === 'gallery') {
        const currentCount = normalizeArticleImageGalleryAttributes(
          editor.getAttributes('imageGallery'),
        ).items.length;
        const nextCount = (attributes as ImageGalleryAttributes).items.length;
        if (countArticleImages() - currentCount + nextCount > 30) {
          setMediaError('وصل المقال إلى الحد الأقصى: 30 صورة.');
          closeMediaEditor();
          return;
        }
      }
      editor.chain().focus().updateAttributes(nodeName, attributes).run();
      closeMediaEditor();
      return;
    }
    if (kind === 'gallery') {
      const nextCount = (attributes as ImageGalleryAttributes).items.length;
      if (countArticleImages() + nextCount > 30) {
        setMediaError('وصل المقال إلى الحد الأقصى: 30 صورة.');
        closeMediaEditor();
        return;
      }
    }
    const maximum = kind === 'video' ? 5 : 30;
    const currentCount = kind === 'video' ? countNodes('videoEmbed') : countArticleImages();
    if (currentCount >= maximum) {
      setMediaError(
        kind === 'video'
          ? 'وصل المقال إلى الحد الأقصى: 5 فيديوهات.'
          : 'وصل المقال إلى الحد الأقصى: 30 صورة.',
      );
      closeMediaEditor();
      return;
    }
    editor.chain().focus().insertContent({ type: nodeName, attrs: attributes }).run();
    closeMediaEditor();
  }

  function removeSelectedMedia() {
    if (!editor || !mediaDialog) return;
    const nodeName =
      mediaDialog.kind === 'image'
        ? 'imageBlock'
        : mediaDialog.kind === 'gallery'
          ? 'imageGallery'
          : 'videoEmbed';
    if (editor.isActive(nodeName)) editor.chain().focus().deleteSelection().run();
    closeMediaEditor();
  }

  let selectionContainsMedia = false;
  editor.state.doc.nodesBetween(editor.state.selection.from, editor.state.selection.to, (node) => {
    if (
      node.type.name === 'imageBlock' ||
      node.type.name === 'imageGallery' ||
      node.type.name === 'videoEmbed' ||
      node.type.name === 'adBlock'
    ) {
      selectionContainsMedia = true;
      return false;
    }
    return true;
  });
  const mediaIsSelected =
    selectionContainsMedia ||
    editor.isActive('imageBlock') ||
    editor.isActive('imageGallery') ||
    editor.isActive('videoEmbed') ||
    editor.isActive('adBlock');
  const textSectionIsActive = editor.isActive('textSection');
  const textSectionAttributes = normalizeArticleTextSectionAttributes(
    textSectionIsActive ? editor.getAttributes('textSection') : undefined,
  );
  const selectionIsAtDocumentLevel =
    editor.state.selection.$from.depth === 1 && editor.state.selection.$to.depth === 1;
  const galleryIsActive = editor.isActive('imageGallery');
  const adBlockIsActive = editor.isActive('adBlock');
  const canOpenGallery = galleryIsActive || (!mediaIsSelected && selectionIsAtDocumentLevel);
  const galleryToolbarLabel = galleryIsActive
    ? 'تعديل معرض الصور'
    : canOpenGallery
      ? 'معرض صور'
      : 'أضف المعرض بين فقرات المقال';
  const reachedAdLimit = countNodes('adBlock') >= MAX_ARTICLE_AD_BLOCKS;
  const canOpenAdBlock =
    adBlockIsActive || (!mediaIsSelected && selectionIsAtDocumentLevel && !reachedAdLimit);
  const adToolbarLabel = adBlockIsActive
    ? 'تعديل المساحة الإعلانية'
    : reachedAdLimit
      ? `وصل المقال إلى ${MAX_ARTICLE_AD_BLOCKS} مساحة إعلانية`
      : canOpenAdBlock
        ? 'مساحة إعلانية'
        : 'أضف الإعلان بين فقرات المقال';
  const canCreateTextSection =
    !mediaIsSelected &&
    (textSectionIsActive ||
      (selectionIsAtDocumentLevel && editor.can().wrapIn('textSection', textSectionAttributes)));

  function updateTextSectionAttribute<Key extends keyof ArticleTextSectionAttributes>(
    key: Key,
    value: ArticleTextSectionAttributes[Key],
  ) {
    if (!canCreateTextSection) return;
    const nextAttributes = {
      ...textSectionAttributes,
      [key]: value,
      ...(key === 'height' && value === 'auto' ? { vertical: 'top' as const } : {}),
    };
    const chain = editor.chain().focus();
    if (textSectionIsActive) chain.updateAttributes('textSection', nextAttributes).run();
    else chain.wrapIn('textSection', nextAttributes).run();
  }

  const horizontalAlignmentLabel =
    textSectionAttributes.alignment === 'center'
      ? 'وسط'
      : textSectionAttributes.alignment === 'justify'
        ? 'ضبط'
        : textSectionAttributes.alignment === 'start'
          ? textSectionAttributes.direction === 'rtl'
            ? 'يمين'
            : 'يسار'
          : textSectionAttributes.direction === 'rtl'
            ? 'يسار'
            : 'يمين';
  const HorizontalAlignmentIcon: LucideIcon =
    horizontalAlignmentLabel === 'وسط'
      ? AlignCenter
      : horizontalAlignmentLabel === 'ضبط'
        ? AlignJustify
        : horizontalAlignmentLabel === 'يمين'
          ? AlignRight
          : AlignLeft;
  const DirectionIcon = textSectionAttributes.direction === 'rtl' ? PilcrowRight : PilcrowLeft;
  const layoutUnavailableTitle = mediaIsSelected
    ? 'حدد نصًا لتغيير التنسيق'
    : !textSectionIsActive && !selectionIsAtDocumentLevel
      ? 'التنسيق متاح للفقرات والعناوين المستقلة'
      : 'حدد فقرة أو عنوانًا مستقلًا';
  const alignmentOptions: readonly ToolbarIconMenuOption<
    ArticleTextSectionAttributes['alignment']
  >[] = [
    {
      value: textSectionAttributes.direction === 'rtl' ? 'start' : 'end',
      label: 'يمين',
      Icon: AlignRight,
    },
    { value: 'center', label: 'وسط', Icon: AlignCenter },
    {
      value: textSectionAttributes.direction === 'rtl' ? 'end' : 'start',
      label: 'يسار',
      Icon: AlignLeft,
    },
    { value: 'justify', label: 'ضبط', Icon: AlignJustify },
  ];
  const directionOptions: readonly ToolbarIconMenuOption<
    ArticleTextSectionAttributes['direction']
  >[] = [
    { value: 'rtl', label: 'من اليمين إلى اليسار', Icon: PilcrowRight },
    { value: 'ltr', label: 'من اليسار إلى اليمين', Icon: PilcrowLeft },
  ];

  const tool = (
    label: string,
    Icon: LucideIcon,
    active: boolean | undefined,
    disabledState: boolean,
    onClick: () => void,
  ) => (
    <button
      type="button"
      className="article-rich-editor__tool"
      aria-label={label}
      title={label}
      {...(active === undefined ? {} : { 'aria-pressed': active })}
      disabled={disabled || disabledState}
      onClick={onClick}
    >
      <Icon aria-hidden="true" focusable="false" size={19} strokeWidth={1.9} />
    </button>
  );

  return (
    <div className="article-rich-editor">
      <div className="article-rich-editor__toolbar" role="toolbar" aria-label="تنسيق المحتوى">
        {tool('نص', Pilcrow, editor.isActive('paragraph'), false, () =>
          editor.chain().focus().setParagraph().run(),
        )}
        {tool('عنوان 2', Heading2, editor.isActive('heading', { level: 2 }), false, () =>
          editor.chain().focus().toggleHeading({ level: 2 }).run(),
        )}
        {tool('عنوان 3', Heading3, editor.isActive('heading', { level: 3 }), false, () =>
          editor.chain().focus().toggleHeading({ level: 3 }).run(),
        )}
        {tool('عريض', Bold, editor.isActive('bold'), !editor.can().chain().toggleBold().run(), () =>
          editor.chain().focus().toggleBold().run(),
        )}
        {tool(
          'مائل',
          Italic,
          editor.isActive('italic'),
          !editor.can().chain().toggleItalic().run(),
          () => editor.chain().focus().toggleItalic().run(),
        )}
        {tool('نقاط', List, editor.isActive('bulletList'), false, () =>
          editor.chain().focus().toggleBulletList().run(),
        )}
        {tool('ترقيم', ListOrdered, editor.isActive('orderedList'), false, () =>
          editor.chain().focus().toggleOrderedList().run(),
        )}
        {tool('اقتباس', Quote, editor.isActive('blockquote'), false, () =>
          editor.chain().focus().toggleBlockquote().run(),
        )}
        <ToolbarIconMenu
          label="محاذاة النص"
          title={
            canCreateTextSection
              ? `محاذاة النص: ${horizontalAlignmentLabel}`
              : layoutUnavailableTitle
          }
          value={textSectionAttributes.alignment}
          disabled={disabled || !canCreateTextSection}
          Icon={HorizontalAlignmentIcon}
          options={alignmentOptions}
          open={openTextLayoutMenu === 'alignment'}
          onOpenChange={setAlignmentMenuOpen}
          onSelect={(value) => updateTextSectionAttribute('alignment', value)}
        />
        <ToolbarIconMenu
          label="اتجاه النص"
          title={
            canCreateTextSection
              ? `اتجاه النص: ${
                  textSectionAttributes.direction === 'rtl'
                    ? 'من اليمين إلى اليسار'
                    : 'من اليسار إلى اليمين'
                }`
              : layoutUnavailableTitle
          }
          value={textSectionAttributes.direction}
          disabled={disabled || !canCreateTextSection}
          Icon={DirectionIcon}
          options={directionOptions}
          open={openTextLayoutMenu === 'direction'}
          onOpenChange={setDirectionMenuOpen}
          onSelect={(value) => updateTextSectionAttribute('direction', value)}
        />
        <button
          type="button"
          className="article-rich-editor__tool"
          aria-label="رابط"
          title="رابط"
          aria-pressed={editor.isActive('link') || isLinkEditorOpen}
          disabled={disabled || editor.state.selection.empty}
          onClick={openLinkEditor}
        >
          <Link aria-hidden="true" focusable="false" size={19} strokeWidth={1.9} />
        </button>
        <button
          type="button"
          className="article-rich-editor__tool"
          aria-label="إزالة الرابط"
          title="إزالة الرابط"
          disabled={disabled || !editor.isActive('link')}
          onClick={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()}
        >
          <Unlink aria-hidden="true" focusable="false" size={19} strokeWidth={1.9} />
        </button>
        <button
          ref={imageTriggerRef}
          type="button"
          className="article-rich-editor__tool"
          aria-label={editor.isActive('imageBlock') ? 'تعديل الصورة' : 'رفع صورة'}
          title={editor.isActive('imageBlock') ? 'تعديل الصورة' : 'رفع صورة'}
          aria-pressed={editor.isActive('imageBlock') || mediaDialog?.kind === 'image'}
          disabled={disabled || !refreshMedia || !uploadImage}
          onClick={() => openMediaEditor('image')}
        >
          <ImageIcon aria-hidden="true" focusable="false" size={19} strokeWidth={1.9} />
        </button>
        <button
          ref={galleryTriggerRef}
          type="button"
          className="article-rich-editor__tool"
          aria-label={galleryToolbarLabel}
          title={galleryToolbarLabel}
          aria-pressed={galleryIsActive || mediaDialog?.kind === 'gallery'}
          disabled={disabled || !refreshMedia || !uploadImage || !canOpenGallery}
          onClick={() => openMediaEditor('gallery')}
        >
          <Images aria-hidden="true" focusable="false" size={19} strokeWidth={1.9} />
        </button>
        <button
          ref={videoTriggerRef}
          type="button"
          className="article-rich-editor__tool"
          aria-label={editor.isActive('videoEmbed') ? 'تعديل الفيديو' : 'فيديو'}
          title={editor.isActive('videoEmbed') ? 'تعديل الفيديو' : 'فيديو'}
          aria-pressed={editor.isActive('videoEmbed') || mediaDialog?.kind === 'video'}
          disabled={disabled || !refreshMedia || !uploadImage}
          onClick={() => openMediaEditor('video')}
        >
          <Video aria-hidden="true" focusable="false" size={19} strokeWidth={1.9} />
        </button>
        <button
          ref={adTriggerRef}
          type="button"
          className="article-rich-editor__tool"
          aria-label={adToolbarLabel}
          title={adToolbarLabel}
          aria-pressed={adBlockIsActive || Boolean(adEditor)}
          disabled={disabled || !canOpenAdBlock}
          onClick={() => openAdEditor()}
        >
          <Megaphone aria-hidden="true" focusable="false" size={19} strokeWidth={1.9} />
        </button>
        {tool('تراجع', Undo2, undefined, !editor.can().undo(), () =>
          editor.chain().focus().undo().run(),
        )}
        {tool('إعادة', Redo2, undefined, !editor.can().redo(), () =>
          editor.chain().focus().redo().run(),
        )}
      </div>

      {isLinkEditorOpen ? (
        <div className="article-rich-editor__link-form" role="group" aria-label="تحرير الرابط">
          <label htmlFor={linkInputId}>رابط النص المحدد</label>
          <input
            id={linkInputId}
            className="control"
            dir="ltr"
            value={linkUrl}
            disabled={disabled}
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://example.com"
            onChange={(event) => setLinkUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                saveLink();
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                setIsLinkEditorOpen(false);
              }
            }}
          />
          <button
            type="button"
            className="button button--primary"
            disabled={disabled}
            onClick={saveLink}
          >
            تطبيق الرابط
          </button>
          <button
            type="button"
            className="button button--quiet"
            disabled={disabled}
            onClick={() => setIsLinkEditorOpen(false)}
          >
            إلغاء
          </button>
          {linkError ? (
            <p className="article-rich-editor__link-error" role="alert">
              {linkError}
            </p>
          ) : null}
        </div>
      ) : null}

      {adEditor ? (
        <div
          className="article-rich-editor__ad-form"
          role="group"
          aria-label={adEditor.editing ? 'تعديل مساحة إعلانية' : 'إضافة مساحة إعلانية'}
        >
          <label htmlFor={adPlacementInputId}>
            <span>معرّف المساحة</span>
            <input
              id={adPlacementInputId}
              className="control"
              dir="ltr"
              value={adEditor.placementId}
              disabled={disabled}
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
              maxLength={64}
              placeholder="article-middle-1"
              aria-invalid={Boolean(adError)}
              aria-describedby={adError ? adErrorId : undefined}
              onChange={(event) => {
                setAdError('');
                setAdEditor((current) =>
                  current ? { ...current, placementId: event.target.value } : current,
                );
              }}
            />
          </label>
          <label htmlFor={adLabelInputId}>
            <span>اسم المساحة (اختياري)</span>
            <input
              id={adLabelInputId}
              className="control"
              value={adEditor.label}
              disabled={disabled}
              maxLength={80}
              placeholder="منتصف المقال"
              onChange={(event) => {
                setAdError('');
                setAdEditor((current) =>
                  current ? { ...current, label: event.target.value } : current,
                );
              }}
            />
          </label>
          <label htmlFor={adFormatInputId}>
            <span>شكل المساحة</span>
            <select
              id={adFormatInputId}
              className="control"
              value={adEditor.format}
              disabled={disabled}
              onChange={(event) => {
                const format = ARTICLE_AD_FORMATS.includes(event.target.value as ArticleAdFormat)
                  ? (event.target.value as ArticleAdFormat)
                  : 'inline';
                setAdEditor((current) => (current ? { ...current, format } : current));
              }}
            >
              <option value="inline">داخل المحتوى</option>
              <option value="banner">شريط إعلاني</option>
            </select>
          </label>
          <div className="article-rich-editor__ad-form-actions">
            <button
              type="button"
              className="button button--primary"
              disabled={disabled}
              onClick={saveAdBlock}
            >
              {adEditor.editing ? 'حفظ المساحة' : 'إضافة المساحة'}
            </button>
            <button
              type="button"
              className="button button--quiet"
              disabled={disabled}
              onClick={closeAdEditor}
            >
              إلغاء
            </button>
            {adEditor.editing ? (
              <button
                type="button"
                className="button button--danger"
                disabled={disabled}
                onClick={removeAdBlock}
              >
                إزالة المساحة
              </button>
            ) : null}
          </div>
          {adError ? (
            <p id={adErrorId} className="article-rich-editor__ad-error" role="alert">
              {adError}
            </p>
          ) : null}
        </div>
      ) : null}

      {mediaError ? (
        <p className="article-rich-editor__media-error" role="alert">
          {mediaError}
        </p>
      ) : null}
      <AdBlockEditorProvider disabled={disabled} edit={openAdEditor}>
        <ArticleMediaEditorProvider assets={mediaAssets} disabled={disabled} edit={openMediaEditor}>
          <EditorContent editor={editor} className="article-rich-editor__content" />
        </ArticleMediaEditorProvider>
      </AdBlockEditorProvider>
      <p className="article-rich-editor__note">
        عنوان المقال هو العنوان الرئيسي. استخدم عنوان 2 وعنوان 3 داخل المحتوى، وأضف الصور
        والفيديوهات والمساحات الإعلانية في مواضعها.
      </p>
      {mediaDialog && mediaDialog.kind !== 'gallery' && refreshMedia && uploadImage ? (
        <ArticleMediaDialog
          value={mediaDialog}
          assets={mediaAssets}
          disabled={disabled}
          onClose={closeMediaEditor}
          onRefresh={refreshMedia}
          onUpload={uploadImage}
          onCommit={commitMedia}
          onRemove={mediaDialog.attributes ? removeSelectedMedia : undefined}
        />
      ) : null}
      {mediaDialog?.kind === 'gallery' && refreshMedia && uploadImage ? (
        <ArticleImageGalleryDialog
          attributes={mediaDialog.attributes}
          assets={mediaAssets}
          disabled={disabled}
          maximumItems={galleryAvailableSlots}
          onClose={closeMediaEditor}
          onRefresh={refreshMedia}
          onUpload={uploadImage}
          onCommit={(attributes) => commitMedia('gallery', attributes)}
          onRemove={mediaDialog.attributes ? removeSelectedMedia : undefined}
        />
      ) : null}
    </div>
  );
}
