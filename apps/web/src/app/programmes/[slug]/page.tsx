import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import type { Episode, Show } from '@mukhtalif/types';
import { EpisodeCard } from '@/components/cards';
import { episodesNoun } from '@/components/formatting';
import { FollowShowButton } from '@/components/customer-content';
import { ProgrammeRail, presenterLine } from '@/components/home-stage';
import { NewsletterCards } from '@/components/newsletter-cards';
import { parsePage } from '@/components/pager';
import { RailControls } from '@/components/public-content-controls';
import { ErrorState } from '@/components/states';
import { ApiUnavailableError, NotFoundError, getShow, listEpisodes } from '@/lib/api';
import {
  COMMUNITIES,
  NEWSLETTERS,
  coverTone,
  findPresenter,
  findProgramme,
  playlistUrl,
  presenterPhoto,
  programmeCover,
  programmeMark,
  programmeHref,
  type Presenter,
} from '@/lib/communities';

export const revalidate = 60;

type Params = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return COMMUNITIES.flatMap((community) =>
    community.programmes.map((programme) => ({ slug: programme.slug })),
  );
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const found = findProgramme((await params).slug);
  if (!found) return { title: 'الصفحة غير موجودة' };
  const { programme } = found;
  return {
    title: programme.name,
    description: programme.description,
    alternates: { canonical: programmeHref(programme) },
    openGraph: { images: [programmeCover(programme)] },
  };
}

/** A count is the page's one large number only when it says something. */
const COUNT_FROM = 10;

/**
 * A programme page of the presentation site (D-24). It opens on the
 * programme's own cover ground, with the cover as its title and its episode
 * count as the one large number; then the sheet carries the latest episodes,
 * the presenters, the newsletter and the community's other programmes. The
 * full archive is the episodes index filtered to this programme.
 */
export default async function ProgrammePage({
  params,
  searchParams,
}: Params & { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const found = findProgramme((await params).slug);
  if (!found) notFound();
  const { community, programme } = found;
  const page = parsePage((await searchParams).page);

  let show: Show | null = null;
  let episodes: Episode[] = [];
  let total = 0;
  let since: string | undefined;
  let episodesFailed = false;
  if (programme.showSlug) {
    try {
      show = await getShow(programme.showSlug);
      if (page === 1) {
        const result = await listEpisodes({ showId: show.id, page: 1, perPage: 12 });
        episodes = result.items;
        total = result.pageInfo.total;
        if (total >= COUNT_FROM) {
          const oldest = await listEpisodes({ showId: show.id, page: total, perPage: 1 });
          since = oldest.items[0]?.publishAt?.slice(0, 4);
        }
      }
    } catch (error) {
      if (!(error instanceof ApiUnavailableError) && !(error instanceof NotFoundError)) throw error;
      episodesFailed = true;
    }
  }
  // Older pages of the programme's own list now live in the episodes index.
  if (page > 1 && show) {
    permanentRedirect(`/episodes?showId=${encodeURIComponent(show.id)}&page=${page}`);
  }

  const latest = episodes[0];
  const presenters = programme.presenters
    .map(findPresenter)
    .filter((presenter): presenter is Presenter => Boolean(presenter));
  const hosts = presenterLine(programme);
  const mark = programmeMark(programme);
  const newsletters = NEWSLETTERS.filter((newsletter) => newsletter.programme === programme.slug);
  const related = community.programmes.filter((other) => other.slug !== programme.slug);
  const presentersTitle =
    presenters.length > 1
      ? 'مقدّمو البرنامج'
      : presenters[0]?.feminine
        ? 'مقدّمة البرنامج'
        : 'مقدّم البرنامج';
  const cover = {
    '--cover-ground': `var(--mk-cover-${programme.slug}-ground)`,
    '--cover-accent': `var(--mk-cover-${programme.slug}-accent)`,
  } as CSSProperties;

  return (
    <div className="cover-page" style={cover}>
      <section
        className="cover-stage"
        data-tone={coverTone(programme)}
        aria-labelledby="programme-title"
      >
        <div className="content-container cover-stage__inner">
          {/* The cover is the programme's name as it is drawn. */}
          <h1 id="programme-title" className="cover-stage__title">
            {mark ? (
              <img
                className="cover-stage__mark"
                src={mark.src}
                alt={programme.name}
                width={mark.width}
                height={mark.height}
                fetchPriority="high"
              />
            ) : (
              <img
                className="cover-stage__art"
                src={programmeCover(programme)}
                alt={programme.name}
                width="720"
                height="720"
                fetchPriority="high"
              />
            )}
          </h1>
          <p className="cover-stage__line">{programme.description}</p>
          <p className="cover-stage__credit">
            {hosts ? `${hosts}، من ` : 'من '}
            <Link href={`/communities/${community.slug}`}>{community.name}</Link>
          </p>
          <div className="cover-stage__actions">
            {latest ? (
              <Link className="public-primary" href={'/episodes/' + encodeURIComponent(latest.id)}>
                شاهد أحدث حلقة
              </Link>
            ) : null}
            {show ? <FollowShowButton showId={show.id} variant="text" /> : null}
            <a
              className={latest ? 'stage-link' : 'public-primary'}
              href={playlistUrl(programme)}
              target="_blank"
              rel="noopener"
            >
              {latest ? 'قائمة الحلقات على يوتيوب' : 'شاهد الحلقات على يوتيوب'}
              <span className="visually-hidden"> (يفتح في نافذة جديدة)</span>
            </a>
          </div>
          {total >= COUNT_FROM ? (
            <p className="cover-stage__count">
              <span className="cover-stage__number">
                <bdi>{total}</bdi>
              </span>
              <span className="cover-stage__unit">
                {episodesNoun(total)}
                {since ? ` منذ ${since}` : null}
              </span>
            </p>
          ) : null}
        </div>
      </section>

      <div className="cover-sheet">
        <div className="home-sheet__surface">
          {episodesFailed ? (
            <section className="content-container" aria-labelledby="programme-episodes">
              <h2 className="cover-section__title" id="programme-episodes">
                حلقات {programme.name}
              </h2>
              <ErrorState
                title="تعذّر تحميل الحلقات"
                text="البرنامج معروض، لكن قائمة حلقاته غير متاحة الآن. تقدر تشاهدها على يوتيوب."
              />
            </section>
          ) : episodes.length && show ? (
            <section aria-labelledby="programme-episodes">
              <div className="content-container home-head">
                <h2 className="cover-section__title" id="programme-episodes">
                  أحدث الحلقات
                </h2>
                <div className="home-head__tools">
                  <Link
                    className="stage-link"
                    href={`/episodes?showId=${encodeURIComponent(show.id)}`}
                  >
                    كل الحلقات
                  </Link>
                  <RailControls target="programme-episodes-rail" label="الحلقات" />
                </div>
              </div>
              <div
                id="programme-episodes-rail"
                className="stage-rail stage-rail--episodes"
                role="list"
                tabIndex={0}
                aria-label={`أحدث حلقات ${programme.name}`}
              >
                {episodes.map((episode) => (
                  <EpisodeCard
                    key={episode.id}
                    episode={episode}
                    showName={programme.name}
                    showArtwork={show.artworkUrl}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {presenters.length ? (
            <section className="content-container" aria-labelledby="programme-presenters">
              <h2 className="cover-section__title" id="programme-presenters">
                {presentersTitle}
              </h2>
              <div className="programme-hosts">
                {presenters.map((presenter) => {
                  const photo = presenterPhoto(presenter);
                  return (
                    <article
                      className={'programme-host' + (photo ? ' programme-host--photo' : '')}
                      key={presenter.slug}
                    >
                      {photo ? (
                        <img
                          className="programme-host__photo"
                          src={photo}
                          alt={presenter.name}
                          width="300"
                          height="300"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : null}
                      <div className="programme-host__body">
                        <h3 className="programme-host__name">{presenter.name}</h3>
                        <p className="programme-host__bio">{presenter.bio}</p>
                        <Link className="stage-link" href={`/presenters/${presenter.slug}`}>
                          تعرّف على {presenter.name}
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}

          {newsletters.length ? (
            <section className="content-container" aria-labelledby="programme-newsletter">
              <h2 className="cover-section__title" id="programme-newsletter">
                اقرأ {programme.name} في بريدك
              </h2>
              <div className="cover-section__body">
                <NewsletterCards newsletters={newsletters} />
              </div>
            </section>
          ) : null}

          {related.length ? (
            <section aria-labelledby="programme-related">
              <div className="content-container home-head">
                <h2 className="cover-section__title" id="programme-related">
                  من {community.name} أيضًا
                </h2>
                <div className="home-head__tools">
                  <Link className="stage-link" href={`/communities/${community.slug}`}>
                    استكشف المجتمع
                  </Link>
                  <RailControls target="programme-related-rail" label="البرامج" />
                </div>
              </div>
              <ProgrammeRail
                id="programme-related-rail"
                label={`برامج ${community.name}`}
                programmes={related}
              />
            </section>
          ) : null}

          <section
            className="content-container community-invite cover-invite"
            aria-labelledby="invite-title"
          >
            <div>
              <h2 className="community-invite__title" id="invite-title">
                مين ودّك نسمع قصته؟
              </h2>
              <p>رشّح لنا شخصًا عنده تجربة أو معرفة تستحق نفتح حولها حوار.</p>
            </div>
            <Link
              className="public-primary"
              href={`/suggest?programme=${encodeURIComponent(programme.slug)}`}
            >
              اقترح ضيفًا
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}
