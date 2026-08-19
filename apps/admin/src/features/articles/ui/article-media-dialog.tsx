import { type ChangeEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ArticleMediaAsset, UploadArticleImageCommand } from '@/data';
import { formatArabicInteger } from '@/lib';
import { Button, Field, Input, Textarea } from '@/shared/ui/primitives';
import {
  type ArticleImageAlignment,
  type ArticleImagePresentation,
  type ArticleImageRadius,
  type ArticleMediaKind,
  type ImageBlockAttributes,
  parseArticleVideoUrl,
  type VideoEmbedAttributes,
} from './article-media';
import {
  articleImageErrorMessage,
  prepareArticleImage,
  type PreparedArticleImage,
} from './article-image-file';

type MediaDialogValue =
  | { readonly kind: 'image'; readonly attributes?: ImageBlockAttributes }
  | { readonly kind: 'video'; readonly attributes?: VideoEmbedAttributes };

export interface ArticleMediaDialogProps {
  readonly value: MediaDialogValue;
  readonly assets: readonly ArticleMediaAsset[];
  readonly disabled: boolean;
  readonly onClose: () => void;
  readonly onRefresh: () => Promise<void>;
  readonly onUpload: (command: UploadArticleImageCommand) => Promise<ArticleMediaAsset>;
  readonly onCommit: (
    kind: ArticleMediaKind,
    attributes: ImageBlockAttributes | VideoEmbedAttributes,
  ) => void;
  readonly onRemove?: () => void;
}

export function ArticleMediaDialog({
  value,
  assets,
  disabled,
  onClose,
  onRefresh,
  onUpload,
  onCommit,
  onRemove,
}: ArticleMediaDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const altInputId = `${titleId}-alt`;
  const videoTitleInputId = `${titleId}-video-title`;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [query, setQuery] = useState('');
  const [selectedMediaId, setSelectedMediaId] = useState(
    value.kind === 'image'
      ? (value.attributes?.mediaId ?? '')
      : (value.attributes?.posterMediaId ?? ''),
  );
  const [alt, setAlt] = useState(value.kind === 'image' ? (value.attributes?.alt ?? '') : '');
  const [caption, setCaption] = useState(value.attributes?.caption ?? '');
  const [presentation, setPresentation] = useState<ArticleImagePresentation>(
    value.kind === 'image' ? (value.attributes?.presentation ?? 'content') : 'content',
  );
  const [alignment, setAlignment] = useState<ArticleImageAlignment>(
    value.kind === 'image' ? (value.attributes?.alignment ?? 'center') : 'center',
  );
  const [radius, setRadius] = useState<ArticleImageRadius>(
    value.kind === 'image' ? (value.attributes?.radius ?? 'none') : 'none',
  );
  const [videoUrl, setVideoUrl] = useState(() => {
    if (value.kind !== 'video' || !value.attributes) return '';
    return value.attributes.provider === 'youtube'
      ? `https://www.youtube.com/watch?v=${value.attributes.videoId}`
      : `https://vimeo.com/${value.attributes.videoId}`;
  });
  const [videoTitle, setVideoTitle] = useState(
    value.kind === 'video' ? (value.attributes?.title ?? '') : '',
  );
  const [selectedImage, setSelectedImage] = useState<PreparedArticleImage | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isEditing = Boolean(value.attributes);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    closeButtonRef.current?.focus();
    setLoading(true);
    void onRefresh()
      .catch((cause) => setError(articleImageErrorMessage(cause)))
      .finally(() => setLoading(false));
  }, [onRefresh]);

  const filteredAssets = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ar');
    if (!needle) return assets;
    return assets.filter((asset) =>
      [asset.fileName, asset.defaultAlt, asset.defaultCaption]
        .filter(Boolean)
        .some((text) => text?.toLocaleLowerCase('ar').includes(needle)),
    );
  }, [assets, query]);

  const parsedVideo = value.kind === 'video' ? parseArticleVideoUrl(videoUrl) : null;
  const uploadAlt = value.kind === 'image' ? alt.trim() : videoTitle.trim();
  const canCommit =
    !disabled &&
    uploadProgress === null &&
    selectedMediaId.length > 0 &&
    (value.kind === 'image'
      ? alt.trim().length > 0
      : Boolean(parsedVideo && videoTitle.trim().length > 0));

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    setSelectedImage(null);
    setError('');
    if (!file) return;
    try {
      setSelectedImage(await prepareArticleImage(file));
    } catch (cause) {
      setError(articleImageErrorMessage(cause));
    }
  }

  async function uploadSelectedImage() {
    if (!selectedImage || !uploadAlt || uploadProgress !== null) {
      if (!uploadAlt) {
        const missingCopy =
          value.kind === 'image'
            ? 'أضف وصفًا بديلًا، ثم ارفع الصورة.'
            : 'أضف عنوان الفيديو، ثم ارفع صورة الملصق.';
        setError(missingCopy);
        document
          .getElementById(value.kind === 'image' ? altInputId : videoTitleInputId)
          ?.focus();
      }
      return;
    }
    setError('');
    setUploadProgress(0);
    try {
      const uploaded = await onUpload({
        body: selectedImage.file,
        fileName: selectedImage.file.name,
        mimeType: selectedImage.file.type as 'image/jpeg' | 'image/png',
        byteSize: selectedImage.file.size,
        width: selectedImage.width,
        height: selectedImage.height,
        alt: uploadAlt,
        caption: value.kind === 'image' ? caption.trim() || undefined : undefined,
        onProgress: setUploadProgress,
      });
      setSelectedMediaId(uploaded.id);
      setSelectedImage(null);
    } catch (cause) {
      setError(articleImageErrorMessage(cause));
    } finally {
      setUploadProgress(null);
    }
  }

  function selectAsset(asset: ArticleMediaAsset) {
    setSelectedMediaId(asset.id);
    if (value.kind === 'image') {
      setAlt(asset.defaultAlt);
      setCaption(asset.defaultCaption ?? '');
    }
    setError('');
  }

  function commit() {
    if (!canCommit) return;
    if (value.kind === 'image') {
      onCommit('image', {
        mediaId: selectedMediaId,
        alt: alt.trim(),
        caption: caption.trim() || undefined,
        presentation,
        alignment,
        radius,
      });
      return;
    }
    if (!parsedVideo) return;
    onCommit('video', {
      provider: parsedVideo.provider,
      videoId: parsedVideo.videoId,
      title: videoTitle.trim(),
      posterMediaId: selectedMediaId,
      caption: caption.trim() || undefined,
    });
  }

  return (
    <dialog
      ref={dialogRef}
      className="article-media-dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
      }}
      onClose={onClose}
    >
      <div className="article-media-dialog__panel">
        <header className="article-media-dialog__header">
          <div>
            <h2 id={titleId}>
              {value.kind === 'image'
                ? isEditing
                  ? 'تعديل الصورة'
                  : 'إضافة صورة'
                : isEditing
                  ? 'تعديل الفيديو'
                  : 'إضافة فيديو'}
            </h2>
            <p id={descriptionId}>
              {value.kind === 'image'
                ? 'ارفع صورة من جهازك أو اخترها من المكتبة، ثم اضبط عرضها ووصفها.'
                : 'ألصق رابط YouTube أو Vimeo واختر صورة ملصق من المكتبة.'}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="button button--quiet"
            onClick={onClose}
          >
            إغلاق
          </button>
        </header>

        <div className="article-media-dialog__body">
          {value.kind === 'video' ? (
            <section className="article-media-dialog__section" aria-labelledby={`${titleId}-video`}>
              <h3 id={`${titleId}-video`}>بيانات الفيديو</h3>
              <Field label="رابط الفيديو" hint="يُقبل رابط YouTube أو Vimeo فقط.">
                <Input
                  dir="ltr"
                  type="url"
                  value={videoUrl}
                  disabled={disabled}
                  placeholder="https://www.youtube.com/watch?v=..."
                  onChange={(event) => setVideoUrl(event.target.value)}
                  aria-invalid={Boolean(videoUrl.trim() && !parsedVideo)}
                />
              </Field>
              {videoUrl.trim() && !parsedVideo ? (
                <p className="article-media-dialog__field-error" role="alert">
                  استخدم رابط فيديو صالحًا من YouTube أو Vimeo.
                </p>
              ) : null}
              <Field
                label="عنوان الفيديو (مطلوب)"
                hint="يصف الفيديو لقارئ الشاشة وفي النشرة البريدية."
              >
                <Input
                  id={videoTitleInputId}
                  value={videoTitle}
                  disabled={disabled}
                  maxLength={180}
                  required
                  onChange={(event) => {
                    setVideoTitle(event.target.value);
                    setError('');
                  }}
                />
              </Field>
            </section>
          ) : null}

          <section
            className="article-media-dialog__section article-media-dialog__section--upload"
            aria-labelledby={`${titleId}-upload`}
          >
            <div>
              <h3 id={`${titleId}-upload`}>
                {value.kind === 'image' ? 'رفع صورة من الجهاز' : 'رفع ملصق من الجهاز'}
              </h3>
              <p>
                {value.kind === 'image'
                  ? 'اختر صورة ثم ارفعها إلى مكتبة المقال.'
                  : 'اختر صورة واضحة لتظهر قبل تشغيل الفيديو.'}
              </p>
            </div>
            <div className="article-media-dialog__upload">
              <label className="button button--primary" htmlFor={`${titleId}-file`}>
                اختيار صورة من الجهاز
              </label>
              <input
                id={`${titleId}-file`}
                className="sr-only article-media-dialog__file-input"
                type="file"
                accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                disabled={disabled || uploadProgress !== null}
                onChange={(event) => void selectFile(event)}
              />
              <span>{selectedImage?.file.name ?? 'لم تختر صورة بعد.'}</span>
              <small>JPEG أو PNG، حتى 10 م.ب، وبحد أقصى 24 مليون بكسل.</small>
            </div>
            {value.kind === 'image' ? (
              <Field
                label="الوصف البديل (مطلوب)"
                hint="يصف الصورة لقارئ الشاشة ويظهر إذا تعذّر تحميلها."
              >
                <Input
                  id={altInputId}
                  value={alt}
                  maxLength={500}
                  disabled={disabled}
                  required
                  onChange={(event) => {
                    setAlt(event.target.value);
                    setError('');
                  }}
                />
              </Field>
            ) : null}
            {selectedImage ? (
              <Button
                type="button"
                variant="primary"
                className="article-media-dialog__upload-action"
                disabled={disabled || uploadProgress !== null || !uploadAlt}
                onClick={() => void uploadSelectedImage()}
              >
                رفع الصورة
              </Button>
            ) : null}
            {uploadProgress !== null ? (
              <div className="article-media-dialog__progress" aria-live="polite">
                <progress value={uploadProgress} max={100} aria-label="تقدم رفع الصورة" />
                <span>{formatArabicInteger(uploadProgress)}%</span>
              </div>
            ) : null}
          </section>

          <section className="article-media-dialog__section" aria-labelledby={`${titleId}-library`}>
            <div className="article-media-dialog__section-heading">
              <div>
                <h3 id={`${titleId}-library`}>
                  {value.kind === 'image' ? 'مكتبة الصور' : 'صورة ملصق الفيديو'}
                </h3>
                <p>
                  {loading
                    ? 'جارٍ تحميل الصور…'
                    : `${formatArabicInteger(assets.length)} صورة متاحة`}
                </p>
              </div>
              <label>
                <span className="sr-only">البحث في مكتبة الصور</span>
                <input
                  className="control"
                  type="search"
                  value={query}
                  placeholder="ابحث في الصور"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
            </div>
            {filteredAssets.length ? (
              <div className="article-media-library" role="listbox" aria-label="الصور المتاحة">
                {filteredAssets.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    className="article-media-library__item"
                    role="option"
                    aria-selected={selectedMediaId === asset.id}
                    onClick={() => selectAsset(asset)}
                  >
                    {asset.publicUrl ? <img src={asset.publicUrl} alt="" /> : null}
                    <span>
                      <b>{asset.fileName}</b>
                      <small dir="ltr">
                        {asset.width} × {asset.height}
                      </small>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="article-media-dialog__empty">
                {query
                  ? 'لا توجد صورة تطابق البحث.'
                  : 'المكتبة فارغة. ارفع الصورة الأولى من جهازك.'}
              </p>
            )}
          </section>

          <section className="article-media-dialog__section" aria-labelledby={`${titleId}-details`}>
            <h3 id={`${titleId}-details`}>
              {value.kind === 'image' ? 'تفاصيل الموضع' : 'تفاصيل العرض'}
            </h3>
            <Field label="التعليق" hint="اختياري، ويظهر أسفل الصورة أو الفيديو.">
              <Textarea
                value={caption}
                maxLength={1000}
                disabled={disabled}
                onChange={(event) => setCaption(event.target.value)}
              />
            </Field>
          </section>

          {value.kind === 'image' ? (
            <section
              className="article-media-dialog__section article-media-dialog__section--design"
              aria-labelledby={`${titleId}-design`}
            >
              <div>
                <h3 id={`${titleId}-design`}>تصميم الصورة</h3>
                <p>اختر شكل الصورة. لا تحتاج إلى كتابة CSS.</p>
              </div>
              <div className="article-media-dialog__design-grid">
                <Field label="عرض الصورة">
                  <select
                    className="control"
                    value={presentation}
                    disabled={disabled}
                    onChange={(event) =>
                      setPresentation(event.target.value as ArticleImagePresentation)
                    }
                  >
                    <option value="content">ضمن عرض النص</option>
                    <option value="wide">عرض واسع</option>
                  </select>
                </Field>
                <Field
                  label="محاذاة الصورة"
                  hint={
                    presentation === 'wide'
                      ? 'لا تتغير محاذاة الصورة عند اختيار العرض الواسع.'
                      : undefined
                  }
                >
                  <select
                    className="control"
                    value={alignment}
                    disabled={disabled || presentation === 'wide'}
                    onChange={(event) => setAlignment(event.target.value as ArticleImageAlignment)}
                  >
                    <option value="start">يمين</option>
                    <option value="center">وسط</option>
                    <option value="end">يسار</option>
                  </select>
                </Field>
                <Field label="حواف الصورة">
                  <select
                    className="control"
                    value={radius}
                    disabled={disabled}
                    onChange={(event) => setRadius(event.target.value as ArticleImageRadius)}
                  >
                    <option value="none">مستقيمة</option>
                    <option value="soft">خفيفة</option>
                    <option value="round">مستديرة</option>
                  </select>
                </Field>
              </div>
            </section>
          ) : null}

          {error ? (
            <p className="notice notice--error" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="article-media-dialog__footer">
          {isEditing && onRemove ? (
            <Button type="button" variant="danger" disabled={disabled} onClick={onRemove}>
              {value.kind === 'image' ? 'إزالة الصورة من المقال' : 'إزالة الفيديو من المقال'}
            </Button>
          ) : (
            <span />
          )}
          <div>
            <Button type="button" variant="quiet" onClick={onClose}>
              إلغاء
            </Button>
            <Button type="button" disabled={!canCommit} onClick={commit}>
              {isEditing
                ? 'حفظ التعديلات'
                : value.kind === 'image'
                  ? 'إدراج الصورة'
                  : 'إدراج الفيديو'}
            </Button>
          </div>
        </footer>
      </div>
    </dialog>
  );
}
