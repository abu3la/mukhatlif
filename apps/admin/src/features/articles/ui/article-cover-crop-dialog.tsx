import { type SyntheticEvent, useEffect, useId, useRef, useState } from 'react';
import ReactCrop, {
  centerCrop,
  convertToPixelCrop,
  makeAspectCrop,
  type PercentCrop,
  type PixelCrop,
} from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Button } from '@/shared/ui/primitives';
import {
  ArticleImageFileError,
  MAX_ARTICLE_IMAGE_BYTES,
  MIN_ARTICLE_COVER_HEIGHT,
  MIN_ARTICLE_COVER_WIDTH,
  type PreparedArticleImage,
} from './article-image-file';

const COVER_ASPECT_RATIO = 16 / 9;

const CROP_ARIA_LABELS = {
  cropArea: 'استخدم أسهم لوحة المفاتيح لتحريك مساحة قص الغلاف',
  nwDragHandle: 'استخدم الأسهم لتغيير القص من الزاوية العلوية اليسرى',
  nDragHandle: 'استخدم السهمين لأعلى وأسفل لتغيير الحد العلوي للقص',
  neDragHandle: 'استخدم الأسهم لتغيير القص من الزاوية العلوية اليمنى',
  eDragHandle: 'استخدم السهمين لليمين واليسار لتغيير الحد الأيمن للقص',
  seDragHandle: 'استخدم الأسهم لتغيير القص من الزاوية السفلية اليمنى',
  sDragHandle: 'استخدم السهمين لأعلى وأسفل لتغيير الحد السفلي للقص',
  swDragHandle: 'استخدم الأسهم لتغيير القص من الزاوية السفلية اليسرى',
  wDragHandle: 'استخدم السهمين لليمين واليسار لتغيير الحد الأيسر للقص',
};

export interface ArticleCoverCropGeometry {
  readonly sourceX: number;
  readonly sourceY: number;
  readonly width: number;
  readonly height: number;
}

interface ArticleCoverCropDialogProps {
  readonly source: PreparedArticleImage | null;
  readonly onCancel: () => void;
  readonly onApply: (image: PreparedArticleImage) => void;
  readonly onClosed?: () => void;
}

export function initialArticleCoverCrop(width: number, height: number): PercentCrop {
  const crop =
    width / height > COVER_ASPECT_RATIO
      ? makeAspectCrop({ unit: '%', height: 100 }, COVER_ASPECT_RATIO, width, height)
      : makeAspectCrop({ unit: '%', width: 100 }, COVER_ASPECT_RATIO, width, height);
  return centerCrop(crop, width, height);
}

export function articleCoverCropGeometry(
  crop: PixelCrop,
  renderedWidth: number,
  renderedHeight: number,
  naturalWidth: number,
  naturalHeight: number,
): ArticleCoverCropGeometry | null {
  if (
    crop.width <= 0 ||
    crop.height <= 0 ||
    renderedWidth <= 0 ||
    renderedHeight <= 0 ||
    naturalWidth <= 0 ||
    naturalHeight <= 0
  ) {
    return null;
  }

  const scaleX = naturalWidth / renderedWidth;
  const scaleY = naturalHeight / renderedHeight;
  const selectedWidth = crop.width * scaleX;
  const selectedHeight = crop.height * scaleY;
  const availableWidth = Math.min(selectedWidth, selectedHeight * COVER_ASPECT_RATIO);
  const width = Math.floor((availableWidth + 0.001) / 16) * 16;
  const height = (width / 16) * 9;
  if (width <= 0 || height <= 0) return null;

  const selectedX = crop.x * scaleX;
  const selectedY = crop.y * scaleY;
  const sourceX = Math.max(0, Math.min(naturalWidth - width, selectedX + (selectedWidth - width) / 2));
  const sourceY = Math.max(
    0,
    Math.min(naturalHeight - height, selectedY + (selectedHeight - height) / 2),
  );

  return { sourceX, sourceY, width, height };
}

function outputFileName(file: File): string {
  const extension = file.type === 'image/png' ? 'png' : 'jpg';
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'article-cover';
  return `${baseName}-cover.${extension}`;
}

async function canvasBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new ArticleImageFileError('تعذّر إنشاء ملف الغلاف. حاول مرة أخرى.'));
      },
      mimeType,
      mimeType === 'image/jpeg' ? 0.92 : undefined,
    );
  });
}

export async function cropArticleCoverFile(
  source: PreparedArticleImage,
  image: HTMLImageElement,
  crop: PixelCrop,
): Promise<PreparedArticleImage> {
  const geometry = articleCoverCropGeometry(
    crop,
    image.width,
    image.height,
    image.naturalWidth,
    image.naturalHeight,
  );
  if (
    !geometry ||
    geometry.width < MIN_ARTICLE_COVER_WIDTH ||
    geometry.height < MIN_ARTICLE_COVER_HEIGHT
  ) {
    throw new ArticleImageFileError(
      'وسّع مساحة القص لتكون النتيجة 1200 × 675 بكسل على الأقل.',
    );
  }

  const canvas = document.createElement('canvas');
  canvas.width = geometry.width;
  canvas.height = geometry.height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new ArticleImageFileError('تعذّر تجهيز قص الغلاف. حاول مرة أخرى.');
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    image,
    geometry.sourceX,
    geometry.sourceY,
    geometry.width,
    geometry.height,
    0,
    0,
    geometry.width,
    geometry.height,
  );

  const mimeType = source.file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const blob = await canvasBlob(canvas, mimeType);
  if (blob.size > MAX_ARTICLE_IMAGE_BYTES) {
    throw new ArticleImageFileError('حجم الغلاف الناتج أكبر من 10 م.ب. اختر مساحة قص أصغر.');
  }
  const file = new File([blob], outputFileName(source.file), {
    type: mimeType,
    lastModified: Date.now(),
  });
  return { file, width: geometry.width, height: geometry.height };
}

export function ArticleCoverCropDialog({
  source,
  onCancel,
  onApply,
  onClosed,
}: ArticleCoverCropDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const titleId = useId();
  const helpId = useId();
  const statusId = useId();
  const [sourceUrl, setSourceUrl] = useState('');
  const [crop, setCrop] = useState<PercentCrop>();
  const [geometry, setGeometry] = useState<ArticleCoverCropGeometry | null>(null);
  const [minimumCrop, setMinimumCrop] = useState({ width: 0, height: 0 });
  const [error, setError] = useState('');
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!source) {
      setSourceUrl('');
      return;
    }
    const nextUrl = URL.createObjectURL(source.file);
    setSourceUrl(nextUrl);
    setCrop(undefined);
    setGeometry(null);
    setError('');
    return () => URL.revokeObjectURL(nextUrl);
  }, [source]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (source && sourceUrl && !dialog.open) dialog.showModal();
    if ((!source || !sourceUrl) && dialog.open) dialog.close();
  }, [source, sourceUrl]);

  function updateGeometry(pixelCrop: PixelCrop) {
    const image = imageRef.current;
    if (!image) return;
    setGeometry(
      articleCoverCropGeometry(
        pixelCrop,
        image.width,
        image.height,
        image.naturalWidth,
        image.naturalHeight,
      ),
    );
  }

  function handleImageLoad(event: SyntheticEvent<HTMLImageElement>) {
    const image = event.currentTarget;
    const initialCrop = initialArticleCoverCrop(image.naturalWidth, image.naturalHeight);
    const renderedWidth = image.width || image.naturalWidth;
    const renderedHeight = image.height || image.naturalHeight;
    setCrop(initialCrop);
    setMinimumCrop({
      width: (MIN_ARTICLE_COVER_WIDTH / image.naturalWidth) * renderedWidth,
      height: (MIN_ARTICLE_COVER_HEIGHT / image.naturalHeight) * renderedHeight,
    });
    setGeometry(
      articleCoverCropGeometry(
        convertToPixelCrop(initialCrop, renderedWidth, renderedHeight),
        renderedWidth,
        renderedHeight,
        image.naturalWidth,
        image.naturalHeight,
      ),
    );
  }

  async function applyCrop() {
    const image = imageRef.current;
    if (!source || !image || !crop || applying) return;
    setApplying(true);
    setError('');
    try {
      const pixelCrop = convertToPixelCrop(crop, image.width, image.height);
      onApply(await cropArticleCoverFile(source, image, pixelCrop));
    } catch (cause) {
      setError(
        cause instanceof ArticleImageFileError
          ? cause.message
          : 'تعذّر تجهيز قص الغلاف. حاول مرة أخرى.',
      );
    } finally {
      setApplying(false);
    }
  }

  const validCrop = Boolean(
    geometry &&
      geometry.width >= MIN_ARTICLE_COVER_WIDTH &&
      geometry.height >= MIN_ARTICLE_COVER_HEIGHT,
  );

  return (
    <dialog
      ref={dialogRef}
      className="article-cover-crop-dialog"
      aria-labelledby={titleId}
      aria-describedby={`${helpId} ${statusId}`}
      onCancel={(event) => {
        event.preventDefault();
        if (!applying) onCancel();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        if (!applying) onCancel();
      }}
      onClose={onClosed}
    >
      <div className="article-cover-crop-dialog__panel">
        <header>
          <h2 id={titleId}>قص صورة الغلاف</h2>
          <p id={helpId}>
            حرّك الإطار أو غيّر حجمه. تبقى النسبة 16:9، ولن نكبّر الصورة عن أبعادها الأصلية.
          </p>
        </header>

        <div className="article-cover-crop-dialog__body">
          {sourceUrl ? (
            <div className="article-cover-crop-dialog__crop-stage">
              <ReactCrop
                crop={crop}
                aspect={COVER_ASPECT_RATIO}
                keepSelection
                minWidth={minimumCrop.width || undefined}
                minHeight={minimumCrop.height || undefined}
                ruleOfThirds
                ariaLabels={CROP_ARIA_LABELS}
                onChange={(pixelCrop, percentCrop) => {
                  setCrop(percentCrop);
                  updateGeometry(pixelCrop);
                  setError('');
                }}
              >
                <img
                  ref={imageRef}
                  src={sourceUrl}
                  alt="الصورة الأصلية لتحديد قص الغلاف"
                  onLoad={handleImageLoad}
                />
              </ReactCrop>
            </div>
          ) : null}
          <p
            id={statusId}
            className={`article-cover-crop-dialog__status ${geometry && !validCrop ? 'article-cover-crop-dialog__status--error' : ''}`.trim()}
            role="status"
            aria-live="polite"
          >
            {geometry
              ? validCrop
                ? `أبعاد الغلاف الناتج: ${geometry.width} × ${geometry.height} بكسل.`
                : 'وسّع مساحة القص لتكون النتيجة 1200 × 675 بكسل على الأقل.'
              : 'جارٍ تجهيز أداة القص.'}
          </p>
          {error ? (
            <p className="notice notice--error" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <footer>
          <Button type="button" disabled={applying} onClick={onCancel}>
            إلغاء
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={!validCrop || applying}
            aria-busy={applying}
            onClick={() => void applyCrop()}
          >
            {applying ? 'جارٍ تجهيز الغلاف' : 'اعتماد القص'}
          </Button>
        </footer>
      </div>
    </dialog>
  );
}
