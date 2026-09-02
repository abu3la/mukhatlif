import type { FormSubmission, FormSubmissionType } from '@mukhtalif/types';

export interface FormEmailNotification {
  submission: FormSubmission;
  fromEmail: string;
  recipients: string[];
}

export interface FormEmailNotificationResult {
  providerMessageId: string;
}

export interface EmailNotifier {
  send(notification: FormEmailNotification): Promise<FormEmailNotificationResult>;
}

export class FormEmailNotificationError extends Error {
  constructor(public readonly code: 'DELIVERY_REJECTED' | 'DELIVERY_TIMEOUT' | 'INVALID_RESPONSE') {
    super(code);
    this.name = 'FormEmailNotificationError';
  }
}

const TYPE_LABELS: Record<FormSubmissionType, string> = {
  sponsorship: 'طلب رعاية',
  partnership: 'طلب شراكة',
  guest_suggestion: 'اقتراح ضيف',
  careers: 'طلب انضمام للفريق',
  production_service: 'طلب خدمة إنتاج',
  guest_review: 'تقييم تجربة ضيف',
};

const FIELD_LABELS: Record<FormSubmissionType, Readonly<Record<string, string>>> = {
  sponsorship: {
    organizationName: 'الجهة',
    contactName: 'اسم المسؤول',
    email: 'البريد الإلكتروني',
    phone: 'رقم التواصل',
    message: 'التفاصيل',
  },
  partnership: {
    organizationName: 'الجهة',
    contactName: 'اسم المسؤول',
    email: 'البريد الإلكتروني',
    phone: 'رقم التواصل',
    partnershipType: 'نوع الشراكة',
    proposal: 'المقترح',
    organizationWebsite: 'موقع الجهة',
  },
  guest_suggestion: {
    guestName: 'اسم الضيف المقترح',
    profession: 'المجال أو المهنة',
    showName: 'البرنامج المقترح',
    socialUrl: 'الرابط الاجتماعي',
    city: 'المدينة',
    phone: 'رقم التواصل',
    notes: 'ملاحظات',
  },
  careers: {
    name: 'الاسم',
    email: 'البريد الإلكتروني',
    phone: 'رقم التواصل',
    desiredRole: 'الدور المطلوب',
    whyMukhtalif: 'سبب الانضمام',
    skills: 'المهارات',
    socialUrl: 'الرابط الاجتماعي',
    portfolioUrl: 'ملف الأعمال',
  },
  production_service: {
    name: 'الاسم',
    email: 'البريد الإلكتروني',
    phone: 'رقم التواصل',
    organizationName: 'الجهة',
    details: 'تفاصيل الخدمة',
  },
  guest_review: {
    guestName: 'اسم الضيف',
    showName: 'البرنامج',
    email: 'البريد الإلكتروني',
    overallRating: 'التقييم العام',
    hostRating: 'تقييم المضيف',
    notes: 'ملاحظات',
  },
};

const LTR_FIELD_KEYS = new Set([
  'email',
  'phone',
  'organizationWebsite',
  'portfolioUrl',
  'socialUrl',
]);

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function htmlValue(key: string, value: unknown): string {
  const escaped = escapeHtml(typeof value === 'string' ? value : String(value)).replace(
    /\r\n?|\n/g,
    '<br>',
  );
  if (!LTR_FIELD_KEYS.has(key) && typeof value !== 'number') return escaped;
  return `<bdi dir="ltr" style="direction:ltr;unicode-bidi:embed;">${escaped}</bdi>`;
}

function payloadText(submission: FormSubmission): string {
  const fields = Object.entries(submission.payload).map(([key, value]) => {
    const rendered = typeof value === 'string' ? value : String(value);
    return `${FIELD_LABELS[submission.type][key] ?? key}: ${rendered}`;
  });
  return [
    'وصل طلب جديد إلى استوديو مختلف.',
    '',
    `النوع: ${TYPE_LABELS[submission.type]}`,
    `رقم الطلب: ${submission.id}`,
    `وقت الاستلام: ${submission.createdAt}`,
    '',
    ...fields,
    '',
    'راجع صندوق الطلبات في الاستوديو لتعيين المسؤول وتحديث الحالة.',
  ].join('\n');
}

function payloadHtml(submission: FormSubmission): string {
  const typeLabel = TYPE_LABELS[submission.type];
  const rows = Object.entries(submission.payload)
    .map(([key, value]) => {
      const label = escapeHtml(FIELD_LABELS[submission.type][key] ?? key);
      return `<tr>
        <td width="34%" valign="top" style="padding:16px 0 16px 16px;border-bottom:1px solid #e2e3ee;color:#6d7195;font-size:14px;line-height:1.7;text-align:right;">${label}</td>
        <td valign="top" style="padding:16px 0;border-bottom:1px solid #e2e3ee;color:#171a56;font-size:16px;font-weight:600;line-height:1.8;text-align:right;overflow-wrap:anywhere;word-break:break-word;">${htmlValue(key, value)}</td>
      </tr>`;
    })
    .join('');
  const replyHint = replyTo(submission)
    ? `<p style="margin:0 0 8px;color:#4a4e7c;font-size:14px;line-height:1.8;">يمكنك الرد على هذه الرسالة للتواصل مع صاحب الطلب.</p>`
    : '';

  return `<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <title>${escapeHtml(typeLabel)} جديد</title>
  </head>
  <body dir="rtl" style="margin:0;padding:0;background:#f3f4f9;color:#171a56;font-family:Tahoma,Arial,'Segoe UI',sans-serif;-webkit-text-size-adjust:100%;">
    <div aria-hidden="true" style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(typeLabel)} جديد في صندوق طلبات الاستوديو.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f3f4f9" dir="rtl" style="width:100%;border-collapse:collapse;background:#f3f4f9;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" dir="rtl" style="width:100%;max-width:640px;border-collapse:separate;border-spacing:0;background:#ffffff;border-radius:14px;overflow:hidden;">
            <tr>
              <td bgcolor="#171a56" style="padding:26px 32px;background:#171a56;color:#ffffff;text-align:right;">
                <span style="font-size:28px;font-weight:700;line-height:1;">مختلف</span>
              </td>
            </tr>
            <tr>
              <td style="padding:34px 32px 12px;text-align:right;">
                <h1 style="margin:0 0 10px;color:#171a56;font-size:28px;font-weight:700;line-height:1.4;">${escapeHtml(typeLabel)} جديد</h1>
                <p style="margin:0;color:#4a4e7c;font-size:16px;line-height:1.8;">وصل طلب جديد إلى استوديو مختلف.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 32px 28px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" dir="rtl" bgcolor="#f7f7fb" style="width:100%;border-collapse:separate;border-spacing:0;background:#f7f7fb;border-radius:10px;">
                  <tr>
                    <td style="padding:18px 20px 8px;color:#6d7195;font-size:13px;line-height:1.7;text-align:right;">رقم الطلب</td>
                  </tr>
                  <tr>
                    <td style="padding:0 20px 14px;color:#171a56;font-size:15px;font-weight:700;line-height:1.7;text-align:right;overflow-wrap:anywhere;word-break:break-word;"><bdi dir="ltr" style="direction:ltr;unicode-bidi:embed;">${escapeHtml(submission.id)}</bdi></td>
                  </tr>
                  <tr>
                    <td style="padding:0 20px 8px;color:#6d7195;font-size:13px;line-height:1.7;text-align:right;">وقت الاستلام</td>
                  </tr>
                  <tr>
                    <td style="padding:0 20px 18px;color:#171a56;font-size:15px;font-weight:600;line-height:1.7;text-align:right;"><bdi dir="ltr" style="direction:ltr;unicode-bidi:embed;">${escapeHtml(submission.createdAt)}</bdi></td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 8px;text-align:right;">
                <h2 style="margin:0;color:#171a56;font-size:19px;font-weight:700;line-height:1.6;">بيانات الطلب</h2>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 30px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" dir="rtl" style="width:100%;border-collapse:collapse;">
                  ${rows}
                </table>
              </td>
            </tr>
            <tr>
              <td bgcolor="#eef0f7" style="padding:24px 32px;background:#eef0f7;text-align:right;">
                ${replyHint}
                <p style="margin:0;color:#4a4e7c;font-size:14px;line-height:1.8;">راجع صندوق الطلبات في الاستوديو لتعيين المسؤول وتحديث الحالة.</p>
              </td>
            </tr>
          </table>
          <p style="margin:18px 0 0;color:#5c5f80;font-size:12px;line-height:1.7;text-align:center;">رسالة داخلية من استوديو مختلف</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function replyTo(submission: FormSubmission): string | undefined {
  const value = (submission.payload as unknown as Record<string, unknown>).email;
  return typeof value === 'string' ? value : undefined;
}

/** Resend transport with a plain-text fallback and a strictly escaped HTML version. */
export class ResendEmailNotifier implements EmailNotifier {
  constructor(private readonly apiKey: string) {}

  async send(notification: FormEmailNotification): Promise<FormEmailNotificationResult> {
    let response: Response;
    try {
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          // If the provider accepted the first call but our response was lost,
          // a Studio retry within Resend's retention window must not duplicate it.
          'Idempotency-Key': `form-submission/${notification.submission.id}`,
        },
        body: JSON.stringify({
          from: notification.fromEmail,
          to: notification.recipients,
          subject: `مختلف: ${TYPE_LABELS[notification.submission.type]} جديد`,
          text: payloadText(notification.submission),
          html: payloadHtml(notification.submission),
          ...(replyTo(notification.submission)
            ? { reply_to: replyTo(notification.submission) }
            : {}),
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        throw new FormEmailNotificationError('DELIVERY_TIMEOUT');
      }
      throw new FormEmailNotificationError('DELIVERY_REJECTED');
    }
    if (!response.ok) throw new FormEmailNotificationError('DELIVERY_REJECTED');

    let result: unknown;
    try {
      result = await response.json();
    } catch {
      throw new FormEmailNotificationError('INVALID_RESPONSE');
    }
    const providerMessageId =
      result &&
      typeof result === 'object' &&
      typeof (result as Record<string, unknown>).id === 'string'
        ? ((result as Record<string, unknown>).id as string)
        : null;
    if (!providerMessageId) throw new FormEmailNotificationError('INVALID_RESPONSE');
    return { providerMessageId };
  }
}
