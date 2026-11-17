import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EpisodeCard } from '@/components/cards';
import { ProgrammeEntry } from '@/components/communities';
import { PRESENTERS, findPresenter, programmesOf } from '@/lib/communities';
import { latestEpisodesOf } from '@/lib/community-episodes';

export const revalidate = 60;

type Params = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return PRESENTERS.map((presenter) => ({ slug: presenter.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const presenter = findPresenter((await params).slug);
  if (!presenter) return { title: 'الصفحة غير موجودة' };
  return {
    title: presenter.name,
    description: presenter.bio,
    alternates: { canonical: `/presenters/${presenter.slug}` },
  };
}

export default async function PresenterPage({ params }: Params) {
  const presenter = findPresenter((await params).slug);
  if (!presenter) notFound();
  const programmes = programmesOf(presenter.slug);
  const showSlugs = programmes.flatMap(({ programme }) =>
    programme.showSlug ? [programme.showSlug] : [],
  );
  const latest = await latestEpisodesOf(showSlugs, 3);

  return (
    <div className="content-page public-page">
      <div className="content-container">
        <Link className="public-back" href="/presenters">
          مقدّمو مختلف
        </Link>
        <header className="public-page-head">
          <h1>{presenter.name}</h1>
          <p>{presenter.bio}</p>
        </header>
        <section className="content-section" aria-labelledby="presenter-programmes">
          <div className="content-section__header">
            <h2 className="content-section__title" id="presenter-programmes">
              {(programmes.length > 1 ? 'برامج' : 'برنامج') + (presenter.feminine ? 'ها' : 'ه')}
            </h2>
          </div>
          <div className="programme-list">
            {programmes.map(({ programme }) => (
              <ProgrammeEntry key={programme.slug} programme={programme} />
            ))}
          </div>
        </section>
        {latest && latest.episodes.length ? (
          <section className="content-section" aria-labelledby="presenter-episodes">
            <div className="content-section__header">
              <h2 className="content-section__title" id="presenter-episodes">
                أحدث الحلقات
              </h2>
            </div>
            <div className="public-episode-grid" role="list">
              {latest.episodes.map((episode) => (
                <EpisodeCard
                  key={episode.id}
                  episode={episode}
                  showName={latest.shows.get(episode.showId)?.titleAr}
                />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
