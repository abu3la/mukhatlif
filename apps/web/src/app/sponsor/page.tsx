import type { Metadata } from 'next';
import { RequestForm } from '@/components/request-form';
import { RequestPage } from '@/components/request-page';
import { ApiUnavailableError, listShows } from '@/lib/api';
import { apiOrigin } from '@/lib/config';

export const metadata: Metadata = {
  title: 'الشراكات والرعايات',
  description: 'تواصل مع فريق مختلف للرعاية أو لبناء شراكة محتوى.',
  alternates: { canonical: '/sponsor' },
};

export default async function SponsorPage() {
  let showNames: string[] = [];
  try {
    showNames = (await listShows()).map((show) => show.titleAr);
  } catch (error) {
    if (!(error instanceof ApiUnavailableError)) throw error;
  }
  return (
    <RequestPage
      title="كن جزءًا من الحوار."
      intro="عرّفنا بعلامتك، والبرنامج أو الموضوع الذي يهمك."
      note="يصل الطلب إلى فريق الشراكات، ويراجع التفاصيل ثم يتواصل مع مسؤول الجهة."
    >
      <RequestForm
        apiOrigin={apiOrigin()}
        type="sponsorship"
        allowPartnershipChoice
        showNames={showNames}
      />
    </RequestPage>
  );
}
