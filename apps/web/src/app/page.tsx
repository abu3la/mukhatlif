import Link from 'next/link';
import type { HomeSummary } from '@mukhtalif/types';
import { ArticleCard, EpisodeRow, ShowCard } from '@/components/cards';
import { EmptyState, ErrorState } from '@/components/states';
import { Signal } from '@/components/signal';
import { ApiUnavailableError, getHomeSummary } from '@/lib/api';

export const revalidate = 60;

export default async function HomePage() {
  let summary: HomeSummary;
  try {
    summary = await getHomeSummary();
  } catch (error) {
    if (!(error instanceof ApiUnavailableError)) throw error;
    return (
      <div className="shell">
        <ErrorState />
      </div>
    );
  }

  const showsById = new Map(summary.shows.map((show) => [show.id, show]));
  const hasAnything =
    summary.shows.length > 0 ||
    summary.latestEpisodes.length > 0 ||
    summary.latestArticles.length > 0;

  return (
    <>
      <section className="shell hero">
        <p className="hero__station">
          <Signal />
          الإذاعة المهنية الأولى في الوطن العربي
        </p>
        <h1 className="hero__title">لمسار مهني يشبهك</h1>
        <p className="hero__lede">
          برامج ومقالات من شبكة مختلف عن العمل والمهنة والطريق الذي يسلكه من سبقوك.
        </p>
      </section>

      {!hasAnything ? (
        <div className="shell">
          <EmptyState
            title="لا يوجد محتوى منشور بعد"
            text="سيظهر هنا أول برنامج وأول حلقة فور نشرهما."
          />
        </div>
      ) : null}

      {summary.latestEpisodes.length > 0 ? (
        <section className="shell section" aria-labelledby="home-episodes">
          <div className="section__head">
            <h2 className="section__title" id="home-episodes">
              أحدث الحلقات
            </h2>
            <Link className="section__more" href="/episodes">
              كل الحلقات
            </Link>
          </div>
          <div className="episodes">
            {summary.latestEpisodes.map((episode) => (
              <EpisodeRow
                key={episode.id}
                episode={{ ...episode, durationSec: episode.durationSec }}
                showName={showsById.get(episode.showId)?.titleAr}
              />
            ))}
          </div>
        </section>
      ) : null}

      {summary.shows.length > 0 ? (
        <section className="shell section" aria-labelledby="home-shows">
          <div className="section__head">
            <h2 className="section__title" id="home-shows">
              البرامج
            </h2>
            <Link className="section__more" href="/shows">
              كل البرامج
            </Link>
          </div>
          <div className="grid grid--shows">
            {summary.shows.map((show) => (
              <ShowCard key={show.id} show={show} />
            ))}
          </div>
        </section>
      ) : null}

      {summary.latestArticles.length > 0 ? (
        <section className="shell section" aria-labelledby="home-articles">
          <div className="section__head">
            <h2 className="section__title" id="home-articles">
              مقالات
            </h2>
            <Link className="section__more" href="/articles">
              كل المقالات
            </Link>
          </div>
          <div className="grid grid--articles">
            {summary.latestArticles.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
