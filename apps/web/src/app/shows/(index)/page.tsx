import type { Metadata } from 'next';
import { ShowCard } from '@/components/cards';
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
      <div className="shell">
        <ErrorState />
      </div>
    );
  }

  return (
    <div className="shell section">
      <div className="section__head">
        <h1 className="section__title">البرامج</h1>
      </div>
      {shows.length === 0 ? (
        <EmptyState title="لا توجد برامج بعد" text="سيظهر هنا أول برنامج فور نشره." />
      ) : (
        <div className="grid grid--shows">
          {shows.map((show) => (
            <ShowCard key={show.id} show={show} />
          ))}
        </div>
      )}
    </div>
  );
}
