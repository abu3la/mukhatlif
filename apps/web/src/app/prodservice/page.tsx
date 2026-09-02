import type { Metadata } from 'next';
import { RequestForm } from '@/components/request-form';
import { RequestPage } from '@/components/request-page';
import { apiOrigin } from '@/lib/config';

export const metadata: Metadata = {
  title: 'خدمة الإنتاج',
  description: 'اطلب خدمة إنتاج بودكاست أو محتوى صوتي من فريق مختلف.',
  alternates: { canonical: '/prodservice' },
};

export default function ProductionServicePage() {
  return (
    <RequestPage
      title="خدمة الإنتاج"
      intro="شاركنا فكرة المشروع وما تحتاجه من تخطيط أو تسجيل أو تحرير أو توزيع."
      note="يقرأ فريق الإنتاج تفاصيل المشروع، ثم يتواصل معك لتحديد النطاق والموعد والخطوة التالية."
    >
      <RequestForm apiOrigin={apiOrigin()} type="production_service" />
    </RequestPage>
  );
}
