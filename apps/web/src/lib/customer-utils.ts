import type { CustomerLibrary, CustomerProfile } from '@mukhtalif/types';

export interface CustomerConfig {
  apiOrigin: string | null;
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  googleEnabled?: boolean;
}

export type CustomerProfilePatch = Partial<
  Pick<CustomerProfile, 'displayName' | 'gender' | 'birthDate' | 'interests' | 'onboarded'>
>;

export function emptyCustomerLibrary(): CustomerLibrary {
  return {
    savedEpisodeIds: [],
    savedArticleIds: [],
    followedShowIds: [],
    progress: [],
    playlists: [],
    bookmarks: [],
    queueEpisodeIds: [],
  };
}

/** Only same-site, ordinary application paths may be restored after authentication. */
export function safeCustomerReturn(
  value: string | null | undefined,
  fallback = '/account',
): string {
  const unsafe = (text: string) =>
    text.includes('\\') ||
    Array.from(text).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    );
  if (!value || !value.startsWith('/') || value.startsWith('//') || unsafe(value)) return fallback;
  try {
    const parsed = new URL(value, 'https://mukhtalif.invalid');
    const decodedPath = decodeURIComponent(parsed.pathname);
    if (
      parsed.origin !== 'https://mukhtalif.invalid' ||
      decodedPath.startsWith('//') ||
      unsafe(decodedPath) ||
      /^\/(login|signin|signup|auth|confirm|forgot|reset|onboarding)(\/|$)/i.test(decodedPath)
    )
      return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function customerError(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  const message = error instanceof Error ? error.message : '';
  if (code === 'email_not_confirmed') return 'أكّد بريدك الإلكتروني قبل تسجيل الدخول.';
  if (code === 'invalid_credentials') return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
  if (code === 'otp_expired' || code === 'flow_state_expired' || code === 'flow_state_not_found')
    return 'انتهت صلاحية الرابط أو الرمز. اطلب رسالة جديدة.';
  if (
    code === 'over_email_send_rate_limit' ||
    code === 'over_request_rate_limit' ||
    code === 'RATE_LIMITED'
  )
    return 'انتظر قليلًا قبل المحاولة مرة أخرى.';
  if (code === 'weak_password' || code === 'same_password')
    return 'اختر كلمة مرور جديدة من 8 أحرف على الأقل.';
  if (code === 'email_exists' || code === 'user_already_exists')
    return 'هذا البريد مرتبط بحساب. جرّب تسجيل الدخول.';
  if (code === 'reauthentication_needed' || code === 'reauthentication_not_valid')
    return 'أكّد هويتك بالرمز المرسل إلى بريدك، ثم حاول مجددًا.';
  if (/^[\u0600-\u06ff]/.test(message)) return message;
  return 'تعذّر إكمال الطلب. تحقق من الاتصال وحاول مجددًا.';
}

export function episodeCount(count: number): string {
  if (count === 0) return 'لا حلقات بعد';
  if (count === 1) return 'حلقة واحدة';
  if (count === 2) return 'حلقتان';
  if (count >= 3 && count <= 10) return `${count} حلقات`;
  return `${count} حلقة`;
}

export const CUSTOMER_TOPICS = ['المهن', 'الصحة', 'التقنية', 'الثقافة', 'المجتمع'] as const;
