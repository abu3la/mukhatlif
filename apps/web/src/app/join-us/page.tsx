import type { Metadata } from 'next';
import { RequestForm } from '@/components/request-form';
import { RequestPage } from '@/components/request-page';
import { apiOrigin } from '@/lib/config';

export const metadata: Metadata = {
  title: 'انضم إلى مختلف',
  description: 'عرّفنا بخبراتك والمجال الذي ترغب بالعمل فيه مع فريق مختلف.',
  alternates: { canonical: '/join-us' },
};

export default function JoinUsPage() {
  return (
    <RequestPage
      title="اشتغل مع مختلف"
      intro="عرّفنا عليك وعلى خبراتك، وأرفق نماذج من أعمالك."
      note="يراجع فريق مختلف الطلبات بحسب الاحتياج، ويتواصل مع أصحاب الخبرات المناسبة."
    >
      <RequestForm apiOrigin={apiOrigin()} type="careers" />
    </RequestPage>
  );
}
