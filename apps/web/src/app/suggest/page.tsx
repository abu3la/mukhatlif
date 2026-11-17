import type { Metadata } from 'next';
import { RequestForm } from '@/components/request-form';
import { RequestPage } from '@/components/request-page';
import { findProgramme } from '@/lib/communities';
import { apiOrigin } from '@/lib/config';
import { singleQuery } from '@/lib/public-content';

export const metadata: Metadata = {
  title: 'اقترح لنا ضيفًا',
  description: 'رشّح ضيفًا مناسبًا لأحد برامج شبكة مختلف.',
  alternates: { canonical: '/suggest' },
};

export default async function SuggestPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // «اقترح ضيفًا» on a programme page arrives with ?programme=<slug>.
  const programme = findProgramme(singleQuery((await searchParams).programme))?.programme;
  return (
    <RequestPage
      title="مين ودّك نسمع قصته؟"
      intro="رشّح لنا شخصًا عنده تجربة أو معرفة تستحق نفتح حولها حوار."
      note="يراجع فريق التحرير الترشيح ومدى مناسبته للبرامج، ثم يتواصل إذا احتاج إلى معلومات إضافية."
    >
      <RequestForm
        apiOrigin={apiOrigin()}
        type="guest_suggestion"
        defaultShowName={programme?.name}
      />
    </RequestPage>
  );
}
