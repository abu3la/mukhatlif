import type { Metadata } from 'next';
import { RequestForm } from '@/components/request-form';
import { RequestPage } from '@/components/request-page';
import { apiOrigin } from '@/lib/config';

export const metadata: Metadata = {
  title: 'اقترح لنا ضيفًا',
  description: 'رشّح ضيفًا مناسبًا لأحد برامج شبكة مختلف.',
  alternates: { canonical: '/suggest' },
};

export default function SuggestPage() {
  return (
    <RequestPage
      title="اقترح لنا ضيفًا"
      intro="رشّح شخصًا لديه تجربة أو معرفة تستحق أن تصل إلى المستمعين."
      note="يراجع فريق التحرير الترشيح ومدى مناسبته للبرامج، ثم يتواصل إذا احتاج إلى معلومات إضافية."
    >
      <RequestForm apiOrigin={apiOrigin()} type="guest_suggestion" />
    </RequestPage>
  );
}
