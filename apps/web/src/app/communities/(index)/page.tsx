import type { Metadata } from 'next';
import { CommunityGrid } from '@/components/communities';
import { COMMUNITIES } from '@/lib/communities';

export const metadata: Metadata = {
  title: 'مجتمعات مختلف',
  description: 'لكل مجال عالمه الخاص وتجاربه. اكتشف البرامج والقصص الأقرب إلى اهتماماتك.',
  alternates: { canonical: '/communities' },
};

export default function CommunitiesPage() {
  return (
    <div className="content-page public-page">
      <div className="content-container">
        <header className="public-page-head">
          <h1>اكتشف مجتمعات مختلف</h1>
          <p>لكل مجال عالمه الخاص وتجاربه. اكتشف البرامج والقصص الأقرب إلى اهتماماتك.</p>
        </header>
        <CommunityGrid communities={COMMUNITIES} />
      </div>
    </div>
  );
}
