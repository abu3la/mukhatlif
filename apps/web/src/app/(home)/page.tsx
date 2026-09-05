import Link from 'next/link';
import type { HomeSummary } from '@mukhtalif/types';
import { ArticleCard, EpisodeRow, ShowCard } from '@/components/cards';
import { formatNumber } from '@/components/formatting';
import { EmptyState, ErrorState } from '@/components/states';
import { WeeklyEpisodeCard } from '@/components/weekly-episodes';
import { NewsletterSignup } from '@/components/newsletter-signup';
import { apiOrigin } from '@/lib/config';
import { ApiUnavailableError, getHomeSummary } from '@/lib/api';

export const revalidate = 60;

const LISTENING_PLATFORMS = [
  {
    label: 'سبوتيفاي',
    href: 'https://open.spotify.com/show/6m9xb0r6xCBtTvq4UnnYbh',
  },
  {
    label: 'آبل بودكاست',
    href: 'https://podcasts.apple.com/sa/podcast/id1532674246',
  },
  {
    label: 'يوتيوب',
    href: 'https://www.youtube.com/channel/UC8vdjzu_0QMQlG9qNT5D_AQ',
  },
] as const;

export default async function HomePage() {
  let summary: HomeSummary;
  try {
    summary = await getHomeSummary();
  } catch (error) {
    if (!(error instanceof ApiUnavailableError)) throw error;
    return (
      <div className="content-page">
        <div className="content-container">
          <ErrorState />
          <div className="home-newsletter">
            <NewsletterSignup apiOrigin={apiOrigin()} />
          </div>
        </div>
      </div>
    );
  }

  const showsById = new Map(summary.shows.map((show) => [show.id, show]));
  const hasAnything =
    Boolean(summary.weeklyEpisodes) ||
    summary.shows.length > 0 ||
    summary.latestEpisodes.length > 0 ||
    summary.latestArticles.length > 0;

  return (
    <div className="home-page content-page">
      <div className="content-container">
        <section className="home-hero" aria-labelledby="home-title">
          <span className="home-hero__mark" aria-hidden="true" />
          <h1 className="home-hero__title" id="home-title">
            لمسار مهني يشبهك.
          </h1>
          <p className="home-hero__lede">
            نقضي ثلث أعمارنا في أعمالنا، لذلك نؤمن بأن الشخص السعيد في عمله سعيد في
            حياته. اخترنا المهنة وهمومها قضيتنا، في الإذاعة المهنية الأولى في الوطن
            العربي.
          </p>
          <div className="platform-links" aria-label="منصات الاستماع">
            <span className="platform-links__label">استمع لنا عبر:</span>
            {LISTENING_PLATFORMS.map((platform) => (
              <a key={platform.href} className="platform-links__link" href={platform.href}>
                {platform.label}
              </a>
            ))}
          </div>
        </section>

        {summary.weeklyEpisodes ? (
          <section className="content-section weekly-episodes" aria-labelledby="home-weekly-episodes">
            <div className="content-section__header">
              <div>
                <h2 className="content-section__title" id="home-weekly-episodes">
                  {summary.weeklyEpisodes.title}
                </h2>
                <p className="content-section__meta">
                  الحلقات المنشورة خلال آخر ٧ أيام من برامج إذاعة مختلف
                </p>
              </div>
              <Link className="content-section__more" href="/episodes">
                كل الحلقات
              </Link>
            </div>
            <div
              className="weekly-episodes__track"
              role="list"
              tabIndex={0}
              aria-label="حلقات منشورة خلال آخر ٧ أيام"
            >
              {summary.weeklyEpisodes.episodes.map((episode) => (
                <WeeklyEpisodeCard key={episode.id} episode={episode} />
              ))}
            </div>
          </section>
        ) : null}

        {!hasAnything ? (
          <EmptyState
            title="لا يوجد محتوى منشور بعد"
            text="سيظهر هنا أول برنامج وأول حلقة فور نشرهما."
          />
        ) : null}

        {summary.shows.length > 0 ? (
          <section className="content-section" aria-labelledby="home-shows">
            <div className="content-section__header">
              <h2 className="content-section__title" id="home-shows">
                البرامج
              </h2>
              <p className="content-section__meta">
                {`${formatNumber(summary.shows.length)} من برامج شبكة مختلف`}
              </p>
            </div>
            <div className="shows-grid">
              {summary.shows.map((show) => (
                <ShowCard key={show.id} show={show} />
              ))}
            </div>
          </section>
        ) : null}

        {!summary.weeklyEpisodes && summary.latestEpisodes.length > 0 ? (
          <section className="content-section" aria-labelledby="home-episodes">
            <div className="content-section__header">
              <h2 className="content-section__title" id="home-episodes">
                أحدث الحلقات
              </h2>
              <Link className="content-section__more" href="/episodes">
                كل الحلقات
              </Link>
            </div>
            <div className="episode-list" role="list">
              {summary.latestEpisodes.map((episode) => (
                <EpisodeRow
                  key={episode.id}
                  episode={episode}
                  showName={showsById.get(episode.showId)?.titleAr}
                />
              ))}
            </div>
          </section>
        ) : null}

        <div className="home-newsletter">
          <NewsletterSignup apiOrigin={apiOrigin()} />
        </div>

        {summary.latestArticles.length > 0 ? (
          <section className="content-section home-articles" aria-labelledby="home-articles">
            <div className="content-section__header">
              <h2 className="content-section__title" id="home-articles">
                قراءات من مختلف
              </h2>
              <Link className="content-section__more" href="/articles">
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
      </div>
    </div>
  );
}
