import { isAdminRepositoryError } from '@/data';

export const MAX_ARTICLE_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_ARTICLE_IMAGE_EDGE = 8_192;
export const MAX_ARTICLE_IMAGE_PIXELS = 24_000_000;
export const MIN_ARTICLE_COVER_WIDTH = 1_200;
export const MIN_ARTICLE_COVER_HEIGHT = 675;
export const RECOMMENDED_ARTICLE_COVER_WIDTH = 1_600;
export const RECOMMENDED_ARTICLE_COVER_HEIGHT = 900;

const ARTICLE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png']);

export interface PreparedArticleImage {
  readonly file: File;
  readonly width: number;
  readonly height: number;
}

export class ArticleImageFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArticleImageFileError';
  }
}

function validateFile(file: File): string | null {
  if (!ARTICLE_IMAGE_TYPES.has(file.type)) return 'اختر صورة بصيغة JPEG أو PNG.';
  if (file.size <= 0) return 'ملف الصورة فارغ.';
  if (file.size > MAX_ARTICLE_IMAGE_BYTES) return 'حجم الصورة أكبر من 10 م.ب.';
  return null;
}

async function readDimensions(file: File): Promise<{ width: number; height: number }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.addEventListener('load', () => {
        if (!image.naturalWidth || !image.naturalHeight) {
          reject(new Error('Image dimensions are unavailable.'));
          return;
        }
        resolve({ width: image.naturalWidth, height: image.naturalHeight });
      });
      image.addEventListener('error', () => reject(new Error('Image decoding failed.')));
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function prepareArticleImage(file: File): Promise<PreparedArticleImage> {
  const fileError = validateFile(file);
  if (fileError) throw new ArticleImageFileError(fileError);

  let dimensions: { width: number; height: number };
  try {
    dimensions = await readDimensions(file);
  } catch {
    throw new ArticleImageFileError('تعذّر قراءة الصورة. اختر ملف JPEG أو PNG سليمًا.');
  }

  if (
    dimensions.width > MAX_ARTICLE_IMAGE_EDGE ||
    dimensions.height > MAX_ARTICLE_IMAGE_EDGE ||
    dimensions.width * dimensions.height > MAX_ARTICLE_IMAGE_PIXELS
  ) {
    throw new ArticleImageFileError(
      'أبعاد الصورة تتجاوز الحد المسموح: 8192 بكسل و24 مليون بكسل إجمالًا.',
    );
  }

  return { file, ...dimensions };
}

export async function prepareArticleCoverImage(file: File): Promise<PreparedArticleImage> {
  const prepared = await prepareArticleImage(file);
  if (
    prepared.width < MIN_ARTICLE_COVER_WIDTH ||
    prepared.height < MIN_ARTICLE_COVER_HEIGHT
  ) {
    throw new ArticleImageFileError(
      `أبعاد الصورة ${prepared.width} × ${prepared.height} بكسل. الحد الأدنى للغلاف 1200 × 675 بكسل.`,
    );
  }

  return prepared;
}

export function articleImageErrorMessage(error: unknown): string {
  if (error instanceof ArticleImageFileError) return error.message;
  if (isAdminRepositoryError(error)) {
    const remoteCode = error.context?.remoteCode;
    if (typeof remoteCode === 'string') {
      if (remoteCode === 'MEDIA_STORAGE_NOT_CONFIGURED') {
        return 'تخزين الصور غير مهيأ في الخادم.';
      }
      if (remoteCode === 'MEDIA_PUBLIC_UNAVAILABLE') {
        return 'رُفعت الصورة، لكن رابط العرض غير متاح. راجع إعداد تخزين الصور.';
      }
      if (remoteCode === 'MEDIA_FILE_EMPTY') return 'ملف الصورة فارغ.';
      if (remoteCode === 'MEDIA_FILE_TOO_LARGE') return 'حجم الصورة أكبر من 10 م.ب.';
      if (remoteCode === 'MEDIA_CONTENT_LENGTH_REQUIRED' || remoteCode === 'MEDIA_SIZE_MISMATCH') {
        return 'لم يكتمل رفع الصورة بالحجم المتوقع. اختر الملف مجددًا وحاول مرة أخرى.';
      }
      if (
        remoteCode === 'MEDIA_MIME_MISMATCH' ||
        remoteCode === 'MEDIA_CONTENT_ENCODING_FORBIDDEN' ||
        remoteCode === 'MEDIA_TRAILING_DATA' ||
        remoteCode.includes('MALFORMED') ||
        remoteCode.includes('SIGNATURE')
      ) {
        return 'محتوى الملف لا يطابق صيغة JPEG أو PNG السليمة.';
      }
      if (remoteCode.includes('DIMENSIONS')) {
        return 'أبعاد الصورة غير صالحة أو تتجاوز الحد المسموح.';
      }
      if (remoteCode === 'MEDIA_UPLOAD_IN_PROGRESS') {
        return 'يجري رفع هذه الصورة حاليًا. انتظر قليلًا ثم حدّث المكتبة.';
      }
      if (remoteCode === 'MEDIA_ALREADY_READY') {
        return 'الصورة مرفوعة وجاهزة. حدّث المكتبة ثم اخترها.';
      }
      if (remoteCode === 'MEDIA_UPLOAD_NOT_FOUND' || remoteCode === 'MEDIA_UPLOAD_STATE_LOST') {
        return 'انتهت جلسة الرفع. اختر الملف مجددًا ثم حاول مرة أخرى.';
      }
    }
    if (error.code === 'NETWORK' || error.code === 'REMOTE_UNAVAILABLE') {
      return 'تعذّر الاتصال بخدمة الصور. تحقق من الاتصال وحاول مرة أخرى.';
    }
  }
  if (error instanceof Error && error.message) {
    if (/413|too large|10 mib|size/i.test(error.message)) return 'حجم الصورة أكبر من 10 م.ب.';
    if (/mime|type|jpeg|png/i.test(error.message)) return 'صيغة الصورة غير مدعومة.';
  }
  return 'تعذّر إكمال عملية الوسائط. تحقق من الاتصال وحاول مرة أخرى.';
}
