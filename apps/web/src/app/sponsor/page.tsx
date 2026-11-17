import type { Metadata } from 'next';
import { RequestForm } from '@/components/request-form';
import { RequestPage } from '@/components/request-page';
import { ApiUnavailableError, listShows } from '@/lib/api';
import { apiOrigin } from '@/lib/config';

export const metadata: Metadata = {
  title: 'الرعايات والمشاريع',
  description: 'من رعاية برامجنا إلى إنتاج محتواك، نطوّر معك أفكارًا تخدم أهدافك وتصل إلى جمهورك.',
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
      title="تعاون مع مختلف"
      intro="من رعاية برامجنا إلى إنتاج محتواك، نطوّر معك أفكارًا تخدم أهدافك وتصل إلى جمهورك."
      details={
        <dl className="collaboration-paths">
          <div>
            <dt>الرعايات والشراكات</dt>
            <dd>
              نربط علامتك بالمجتمع والبرنامج المناسبين، ونطوّر حضورًا داخل المحتوى يخدم أهدافك
              ويقدّم قيمة للجمهور.
            </dd>
          </div>
          <div>
            <dt>مشاريع الإنتاج</dt>
            <dd>
              ننتج لجهتك برامج بودكاست وفيديوهات وأعمالًا صوتية، من تطوير الفكرة إلى الإنتاج
              والتسليم، بحسب نطاق المشروع.
            </dd>
          </div>
        </dl>
      }
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
