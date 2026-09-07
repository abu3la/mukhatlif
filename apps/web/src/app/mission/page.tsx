import type { Metadata } from 'next';
import Link from 'next/link';
import { ShowCard } from '@/components/cards';
import { ApiUnavailableError, listShows } from '@/lib/api';
export const revalidate = 60;
export const metadata: Metadata = {
  title: 'قضيتنا',
  description: 'لمسار مهني يشبهك. المهنة وهمومها قضية مختلف.',
  alternates: { canonical: '/mission' },
};
export default async function MissionPage() {
  let shows: Awaited<ReturnType<typeof listShows>> = [];
  try {
    shows = (await listShows()).slice(0, 4);
  } catch (error) {
    if (!(error instanceof ApiUnavailableError)) throw error;
  }
  return (
    <div className="content-page public-page">
      <div className="content-container">
        <header className="public-page-head">
          <h1>لمسار مهني يشبهك.</h1>
        </header>
        <section className="public-mission">
          <h2>قضيتنا</h2>
          <p>
            نهدف إلى أن يعيش كل شخص يومًا مهنيًا يناسب قيمه وظروفه وإمكاناته، لذلك اخترنا المهنة
            وهمومها قضيتنا.
          </p>
          <p>
            تتنوع المهن وتتعدد تجارب أصحابها. في برامج مختلف وقراءاتها مساحة لفهم العمل، وتبادل
            التجربة، والتأمل في الخيارات التي تشكل حياتنا المهنية.
          </p>
          <Link className="public-primary" href="/shows">
            استكشف برامج مختلف
          </Link>
        </section>
        {shows.length ? (
          <div className="shows-grid public-mission-shows">
            {shows.map((show) => (
              <ShowCard key={show.id} show={show} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
