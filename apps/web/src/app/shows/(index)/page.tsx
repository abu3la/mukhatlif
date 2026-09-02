import type { Metadata } from 'next';
import { ShowCard } from '@/components/cards';
import { formatNumber } from '@/components/formatting';
import { EmptyState, ErrorState } from '@/components/states';
import { ApiUnavailableError, listShows } from '@/lib/api';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'البرامج',
  description: 'كل برامج شبكة مختلف عن المسار المهني.',
  alternates: { canonical: '/shows' },
};

export default async function ShowsPage() {
  let shows;
  try {
    shows = await listShows();
  } catch (error) {
    if (!(error instanceof ApiUnavailableError)) throw error;
    return (
      <div className="content-page">
        <div className="content-container">
          <ErrorState />
        </div>
      </div>
    );
  }

  return (
    <div className="content-page">
      <div className="content-container content-section">
        <header className="content-section__header">
          <div>
            <h1 className="content-section__title">البرامج</h1>
            <p className="content-section__meta">
              {shows.length > 0
                ? `${formatNumber(shows.length)} من برامج شبكة مختلف`
                : 'برامج أصلية عن العمل والمهنة'}
            </p>
          </div>
        </header>

        {shows.length === 0 ? (
          <EmptyState title="لا توجد برامج بعد" text="سيظهر هنا أول برنامج فور نشره." />
        ) : (
          <div className="shows-grid">
            {shows.map((show) => (
              <ShowCard key={show.id} show={show} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
