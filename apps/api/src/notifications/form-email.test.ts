import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  FormSubmission,
  FormSubmissionPayloadByType,
  FormSubmissionType,
} from '@mukhtalif/types';
import { ResendEmailNotifier } from './form-email';

const createdAt = '2026-09-02T14:08:00.000Z';

function submission<Type extends FormSubmissionType>(
  type: Type,
  payload: FormSubmissionPayloadByType[Type],
): FormSubmission {
  return {
    id: `frm-${type}`,
    type,
    payload,
    status: 'new',
    internalNotes: '',
    attachmentRefs: [],
    sourceMetadata: {
      requestId: `req-${type}`,
      formVersion: 1,
      privacyAcceptedAt: createdAt,
    },
    notificationStatus: 'pending',
    notificationAttemptCount: 0,
    statusUpdatedAt: createdAt,
    createdAt,
    updatedAt: createdAt,
  } as FormSubmission;
}

interface OutboundEmail {
  from: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
  reply_to?: string;
}

async function sendAndRead(submitted: FormSubmission): Promise<OutboundEmail> {
  const fetchMock = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(JSON.stringify({ id: `email-${submitted.type}` })));
  await new ResendEmailNotifier('re_test_key').send({
    submission: submitted,
    fromEmail: 'forms@devmail.mukhtalif.net',
    recipients: ['aaahashmi95@gmail.com'],
  });
  const body = fetchMock.mock.calls[0]?.[1]?.body;
  if (!body) throw new Error('Expected a Resend request body');
  return JSON.parse(String(body)) as OutboundEmail;
}

const formCases: Array<{
  name: string;
  submitted: FormSubmission;
  title: string;
  expectedLabels: string[];
  ltrValue: string;
}> = [
  {
    name: 'sponsorship',
    submitted: submission('sponsorship', {
      organizationName: 'شركة الاختبار',
      contactName: 'سارة محمد',
      email: 'sponsor@example.com',
      phone: '+966 50 123 4567',
      message: 'رعاية موسم جديد.',
    }),
    title: 'طلب رعاية',
    expectedLabels: ['الجهة', 'اسم المسؤول', 'البريد الإلكتروني', 'رقم التواصل', 'التفاصيل'],
    ltrValue: 'sponsor@example.com',
  },
  {
    name: 'partnership',
    submitted: submission('partnership', {
      organizationName: 'مؤسسة الشراكة',
      contactName: 'خالد علي',
      email: 'partner@example.com',
      phone: '+966501234568',
      partnershipType: 'شراكة محتوى',
      proposal: 'إنتاج سلسلة مشتركة.',
      organizationWebsite: 'https://partner.example.com',
    }),
    title: 'طلب شراكة',
    expectedLabels: ['نوع الشراكة', 'المقترح', 'موقع الجهة'],
    ltrValue: 'https://partner.example.com',
  },
  {
    name: 'guest_suggestion',
    submitted: submission('guest_suggestion', {
      guestName: 'نورة القحطاني',
      profession: 'مهندسة طاقة',
      showName: 'بترولي',
      socialUrl: 'https://social.example.com/noura',
      city: 'الرياض',
      phone: '+966501234567',
      notes: 'لديها خبرة في الطاقة المتجددة.',
    }),
    title: 'اقتراح ضيف',
    expectedLabels: ['اسم الضيف المقترح', 'المجال أو المهنة', 'البرنامج المقترح', 'المدينة'],
    ltrValue: 'https://social.example.com/noura',
  },
  {
    name: 'careers',
    submitted: submission('careers', {
      name: 'ليان أحمد',
      email: 'career@example.com',
      phone: '+966501234569',
      desiredRole: 'منتجة محتوى',
      whyMukhtalif: 'أؤمن بقيمة المحتوى العربي المتخصص.',
      skills: 'البحث والتحرير وإدارة الإنتاج.',
      socialUrl: 'https://social.example.com/layan',
      portfolioUrl: 'https://portfolio.example.com/layan',
    }),
    title: 'طلب انضمام للفريق',
    expectedLabels: ['الدور المطلوب', 'سبب الانضمام', 'المهارات', 'ملف الأعمال'],
    ltrValue: 'https://portfolio.example.com/layan',
  },
  {
    name: 'production_service',
    submitted: submission('production_service', {
      name: 'عبدالله صالح',
      email: 'production@example.com',
      phone: '+966501234560',
      organizationName: 'شركة الإنتاج',
      details: 'نحتاج إنتاج موسم من ثماني حلقات صوتية.',
    }),
    title: 'طلب خدمة إنتاج',
    expectedLabels: ['الاسم', 'البريد الإلكتروني', 'رقم التواصل', 'تفاصيل الخدمة'],
    ltrValue: 'production@example.com',
  },
  {
    name: 'guest_review',
    submitted: submission('guest_review', {
      guestName: 'ضيف التجربة',
      showName: 'غلاف',
      email: 'guest@example.com',
      overallRating: 5,
      hostRating: 4,
      notes: 'تجربة منظمة وواضحة.',
    }),
    title: 'تقييم تجربة ضيف',
    expectedLabels: ['اسم الضيف', 'البرنامج', 'التقييم العام', 'تقييم المضيف'],
    ltrValue: 'guest@example.com',
  },
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Resend form email HTML', () => {
  it.each(formCases)('renders the $name form as branded RTL HTML', async (formCase) => {
    const outbound = await sendAndRead(formCase.submitted);

    expect(outbound).toMatchObject({
      from: 'forms@devmail.mukhtalif.net',
      to: ['aaahashmi95@gmail.com'],
      subject: `مختلف: ${formCase.title} جديد`,
    });
    expect(outbound.text.startsWith('وصل طلب جديد إلى استوديو مختلف.\n')).toBe(true);
    expect(outbound.text).toContain(`النوع: ${formCase.title}`);
    expect(outbound.text).toContain(`رقم الطلب: ${formCase.submitted.id}`);

    expect(outbound.html).toContain('<html lang="ar" dir="rtl">');
    expect(outbound.html).toContain('<table role="presentation"');
    expect(outbound.html).toContain(`${formCase.title} جديد`);
    expect(outbound.html).toContain('بيانات الطلب');
    for (const label of formCase.expectedLabels) expect(outbound.html).toContain(label);
    expect(outbound.html).toContain(
      `<bdi dir="ltr" style="direction:ltr;unicode-bidi:embed;">${formCase.ltrValue}</bdi>`,
    );
    expect(outbound.html).not.toMatch(/<(?:script|img|link)\b/i);
  });

  it('escapes every untrusted value while preserving the plain-text fallback', async () => {
    const malicious = `<img src=x onerror="alert('x')"> & <script>run()</script>\nالسطر الثاني`;
    const submitted = submission('sponsorship', {
      organizationName: `شركة "اختبار" <غير موثوقة>`,
      contactName: `سارة & شركاؤها`,
      email: 'safe@example.com',
      phone: '+966501234567',
      message: malicious,
    });

    const outbound = await sendAndRead(submitted);

    expect(outbound.text).toContain(malicious);
    expect(outbound.html).not.toContain('<img src=x');
    expect(outbound.html).not.toContain('<script>run()</script>');
    expect(outbound.html).toContain(
      `&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt; &amp; &lt;script&gt;run()&lt;/script&gt;<br>السطر الثاني`,
    );
    expect(outbound.html).toContain('شركة &quot;اختبار&quot; &lt;غير موثوقة&gt;');
    expect(outbound.html).toContain('سارة &amp; شركاؤها');
  });
});
