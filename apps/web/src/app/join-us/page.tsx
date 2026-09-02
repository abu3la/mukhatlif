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
      title="انضم إلى مختلف"
      intro="أخبرنا بما تتقنه، وبالدور الذي ترى أنك ستضيف من خلاله إلى الفريق."
      note="يراجع فريق مختلف الطلبات بحسب الاحتياج، ويتواصل مع أصحاب الخبرات المناسبة."
    >
      <RequestForm apiOrigin={apiOrigin()} type="careers" />
    </RequestPage>
  );
}
