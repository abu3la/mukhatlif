import { type ChangeEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ArticleMediaAsset, UploadArticleImageCommand } from '@/data';
import { formatArabicInteger } from '@/lib';
import { Button, Field, Input, Textarea } from '@/shared/ui/primitives';
import type { ImageGalleryAttributes, ImageGalleryItemAttributes } from './article-media';
import {
  articleImageErrorMessage,
  prepareArticleImage,
  type PreparedArticleImage,
} from './article-image-file';

export interface ArticleImageGalleryDialogProps {
  readonly attributes?: ImageGalleryAttributes;
  readonly assets: readonly ArticleMediaAsset[];
  readonly disabled: boolean;
  readonly maximumItems: number;
  readonly onClose: () => void;
  readonly onRefresh: () => Promise<void>;
  readonly onUpload: (command: UploadArticleImageCommand) => Promise<ArticleMediaAsset>;
  readonly onCommit: (attributes: ImageGalleryAttributes) => void;
  readonly onRemove?: () => void;
}

function initialGalleryItems(
  attributes: ImageGalleryAttributes | undefined,
): ImageGalleryItemAttributes[] {
  const seen = new Set<string>();
  return (attributes?.items ?? []).filter((item) => {
    if (seen.has(item.mediaId)) return false;
    seen.add(item.mediaId);
    return true;
  }).slice(0, 3);
}

function selectionStatus(count: number): string {
  if (count === 0) return 'لم تختر صورًا بعد.';
  if (count === 1) return 'اخترت صورة واحدة. أضف صورة أخرى.';
  if (count === 2) return 'اخترت صورتين. يمكنك إضافة صورة ثالثة.';
  if (count === 3) return 'اخترت 3 صور. اكتمل المعرض.';
  return `اخترت ${formatArabicInteger(count)} صورة.`;
}

export function ArticleImageGalleryDialog({
  attributes,
  assets,
  disabled,
  maximumItems,
  onClose,
  onRefresh,
  onUpload,
  onCommit,
  onRemove,
}: ArticleImageGalleryDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const statusId = useId();
  const uploadAltId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [query, setQuery] = useState('');
  const [selectedItems, setSelectedItems] = useState<ImageGalleryItemAttributes[]>(() =>
    initialGalleryItems(attributes),
  );
  const [caption, setCaption] = useState(attributes?.caption ?? '');
  const [selectedImage, setSelectedImage] = useState<PreparedArticleImage | null>(null);
  const [uploadAlt, setUploadAlt] = useState('');
  const [localAssets, setLocalAssets] = useState<ArticleMediaAsset[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const isEditing = Boolean(attributes);
  const allowedMaximum = Math.max(0, Math.min(3, maximumItems));

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    let active = true;
    if (!dialog.open) dialog.showModal();
    closeButtonRef.current?.focus();
    setLoading(true);
    void onRefresh()
      .catch((cause) => {
        if (active) setError(articleImageErrorMessage(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [onRefresh]);

  const availableAssets = useMemo(() => {
    const byId = new Map<string, ArticleMediaAsset>();
    for (const asset of [...assets, ...localAssets]) {
      if (asset.status === 'ready') byId.set(asset.id, asset);
    }
    return [...byId.values()];
  }, [assets, localAssets]);

  const filteredAssets = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ar');
    if (!needle) return availableAssets;
    return availableAssets.filter((asset) =>
      [asset.fileName, asset.defaultAlt]
        .filter(Boolean)
        .some((text) => text.toLocaleLowerCase('ar').includes(needle)),
    );
  }, [availableAssets, query]);

  const selectedIds = useMemo(
    () => new Set(selectedItems.map((item) => item.mediaId)),
    [selectedItems],
  );
  const galleryIsViable = isEditing || allowedMaximum >= 2;
  const hasItemCapacity = galleryIsViable && selectedItems.length < allowedMaximum;
  const canAddMore = hasItemCapacity && uploadProgress === null;
  const allAlternativeTextComplete = selectedItems.every((item) => item.alt.trim().length > 0);
  const canCommit =
    !disabled &&
    uploadProgress === null &&
    selectedItems.length >= 2 &&
    selectedItems.length <= allowedMaximum &&
    allAlternativeTextComplete;

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    setSelectedImage(null);
    setError('');
    setFeedback('');
    if (!file) return;
    try {
      setSelectedImage(await prepareArticleImage(file));
    } catch (cause) {
      setError(articleImageErrorMessage(cause));
    }
  }

  async function uploadSelectedImage() {
    const normalizedAlt = uploadAlt.trim();
    if (!selectedImage || !normalizedAlt || uploadProgress !== null || !canAddMore) {
      if (!normalizedAlt) {
        setError('أضف وصفًا بديلًا للصورة قبل رفعها.');
        document.getElementById(uploadAltId)?.focus();
      }
      return;
    }
    setError('');
    setFeedback('');
    setUploadProgress(0);
    try {
      const uploaded = await onUpload({
        body: selectedImage.file,
        fileName: selectedImage.file.name,
        mimeType: selectedImage.file.type as 'image/jpeg' | 'image/png',
        byteSize: selectedImage.file.size,
        width: selectedImage.width,
        height: selectedImage.height,
        alt: normalizedAlt,
        onProgress: setUploadProgress,
      });
      setLocalAssets((current) => [...current.filter((asset) => asset.id !== uploaded.id), uploaded]);
      setSelectedItems((current) =>
        current.some((item) => item.mediaId === uploaded.id) ||
        current.length >= allowedMaximum
          ? current
          : [...current, { mediaId: uploaded.id, alt: normalizedAlt }],
      );
      setSelectedImage(null);
      setUploadAlt('');
      setFeedback('رُفعت الصورة وأُضيفت إلى المعرض.');
    } catch (cause) {
      setError(articleImageErrorMessage(cause));
    } finally {
      setUploadProgress(null);
    }
  }

  function addAsset(asset: ArticleMediaAsset) {
    if (selectedIds.has(asset.id) || !canAddMore) return;
    setSelectedItems((current) =>
      current.some((item) => item.mediaId === asset.id) || current.length >= allowedMaximum
        ? current
        : [...current, { mediaId: asset.id, alt: asset.defaultAlt.trim() }],
    );
    setError('');
    setFeedback('');
  }

  function updateAlternativeText(index: number, value: string) {
    setSelectedItems((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, alt: value } : item)),
    );
    setError('');
  }

  function removeItem(index: number) {
    setSelectedItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setError('');
    setFeedback('');
  }

  function commit() {
    if (!canCommit) return;
    onCommit({
      items: selectedItems.map((item) => ({
        mediaId: item.mediaId,
        alt: item.alt.trim(),
      })),
      caption: caption.trim() || undefined,
    });
  }

  return (
    <dialog
      ref={dialogRef}
      className="article-media-dialog article-image-gallery-dialog"
      aria-labelledby={titleId}
      aria-describedby={`${descriptionId} ${statusId}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        onClose();
      }}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="article-media-dialog__panel">
        <header className="article-media-dialog__header">
          <div>
            <h2 id={titleId}>{isEditing ? 'تعديل معرض الصور' : 'إضافة معرض صور'}</h2>
            <p id={descriptionId}>اختر صورتين أو 3 صور، ثم أضف وصفًا بديلًا لكل صورة.</p>
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
          {allowedMaximum < 2 ? (
            <p className="notice notice--error" role="alert">
              لا توجد مساحة لصورتين جديدتين. أزل صورًا من المقال أولًا.
            </p>
          ) : null}

          <section className="article-media-dialog__section" aria-labelledby={`${titleId}-library`}>
            <div className="article-media-dialog__section-heading">
              <div>
                <h3 id={`${titleId}-library`}>مكتبة الصور</h3>
                <p>
                  {loading
                    ? 'جارٍ تحميل الصور…'
                    : `${formatArabicInteger(availableAssets.length)} صورة متاحة`}
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
              <div
                className="article-media-library"
                role="listbox"
                aria-label="صور المعرض المتاحة"
                aria-multiselectable="true"
              >
                {filteredAssets.map((asset) => {
                  const selectedIndex = selectedItems.findIndex(
                    (item) => item.mediaId === asset.id,
                  );
                  const selected = selectedIndex >= 0;
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      className="article-media-library__item"
                      role="option"
                      aria-selected={selected}
                      aria-label={`${asset.fileName}${selected ? `، الصورة ${selectedIndex + 1} في المعرض` : ''}`}
                      disabled={disabled || selected || !canAddMore}
                      onClick={() => addAsset(asset)}
                    >
                      {asset.publicUrl ? <img src={asset.publicUrl} alt="" /> : null}
                      <span>
                        <b>{asset.fileName}</b>
                        <small dir="ltr">
                          {asset.width} × {asset.height}
                        </small>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="article-media-dialog__empty">
                {query ? 'لا توجد صورة تطابق البحث.' : 'المكتبة فارغة. ارفع صورة من جهازك.'}
              </p>
            )}
          </section>

          <section
            className="article-media-dialog__section article-media-dialog__section--upload"
            aria-labelledby={`${titleId}-upload`}
          >
            <div>
              <h3 id={`${titleId}-upload`}>رفع صورة</h3>
              <p>تُضاف الصورة إلى المجموعة بعد اكتمال الرفع.</p>
            </div>
            <div className="article-media-dialog__upload">
              <label className="button button--quiet" htmlFor={`${titleId}-gallery-file`}>
                اختيار صورة
              </label>
              <input
                id={`${titleId}-gallery-file`}
                className="sr-only article-media-dialog__file-input"
                type="file"
                accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                disabled={disabled || uploadProgress !== null || !canAddMore}
                onChange={(event) => void selectFile(event)}
              />
              <span>{selectedImage?.file.name ?? 'لم تختر صورة بعد.'}</span>
              <small>JPEG أو PNG، حتى 10 م.ب، وبحد أقصى 24 مليون بكسل.</small>
            </div>
            <Field label="الوصف البديل للصورة المرفوعة (مطلوب)">
              <Input
                id={uploadAltId}
                value={uploadAlt}
                maxLength={500}
                required
                disabled={disabled || uploadProgress !== null || !canAddMore}
                onChange={(event) => {
                  setUploadAlt(event.target.value);
                  setError('');
                }}
              />
            </Field>
            {selectedImage ? (
              <Button
                type="button"
                variant="primary"
                className="article-media-dialog__upload-action"
                disabled={disabled || uploadProgress !== null || !uploadAlt.trim() || !canAddMore}
                onClick={() => void uploadSelectedImage()}
              >
                رفع الصورة
              </Button>
            ) : null}
            {uploadProgress !== null ? (
              <div className="article-media-dialog__progress" aria-live="polite">
                <progress value={uploadProgress} max={100} aria-label="تقدم رفع صورة المعرض" />
                <span>{formatArabicInteger(uploadProgress)}%</span>
              </div>
            ) : null}
          </section>

          <section
            className="article-media-dialog__section article-image-gallery-dialog__selection"
            aria-labelledby={`${titleId}-selection`}
          >
            <div>
              <h3 id={`${titleId}-selection`}>الصور المختارة</h3>
              <p id={statusId} role="status" aria-live="polite">
                {selectionStatus(selectedItems.length)}
              </p>
            </div>
            {selectedItems.length ? (
              <ol className="article-image-gallery-dialog__items">
                {selectedItems.map((item, index) => {
                  const asset = availableAssets.find((candidate) => candidate.id === item.mediaId);
                  return (
                    <li key={item.mediaId}>
                      {asset?.publicUrl ? <img src={asset.publicUrl} alt="" /> : null}
                      <Field label={`الوصف البديل للصورة ${index + 1} (مطلوب)`}>
                        <Input
                          value={item.alt}
                          maxLength={500}
                          required
                          aria-invalid={!item.alt.trim()}
                          disabled={disabled}
                          onChange={(event) => updateAlternativeText(index, event.target.value)}
                        />
                      </Field>
                      <Button
                        type="button"
                        disabled={disabled}
                        aria-label={`إزالة الصورة ${index + 1} من المعرض`}
                        onClick={() => removeItem(index)}
                      >
                        إزالة
                      </Button>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="article-media-dialog__empty">اختر صورتين من المكتبة أو ارفعهما.</p>
            )}
            <Field
              label="وصف المجموعة (اختياري)"
              hint="يظهر مرة واحدة أسفل مجموعة الصور."
            >
              <Textarea
                value={caption}
                maxLength={1000}
                disabled={disabled}
                onChange={(event) => setCaption(event.target.value)}
              />
            </Field>
          </section>

          {error ? (
            <p className="notice notice--error" role="alert">
              {error}
            </p>
          ) : feedback ? (
            <p className="notice" role="status">
              {feedback}
            </p>
          ) : null}
        </div>

        <footer className="article-media-dialog__footer">
          {isEditing && onRemove ? (
            <Button type="button" variant="danger" disabled={disabled} onClick={onRemove}>
              إزالة المعرض من المقال
            </Button>
          ) : (
            <span />
          )}
          <div>
            <Button type="button" variant="quiet" onClick={onClose}>
              إلغاء
            </Button>
            <Button type="button" variant="primary" disabled={!canCommit} onClick={commit}>
              {isEditing ? 'حفظ التعديلات' : 'إضافة المعرض'}
            </Button>
          </div>
        </footer>
      </div>
    </dialog>
  );
}
