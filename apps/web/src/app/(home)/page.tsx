import type { Metadata } from 'next';
import Link from 'next/link';
import type { HomeSummary } from '@mukhtalif/types';
import type { CourseSummary } from '@mukhtalif/types';
import { ArticleCard, EpisodeCard } from '@/components/cards';
import { CommunityGrid, ParticipationPaths } from '@/components/communities';
import { NewsletterCards } from '@/components/newsletter-cards';
import { BrandIcon } from '@/components/brand-icon';
import { EmptyState, ErrorState } from '@/components/states';
import { WeeklyEpisodeCard } from '@/components/weekly-episodes';
import { NewsletterSignup } from '@/components/newsletter-signup';
import { ContinueListening } from '@/components/customer-content';
import { LatestEpisodeAction, RailControls } from '@/components/public-content-controls';
import { ListeningPlatforms } from '@/components/listening-platforms';
import { apiOrigin } from '@/lib/config';
import { ApiUnavailableError, getHomeSummary, listCourses } from '@/lib/api';
import { COMMUNITIES } from '@/lib/communities';
import { publicEpisodeAudioSrc } from '@/lib/player-source';

export const revalidate = 60;

export const metadata: Metadata = { alternates: { canonical: '/' } };

/** Section 5.7: three ways in. Each opens a page or a form that works today. */
const HOME_PATHS = [
  {
    href: '/about',
    title: 'تعرّف علينا',
    text: 'مختلف شبكة محتوى تضم مجتمعات متخصصة وبرامج بودكاست ومقالات ونشرات وورشًا تعليمية.',
    action: 'من نحن',
  },
  {
    href: '/suggest',
    title: 'مين ودّك نسمع قصته؟',
    text: 'رشّح لنا شخصًا عنده تجربة أو معرفة تستحق نفتح حولها حوار.',
    action: 'اقترح ضيفًا',
  },
  {
    href: '/join-us',
    title: 'اشتغل مع مختلف',
    text: 'عرّفنا عليك وعلى خبراتك، وأرفق نماذج من أعمالك.',
    action: 'انضم لفريقنا',
  },
];

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
  let courses: CourseSummary[] = [];
  try {
    courses = await listCourses();
  } catch (error) {
    if (!(error instanceof ApiUnavailableError)) throw error;
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
              <span>مسار مهني</span>
              <strong>يشبهك</strong>
            </h1>
          </div>
          <p className="handoff-hero__mission">
            برامج البودكاست والمقالات والنشرات تجمع تجارب أهل المهن وأسئلتهم، وتفتح لك زوايا جديدة
            لفهم العمل وبناء مسارك.
          </p>
          <div className="handoff-hero__action">
            <a className="public-primary" href="#communities">
              اكتشف مجتمعاتنا
            </a>
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
                  {latestShowTitle ? <span>{latestShowTitle}</span> : null}
                </p>
              </>
            ) : null}
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
        <section
          className="content-section home-communities"
          id="communities"
          aria-labelledby="home-communities"
        >
          <div className="content-section__header">
            <div>
              <h2 className="content-section__title" id="home-communities">
                اكتشف مجتمعات مختلف
              </h2>
              <p className="content-section__meta">
                لكل مجال عالمه الخاص وتجاربه. اكتشف البرامج والقصص الأقرب إلى اهتماماتك.
              </p>
            </div>
            <Link href="/communities">كل المجتمعات</Link>
          </div>
          <CommunityGrid communities={COMMUNITIES} />
        </section>
        {summary.weeklyEpisodes ? (
          <section
            className="content-section weekly-episodes"
            aria-labelledby="home-weekly-episodes"
          >
            <div className="content-section__header">
              <div>
                <h2 className="content-section__title" id="home-weekly-episodes">
                  حلقات تستحق وقتك
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
                حلقات تستحق وقتك
              </h2>
              <Link href="/episodes">كل الحلقات</Link>
            </div>
            <div className="public-episode-grid" role="list">
              {summary.latestEpisodes.slice(0, 6).map((episode) => (
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
                اقرأ من مختلف
              </h2>
              <Link href="/articles">كل المقالات</Link>
            </div>
            <div className="public-article-collection">
              {summary.latestArticles.slice(0, 4).map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </div>
          </section>
        ) : null}
        <section className="content-section" aria-labelledby="home-newsletters">
          <div className="content-section__header">
            <h2 className="content-section__title" id="home-newsletters">
              نشرات مختلف
            </h2>
          </div>
          <NewsletterCards />
        </section>
        {courses.length ? (
          <section className="content-section home-academy" aria-labelledby="home-academy">
            <div className="content-section__header">
              <div>
                <h2 className="content-section__title" id="home-academy">
                  تعلّم مع مختلف
                </h2>
                <p className="content-section__meta">
                  ورش تساعدك تحوّل المعرفة إلى خطوات تطبّقها في حياتك وعملك.
                </p>
              </div>
              <Link href="/courses">أكاديمية مختلف</Link>
            </div>
            <div className="home-academy__list" role="list">
              {courses.slice(0, 3).map((course) => (
                <div className="card-cell" role="listitem" key={course.id}>
                  <Link className="participation-path" href={`/courses/${course.id}`}>
                    <h3 className="participation-path__title">{course.title}</h3>
                    <span className="participation-path__text">{course.description}</span>
                    <span className="community-card__action">
                      اكتشف الورشة
                      <BrandIcon name="next" className="community-card__arrow" />
                    </span>
                  </Link>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        <section className="content-section" aria-labelledby="home-join">
          <div className="content-section__header">
            <h2 className="content-section__title" id="home-join">
              تعرّف وشارك
            </h2>
          </div>
          <ParticipationPaths paths={HOME_PATHS} />
        </section>
        <div className="home-newsletter">
          <NewsletterSignup apiOrigin={apiOrigin()} />
        </div>
      </div>
    </div>
  );
}
