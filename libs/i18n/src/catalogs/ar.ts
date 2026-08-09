/**
 * Arabic is Mukhtalif's source language: this catalog defines the full key
 * set, and every other locale is typed against it.
 */
export const ar = {
  'brand.name': 'مختلف',
  'brand.tagline': 'لمسار مهني يشبهك',

  'nav.overview': 'نظرة عامة',
  'nav.shows': 'البرامج',
  'nav.episodes': 'الحلقات',
  'nav.articles': 'المقالات',
  'nav.subscribers': 'المشتركون',
  'nav.library': 'مكتبتي',
  'nav.account': 'الحساب',

  'episode.status.draft': 'مسودة',
  'episode.status.scheduled': 'مجدولة',
  'episode.status.published': 'منشورة',
  'episode.status.archived': 'مؤرشفة',

  'article.status.draft': 'مسودة',
  'article.status.published': 'منشور',

  'subscription.status.active': 'نشط',
  'subscription.status.past_due': 'متأخر السداد',
  'subscription.status.canceled': 'ملغى',

  'action.play': 'تشغيل',
  'action.pause': 'إيقاف مؤقت',
  'action.follow': 'متابعة',
  'action.unfollow': 'إلغاء المتابعة',
  'action.signIn': 'تسجيل الدخول',
  'action.subscribe': 'اشترك',

  'label.premium': 'حصري',
  'label.episode': 'حلقة',
  'label.host': 'يقدمه',

  'state.loading': 'جارٍ التحميل…',
  'state.error': 'تعذر الوصول إلى الخادم',
  'state.empty': 'لا توجد عناصر بعد',
} as const;

export type MessageKey = keyof typeof ar;
