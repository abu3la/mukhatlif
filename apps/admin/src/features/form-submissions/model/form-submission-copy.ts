import type {
  FormNotificationStatus,
  FormSubmission,
  FormSubmissionStatus,
  FormSubmissionType,
} from '@mukhtalif/types';
import { plural } from '@/lib';

export const FORM_SUBMISSION_TYPE_LABELS = {
  sponsorship: 'رعاية',
  partnership: 'شراكة',
  guest_suggestion: 'اقتراح ضيف',
  careers: 'الانضمام إلى الفريق',
  production_service: 'خدمة إنتاج',
  guest_review: 'تقييم ضيف',
} as const satisfies Record<FormSubmissionType, string>;

export const FORM_SUBMISSION_STATUS_LABELS = {
  new: 'جديد',
  in_review: 'قيد المراجعة',
  contacted: 'جرى التواصل',
  resolved: 'مكتمل',
  rejected: 'مرفوض',
  spam: 'رسالة مزعجة',
} as const satisfies Record<FormSubmissionStatus, string>;

export const FORM_NOTIFICATION_STATUS_LABELS = {
  pending: 'بانتظار الإرسال',
  sending: 'جارٍ الإرسال',
  sent: 'أُرسل',
  failed: 'تعذّر الإرسال',
  unconfigured: 'غير مهيّأ',
} as const satisfies Record<FormNotificationStatus, string>;

export function formatFormSubmissionCount(count: number): string {
  return plural(count, {
    zero: 'لا طلبات',
    one: 'طلب واحد',
    two: 'طلبان',
    few: 'طلبات',
    many: 'طلبًا',
  });
}

export function formSubmissionSummary(submission: FormSubmission): string {
  switch (submission.type) {
    case 'sponsorship':
    case 'partnership':
      return submission.payload.organizationName;
    case 'guest_suggestion':
      return submission.payload.guestName;
    case 'careers':
    case 'production_service':
      return submission.payload.name;
    case 'guest_review':
      return submission.payload.guestName;
  }
}

export interface FormSubmissionDisplayField {
  readonly label: string;
  readonly value: string;
  readonly direction?: 'ltr' | 'auto';
  readonly href?: string;
}

function optionalField(
  label: string,
  value: string | undefined,
  options: Pick<FormSubmissionDisplayField, 'direction' | 'href'> = {},
): FormSubmissionDisplayField[] {
  return value?.trim() ? [{ label, value, ...options }] : [];
}

function safePublicHref(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function formSubmissionDisplayFields(
  submission: FormSubmission,
): FormSubmissionDisplayField[] {
  switch (submission.type) {
    case 'sponsorship':
      return [
        { label: 'الجهة', value: submission.payload.organizationName },
        { label: 'اسم المسؤول', value: submission.payload.contactName },
        { label: 'البريد الإلكتروني', value: submission.payload.email, direction: 'ltr' },
        { label: 'رقم الهاتف', value: submission.payload.phone, direction: 'ltr' },
        ...optionalField('تفاصيل الرعاية', submission.payload.message),
      ];
    case 'partnership':
      return [
        { label: 'الجهة', value: submission.payload.organizationName },
        { label: 'اسم المسؤول', value: submission.payload.contactName },
        { label: 'البريد الإلكتروني', value: submission.payload.email, direction: 'ltr' },
        { label: 'رقم الهاتف', value: submission.payload.phone, direction: 'ltr' },
        ...optionalField('نوع الشراكة', submission.payload.partnershipType),
        { label: 'مقترح الشراكة', value: submission.payload.proposal },
        ...optionalField('موقع الجهة', submission.payload.organizationWebsite, {
          direction: 'ltr',
          href: safePublicHref(submission.payload.organizationWebsite),
        }),
      ];
    case 'guest_suggestion':
      return [
        { label: 'اسم الضيف', value: submission.payload.guestName },
        { label: 'التخصص أو المهنة', value: submission.payload.profession },
        ...optionalField('البرنامج المقترح', submission.payload.showName),
        ...optionalField('الحساب أو الموقع', submission.payload.socialUrl, {
          direction: 'ltr',
          href: safePublicHref(submission.payload.socialUrl),
        }),
        ...optionalField('المدينة', submission.payload.city),
        ...optionalField('رقم الهاتف', submission.payload.phone, { direction: 'ltr' }),
        ...optionalField('ملاحظات', submission.payload.notes),
      ];
    case 'careers':
      return [
        { label: 'الاسم', value: submission.payload.name },
        { label: 'البريد الإلكتروني', value: submission.payload.email, direction: 'ltr' },
        { label: 'رقم الهاتف', value: submission.payload.phone, direction: 'ltr' },
        { label: 'الدور المطلوب', value: submission.payload.desiredRole },
        { label: 'لماذا مختلف؟', value: submission.payload.whyMukhtalif },
        { label: 'المهارات', value: submission.payload.skills },
        ...optionalField('الحساب المهني', submission.payload.socialUrl, {
          direction: 'ltr',
          href: safePublicHref(submission.payload.socialUrl),
        }),
        ...optionalField('ملف الأعمال', submission.payload.portfolioUrl, {
          direction: 'ltr',
          href: safePublicHref(submission.payload.portfolioUrl),
        }),
      ];
    case 'production_service':
      return [
        { label: 'الاسم', value: submission.payload.name },
        { label: 'البريد الإلكتروني', value: submission.payload.email, direction: 'ltr' },
        { label: 'رقم الهاتف', value: submission.payload.phone, direction: 'ltr' },
        ...optionalField('الجهة', submission.payload.organizationName),
        { label: 'تفاصيل المشروع', value: submission.payload.details },
      ];
    case 'guest_review':
      return [
        { label: 'اسم الضيف', value: submission.payload.guestName },
        { label: 'البرنامج', value: submission.payload.showName },
        ...optionalField('البريد الإلكتروني', submission.payload.email, { direction: 'ltr' }),
        { label: 'التقييم العام', value: `${submission.payload.overallRating} من 5` },
        { label: 'تقييم المقدّم', value: `${submission.payload.hostRating} من 5` },
        ...optionalField('ملاحظات', submission.payload.notes),
      ];
  }
}

export function notificationErrorLabel(code: string | undefined): string | undefined {
  if (!code) return undefined;
  const labels: Readonly<Record<string, string>> = {
    NOTIFICATION_NOT_CONFIGURED: 'إرسال البريد غير مهيّأ.',
    RECIPIENT_NOT_CONFIGURED: 'لم يُحدّد مستلم لهذا النوع من الطلبات.',
    NOTIFICATION_CONFIG_INVALID: 'إعدادات البريد غير صحيحة.',
    DELIVERY_REJECTED: 'رفض مزوّد البريد الرسالة.',
    NOTIFICATION_DELIVERY_FAILED: 'تعذّر الاتصال بمزوّد البريد.',
  };
  return labels[code] ?? 'تعذّر إرسال التنبيه.';
}
