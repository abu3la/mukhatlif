import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Episode, PageInfo, Show } from '@mukhtalif/types';
import { EpisodeCard } from '@/components/cards';
import { PresenterCard, ProgrammeEntry } from '@/components/communities';
import { FollowShowButton } from '@/components/customer-content';
import { NewsletterCards } from '@/components/newsletter-cards';
import { Pager, parsePage } from '@/components/pager';
import { ErrorState } from '@/components/states';
import { ApiUnavailableError, NotFoundError, getShow, listEpisodes } from '@/lib/api';
import {
  COMMUNITIES,
  NEWSLETTERS,
  findPresenter,
  findProgramme,
  playlistUrl,
  programmeCover,
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

/**
 * Section 7 of the site brief: cover, approved description and the latest
 * episode first, then the episodes, presenters, related programmes and a guest
 * suggestion with the programme filled in. Episodes come from the catalogue
 * when the programme is in it; otherwise its YouTube playlist is the way in.
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
  let pageInfo: PageInfo | null = null;
  let episodesFailed = false;
  if (programme.showSlug) {
    try {
      show = await getShow(programme.showSlug);
      const result = await listEpisodes({ showId: show.id, page, perPage: 12 });
      episodes = result.items;
      pageInfo = result.pageInfo;
    } catch (error) {
      if (!(error instanceof ApiUnavailableError) && !(error instanceof NotFoundError)) throw error;
      episodesFailed = true;
    }
  }
  const latest = page === 1 ? episodes[0] : undefined;
  const presenters = programme.presenters
    .map(findPresenter)
    .filter((presenter): presenter is Presenter => Boolean(presenter));
  const newsletters = NEWSLETTERS.filter((newsletter) => newsletter.programme === programme.slug);
  const related = community.programmes.filter((other) => other.slug !== programme.slug);
  const presentersTitle =
    presenters.length > 1
      ? 'مقدّمو البرنامج'
      : presenters[0]?.feminine
        ? 'مقدّمة البرنامج'
        : 'مقدّم البرنامج';

  return (
    <div className="content-page public-page">
      <div className="content-container">
        <Link className="public-back" href={`/communities/${community.slug}`}>
          {community.name}
        </Link>
        <section className="public-show-intro" aria-labelledby="programme-title">
          <img
            src={programmeCover(programme)}
            alt={'غلاف برنامج ' + programme.name}
            width="480"
            height="480"
            decoding="async"
          />
          <div>
            <h1 id="programme-title">{programme.name}</h1>
            <p>{programme.description}</p>
            <div className="community-head__actions">
              {latest ? (
                <Link
                  className="public-primary"
                  href={'/episodes/' + encodeURIComponent(latest.id)}
                >
                  شاهد أحدث حلقة
                </Link>
              ) : null}
              {show ? <FollowShowButton showId={show.id} /> : null}
              <a
                className={latest ? 'public-text-action' : 'public-primary'}
                href={playlistUrl(programme)}
                target="_blank"
                rel="noopener"
              >
                {latest ? 'قائمة الحلقات على يوتيوب' : 'شاهد الحلقات على يوتيوب'}
                <span className="visually-hidden"> (يفتح في نافذة جديدة)</span>
              </a>
            </div>
          </div>
        </section>

        {episodesFailed ? (
          <section className="content-section" aria-labelledby="programme-episodes">
            <h2 className="content-section__title" id="programme-episodes">
              حلقات {programme.name}
            </h2>
            <ErrorState
              title="تعذّر تحميل الحلقات"
              text="البرنامج معروض، لكن قائمة حلقاته غير متاحة الآن. تقدر تشاهدها على يوتيوب."
            />
          </section>
        ) : episodes.length && show ? (
          <section className="content-section" aria-labelledby="programme-episodes">
            <div className="content-section__header">
              <h2 className="content-section__title" id="programme-episodes">
                حلقات {programme.name}
              </h2>
              {pageInfo ? <p className="content-section__meta">{pageInfo.total} حلقة</p> : null}
            </div>
            <div className="public-episode-grid" role="list">
              {episodes.map((episode) => (
                <EpisodeCard
                  key={episode.id}
                  episode={episode}
                  showName={programme.name}
                  showArtwork={show.artworkUrl}
                />
              ))}
            </div>
            {pageInfo ? <Pager pageInfo={pageInfo} basePath={programmeHref(programme)} /> : null}
          </section>
        ) : null}

        {presenters.length ? (
          <section className="content-section" aria-labelledby="programme-presenters">
            <div className="content-section__header">
              <h2 className="content-section__title" id="programme-presenters">
                {presentersTitle}
              </h2>
            </div>
            <div className="presenter-grid" role="list">
              {presenters.map((presenter) => (
                <div className="card-cell" role="listitem" key={presenter.slug}>
                  <PresenterCard presenter={presenter} />
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {newsletters.length ? (
          <section className="content-section" aria-labelledby="programme-newsletter">
            <div className="content-section__header">
              <h2 className="content-section__title" id="programme-newsletter">
                اقرأ {programme.name} في بريدك
              </h2>
            </div>
            <NewsletterCards newsletters={newsletters} />
          </section>
        ) : null}

        {related.length ? (
          <section className="content-section" aria-labelledby="programme-related">
            <div className="content-section__header">
              <h2 className="content-section__title" id="programme-related">
                برامج أخرى في {community.name}
              </h2>
              <Link href={`/communities/${community.slug}`}>استكشف المجتمع</Link>
            </div>
            <div className="programme-list">
              {related.map((other) => (
                <ProgrammeEntry key={other.slug} programme={other} />
              ))}
            </div>
          </section>
        ) : null}

        <section className="content-section community-invite" aria-labelledby="invite-title">
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
  );
}
