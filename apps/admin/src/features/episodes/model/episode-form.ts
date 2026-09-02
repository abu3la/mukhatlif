import { isAdminRepositoryError } from '@/data';
import { normalizeArabicIndicDigits } from '@/lib';

const MAX_AUDIO_FILE_BYTES = 500 * 1024 * 1024;
const AUDIO_FILE_NAME_PATTERN = /\.(?:mp3|wav)$/i;
const AUDIO_MIME_TYPES = new Set(['audio/mpeg', 'audio/wav', 'audio/x-wav']);

export type EpisodeNumericField = 'episodeNumber' | 'durationMinutes';

export type EpisodeNumericValidation =
  | {
      readonly ok: true;
      readonly episodeNumber: number;
      readonly durationMinutes: number;
    }
  | {
      readonly ok: false;
      readonly field: EpisodeNumericField;
      readonly message: string;
    };

export function normalizeEpisodeNumericInput(value: string): string {
  return normalizeArabicIndicDigits(value).trim().replace('٫', '.').replace(',', '.');
}

export function validateEpisodeNumbers(
  episodeNumberInput: string,
  durationMinutesInput: string,
): EpisodeNumericValidation {
  const normalizedEpisodeNumber = normalizeEpisodeNumericInput(episodeNumberInput);
  const episodeNumber = Number(normalizedEpisodeNumber);
  if (
    !/^\d+$/.test(normalizedEpisodeNumber) ||
    !Number.isSafeInteger(episodeNumber) ||
    episodeNumber <= 0
  ) {
    return {
      ok: false,
      field: 'episodeNumber',
      message: 'أدخل رقم حلقة صحيحًا أكبر من صفر.',
    };
  }

  const normalizedDuration = normalizeEpisodeNumericInput(durationMinutesInput);
  const durationMinutes = Number(normalizedDuration);
  if (!/^\d+(?:\.\d+)?$/.test(normalizedDuration) || !Number.isFinite(durationMinutes)) {
    return {
      ok: false,
      field: 'durationMinutes',
      message: 'أدخل مدة صحيحة بالدقائق، بصفر أو أكثر.',
    };
  }

  return { ok: true, episodeNumber, durationMinutes };
}

export function validateEpisodeAudioFile(file: File): string | null {
  const recognizedType = !file.type || AUDIO_MIME_TYPES.has(file.type);
  if (!recognizedType && !AUDIO_FILE_NAME_PATTERN.test(file.name)) {
    return 'اختر ملف MP3 أو WAV.';
  }
  if (file.size > MAX_AUDIO_FILE_BYTES) {
    return 'حجم الملف أكبر من 500 م.ب. اختر ملفًا أصغر.';
  }
  return null;
}

type EpisodeOperation = 'save' | 'transition';

export function getEpisodeOperationErrorMessage(
  cause: unknown,
  operation: EpisodeOperation,
): string {
  if (!isAdminRepositoryError(cause)) {
    return operation === 'save'
      ? 'تعذّر حفظ الحلقة. حاول مرة أخرى.'
      : 'تعذّر تحديث حالة الحلقة. حاول مرة أخرى.';
  }

  switch (cause.code) {
    case 'UNAUTHENTICATED':
      return 'انتهت جلسة الدخول. سجّل الدخول ثم حاول مرة أخرى.';
    case 'FORBIDDEN':
      return 'لا تملك صلاحية تنفيذ هذا الإجراء.';
    case 'NOT_FOUND':
      return 'لم تعد الحلقة موجودة. ارجع إلى قائمة الحلقات.';
    case 'CONFLICT':
      return 'تغيّرت بيانات الحلقة. حدّث الصفحة ثم حاول مرة أخرى.';
    case 'NETWORK':
    case 'REMOTE_UNAVAILABLE':
    case 'RATE_LIMITED':
      return 'تعذّر الاتصال بالخادم. انتظر قليلًا ثم حاول مرة أخرى.';
    case 'VALIDATION':
      return operation === 'save'
        ? 'تعذّر حفظ البيانات المدخلة. راجع الحقول ثم حاول مرة أخرى.'
        : 'لا تسمح حالة الحلقة الحالية بهذا الإجراء.';
    case 'UNSUPPORTED_CAPABILITY':
      return 'هذا الإجراء غير متاح في بيئة الإدارة الحالية.';
    case 'CONFIGURATION':
    case 'REMOTE_ERROR':
    case 'INVALID_RESPONSE':
      return operation === 'save'
        ? 'تعذّر حفظ الحلقة بسبب خطأ في الخدمة. حاول مرة أخرى.'
        : 'تعذّر تحديث الحالة بسبب خطأ في الخدمة. حاول مرة أخرى.';
  }
}
