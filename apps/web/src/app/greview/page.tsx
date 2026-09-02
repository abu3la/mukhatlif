import type { Metadata } from 'next';
import { RequestForm } from '@/components/request-form';
import { RequestPage } from '@/components/request-page';
import { apiOrigin } from '@/lib/config';

export const metadata: Metadata = {
  title: 'قيّم تجربتك معنا',
  description: 'شارك فريق مختلف تقييمك لتجربة المشاركة كضيف.',
  alternates: { canonical: '/greview' },
};

export default function GuestReviewPage() {
  return (
    <RequestPage
      title="قيّم تجربتك معنا"
      intro="ملاحظاتك تساعدنا على تحسين تجربة الضيوف في الحلقات القادمة."
      note="تصل الملاحظات إلى الفريق المسؤول عن تجربة الضيوف وتُراجع داخليًا."
    >
      <RequestForm apiOrigin={apiOrigin()} type="guest_review" />
    </RequestPage>
  );
}
