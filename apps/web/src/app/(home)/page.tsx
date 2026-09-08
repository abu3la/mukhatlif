import Link from 'next/link';
import type { HomeSummary } from '@mukhtalif/types';
import { ArticleCard, EpisodeCard, ShowCard } from '@/components/cards';
import { EmptyState, ErrorState } from '@/components/states';
import { WeeklyEpisodeCard } from '@/components/weekly-episodes';
import { NewsletterSignup } from '@/components/newsletter-signup';
import { ContinueListening } from '@/components/customer-content';
import { LatestEpisodeAction, RailControls } from '@/components/public-content-controls';
import { ListeningPlatforms } from '@/components/listening-platforms';
import { apiOrigin } from '@/lib/config';
import { ApiUnavailableError, getHomeSummary } from '@/lib/api';
import { publicEpisodeAudioSrc } from '@/lib/player-source';

export const revalidate = 60;

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
  const shows = new Map(summary.shows.map((show) => [show.id, show]));
  const latest = [...(summary.weeklyEpisodes?.episodes ?? []), ...summary.latestEpisodes]
    .filter((episode) => !episode.premium)
    .sort((a, b) => (b.publishAt ?? '').localeCompare(a.publishAt ?? ''))[0];
  const latestShowTitle = latest
    ? (summary.weeklyEpisodes?.episodes.find((episode) => episode.id === latest.id)?.showTitleAr ??
      shows.get(latest.showId)?.titleAr)
    : undefined;
  const audioSrc = latest ? publicEpisodeAudioSrc(latest.id) : null;
  const hasAnything =
    Boolean(summary.weeklyEpisodes) ||
    summary.shows.length > 0 ||
    summary.latestEpisodes.length > 0 ||
    summary.latestArticles.length > 0;
  return (
    <div className="home-page content-page public-home">
      <div className="content-container">
        <section className="handoff-hero" aria-labelledby="home-title">
          <div className="handoff-hero__title">
            <h1 id="home-title">
              <span>لمسار مهني</span>
              <strong>يشبهك.</strong>
            </h1>
          </div>
          <p className="handoff-hero__mission">
            نهدف إلى أن يعيش كل شخص يومًا مهنيًا يناسب قيمه وظروفه وإمكاناته، لذلك اخترنا المهنة
            وهمومها قضيتنا.
          </p>
          <div className="handoff-hero__action">
            {latest && audioSrc ? (
              <>
                <LatestEpisodeAction
                  episode={{
                    id: latest.id,
                    title: latest.titleAr,
                    showTitle: latestShowTitle,
                    href: '/episodes/' + encodeURIComponent(latest.id),
                    audioSrc,
                    durationSec: latest.durationSec,
                    youtubeVideoId: latest.youtubeVideoId,
                    artworkUrl: latest.youtubeVideoId
                      ? `https://i.ytimg.com/vi/${latest.youtubeVideoId}/hqdefault.jpg`
                      : shows.get(latest.showId)?.artworkUrl,
                  }}
                />
                <p>
                  {latest.titleAr}
                  {latestShowTitle ? ' · ' + latestShowTitle : ''}
                </p>
              </>
            ) : (
              <Link className="public-primary" href="/episodes">
                استكشف الحلقات
              </Link>
            )}
          </div>
          <ListeningPlatforms />
          <div className="handoff-hero__scene">
            <img
              src="/handoff/mukhtalif-scene.png"
              alt="مختلف: أخيرًا مكان يناقش همومك الوظيفية"
              width="1656"
              height="932"
              fetchPriority="high"
            />
          </div>
        </section>
        {summary.weeklyEpisodes ? (
          <section
            className="content-section weekly-episodes"
            aria-labelledby="home-weekly-episodes"
          >
            <div className="content-section__header">
              <div>
                <h2 className="content-section__title" id="home-weekly-episodes">
                  {summary.weeklyEpisodes.title}
                </h2>
                <p className="content-section__meta">حلقات نُشرت خلال آخر 7 أيام</p>
              </div>
              <RailControls target="home-weekly-rail" />
            </div>
            <div
              id="home-weekly-rail"
              className="weekly-episodes__track"
              role="list"
              tabIndex={0}
              aria-label="حلقات منشورة خلال آخر 7 أيام"
            >
              {summary.weeklyEpisodes.episodes.map((episode) => (
                <WeeklyEpisodeCard key={episode.id} episode={episode} />
              ))}
            </div>
          </section>
        ) : summary.latestEpisodes.length > 0 ? (
          <section className="content-section" aria-labelledby="home-episodes">
            <div className="content-section__header">
              <h2 className="content-section__title" id="home-episodes">
                أحدث الحلقات
              </h2>
              <Link href="/episodes">كل الحلقات</Link>
            </div>
            <div className="public-episode-grid" role="list">
              {summary.latestEpisodes.map((episode) => (
                <EpisodeCard
                  key={episode.id}
                  episode={episode}
                  showName={shows.get(episode.showId)?.titleAr}
                />
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
        {summary.shows.length ? (
          <section className="content-section public-home-shows" aria-labelledby="home-shows">
            <div className="content-section__header">
              <h2 className="content-section__title" id="home-shows">
                برامج مختلف
              </h2>
              <Link href="/shows">استكشف البرامج</Link>
            </div>
            <div className="shows-grid">
              {summary.shows.map((show) => (
                <ShowCard key={show.id} show={show} />
              ))}
            </div>
          </section>
        ) : null}
        <section className="content-section public-continue" aria-labelledby="home-continue">
          <div className="content-section__header">
            <h2 className="content-section__title" id="home-continue">
              أكمل الاستماع
            </h2>
            <Link href="/library?tab=history">سجل الاستماع</Link>
          </div>
          <ContinueListening />
        </section>
        {summary.latestArticles.length ? (
          <section
            className="content-section home-articles public-home-articles"
            aria-labelledby="home-articles"
          >
            <div className="content-section__header">
              <h2 className="content-section__title" id="home-articles">
                قراءات من مختلف
              </h2>
              <Link href="/articles">كل القراءات</Link>
            </div>
            <div className="public-article-collection">
              {summary.latestArticles.slice(0, 4).map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </div>
          </section>
        ) : null}
        <div className="home-newsletter">
          <NewsletterSignup apiOrigin={apiOrigin()} />
        </div>
      </div>
    </div>
  );
}
