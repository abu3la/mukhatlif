import type {
  NewsletterConsentEventKind,
  NewsletterSubscriptionSyncStatus,
} from '@mukhtalif/types';

export const NEWSLETTER_LOCAL_STATUS_LABELS = {
  explicit_consent: 'موافقة مسجلة',
  legacy_request: 'طلب سابق',
} as const satisfies Record<NewsletterConsentEventKind, string>;

export const NEWSLETTER_MAILCHIMP_STATUS_LABELS = {
  pending: 'بانتظار المزامنة',
  synced: 'قُبلت للمزامنة',
  failed: 'تعذرت المزامنة',
  unconfigured: 'الربط غير مهيأ',
  legacy_unverified: 'سجل قديم غير متحقق',
} as const satisfies Record<NewsletterSubscriptionSyncStatus, string>;
