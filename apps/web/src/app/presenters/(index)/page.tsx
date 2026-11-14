import type { Metadata } from 'next';
import Link from 'next/link';
import { PresenterCard } from '@/components/communities';
import { PRESENTERS } from '@/lib/communities';

export const metadata: Metadata = {
  title: 'مقدّمو مختلف',
  description: 'تعرّف على مقدّمي برامجنا، وخبراتهم، والمواضيع التي يفتحونها للنقاش.',
  alternates: { canonical: '/presenters' },
};

export default function PresentersPage() {
  return (
    <div className="content-page public-page">
      <div className="content-container">
        <header className="public-page-head">
          <h1>مقدّمو مختلف</h1>
          <p>تعرّف على مقدّمي برامجنا، وخبراتهم، والمواضيع التي يفتحونها للنقاش.</p>
        </header>
        <div className="presenter-grid" role="list">
          {PRESENTERS.map((presenter) => (
            <div className="card-cell" role="listitem" key={presenter.slug}>
              <PresenterCard presenter={presenter} />
            </div>
          ))}
        </div>
        <section className="content-section community-invite" aria-labelledby="host-invite">
          <div>
            <h2 className="community-invite__title" id="host-invite">
              تحب تستكشف قصص الناس وتفتح سواليف؟
            </h2>
            <p>شاركنا اهتمامك بتقديم برنامج مع مختلف، وأرفق نماذج من أعمالك.</p>
          </div>
          <Link className="public-primary" href="/join-us">
            سجّل اهتمامك كمقدّم
          </Link>
        </section>
      </div>
    </div>
  );
}
