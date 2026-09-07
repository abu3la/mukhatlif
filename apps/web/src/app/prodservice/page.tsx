import type { Metadata } from 'next';
import { ProductionRequest } from '@/components/production-request';
import { singleQuery } from '@/lib/public-content';
import { RequestPage } from '@/components/request-page';
import { apiOrigin } from '@/lib/config';

export const metadata: Metadata = {
  title: 'خدمة الإنتاج',
  description: 'اطلب خدمة إنتاج بودكاست أو محتوى صوتي من فريق مختلف.',
  alternates: { canonical: '/prodservice' },
};

export default async function ProductionServicePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const service = singleQuery((await searchParams).service);
  return (
    <RequestPage
      title="لديك فكرة؟ لنبدأ منها."
      intro="من الجمهور والرسالة، إلى الشكل والنطاق. ثلاث خطوات توضح ما تحتاجه."
      note="يقرأ فريق الإنتاج تفاصيل المشروع، ثم يتواصل معك لتحديد النطاق والموعد والخطوة التالية."
    >
      <ProductionRequest apiOrigin={apiOrigin()} initialService={service} />
    </RequestPage>
  );
}
