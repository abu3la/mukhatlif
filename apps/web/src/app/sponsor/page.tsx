import type { Metadata } from 'next';
import { RequestForm } from '@/components/request-form';
import { RequestPage } from '@/components/request-page';
import { apiOrigin } from '@/lib/config';

export const metadata: Metadata = {
  title: 'الشراكات والرعايات',
  description: 'تواصل مع فريق مختلف للرعاية أو لبناء شراكة محتوى.',
  alternates: { canonical: '/sponsor' },
};

export default function SponsorPage() {
  return (
    <RequestPage
      title="الشراكات والرعايات"
      intro="اختر نوع التعاون، ثم عرّفنا بالجهة والفكرة."
      note="يصل الطلب إلى فريق الشراكات، ويراجع التفاصيل ثم يتواصل مع مسؤول الجهة."
    >
      <RequestForm apiOrigin={apiOrigin()} type="sponsorship" allowPartnershipChoice />
    </RequestPage>
  );
}
