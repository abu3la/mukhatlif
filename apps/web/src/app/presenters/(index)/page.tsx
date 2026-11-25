import type { Metadata } from 'next';
import Link from 'next/link';
import { PresenterCredits } from '@/components/presenter-credits';

export const metadata: Metadata = {
  title: 'مقدّمو مختلف',
  description: 'تعرّف على مقدّمي برامجنا، وخبراتهم، والمواضيع التي يفتحونها للنقاش.',
  alternates: { canonical: '/presenters' },
};

/**
 * «مقدّمو مختلف» on the presentation site (D-24). The night stage names the
 * page; the sheet reads like the programmes' closing credits, each programme
 * on one side of the axis and its presenters on the other, and ends on the
 * invitation to present.
 */
export default function PresentersPage() {
  return (
    <div className="stage-page presenters-page">
      <div className="stage-scope">
        <section className="stage-intro" aria-labelledby="presenters-title">
          <div className="content-container stage-head">
            <h1 id="presenters-title" className="stage-statement">
              مقدّمو مختلف
            </h1>
            <p className="stage-head__lede">
              تعرّف على مقدّمي برامجنا، وخبراتهم، والمواضيع التي يفتحونها للنقاش.
            </p>
          </div>
        </section>
      </div>

      <div className="home-sheet">
        <div className="home-sheet__surface">
          <div className="content-container">
            <PresenterCredits labelledBy="presenters-title" />
          </div>

          <div className="content-container">
            <section className="community-invite cover-invite" aria-labelledby="host-invite">
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
      </div>
    </div>
  );
}
