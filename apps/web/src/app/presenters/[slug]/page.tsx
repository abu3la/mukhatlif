import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EpisodeCard } from '@/components/cards';
import { ProgrammeTile, presenterLine } from '@/components/home-stage';
import { RailControls } from '@/components/public-content-controls';
import {
  PRESENTERS,
  coverTone,
  findPresenter,
  presenterPhoto,
  programmeCover,
  programmeHref,
  programmesOf,
  showFace,
} from '@/lib/communities';
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

/**
 * A presenter on the presentation site (D-24). Their name and bio stand on
 * the night stage; the programme they present crosses onto the sheet as its
 * cover (beside their portrait where one is confirmed) and is introduced
 * there, then its latest episodes follow. Someone presenting several
 * programmes gets them as tiles instead.
 */
export default async function PresenterPage({ params }: Params) {
  const presenter = findPresenter((await params).slug);
  if (!presenter) notFound();
  const programmes = programmesOf(presenter.slug);
  const showSlugs = programmes.flatMap(({ programme }) =>
    programme.showSlug ? [programme.showSlug] : [],
  );
  const latest = await latestEpisodesOf(showSlugs);
  const shows = latest ? [...latest.shows.values()] : [];

  const lead = programmes.length === 1 ? programmes[0] : undefined;
  const photo = presenterPhoto(presenter);
  const programmesTitle =
    (programmes.length > 1 ? 'برامج' : 'برنامج') + (presenter.feminine ? 'ها' : 'ه');
  const hosts = lead ? presenterLine(lead.programme) : '';

  return (
    <div
      className={
        'stage-page presenter-page' +
        (lead ? ' has-cross' : '') +
        (lead && photo ? ' presenter-page--pair' : '')
      }
    >
      <div className="stage-scope">
        <section className="stage-intro" aria-labelledby="presenter-title">
          <div className="content-container stage-head">
            <p className="stage-head__crumbs">
              <Link href="/presenters">مقدّمو مختلف</Link>
            </p>
            <h1 id="presenter-title" className="stage-head__title">
              {presenter.name}
            </h1>
            <p className="stage-head__lede">{presenter.bio}</p>
          </div>
          {lead ? (
            <div className="stage-cross presenter-cross" data-tone={coverTone(lead.programme)}>
              {photo ? (
                <img
                  className="presenter-cross__photo"
                  src={photo}
                  alt={presenter.name}
                  width="300"
                  height="300"
                  fetchPriority="high"
                  decoding="async"
                />
              ) : null}
              <Link href={programmeHref(lead.programme)} tabIndex={-1} aria-hidden="true">
                <img
                  className="presenter-cross__cover"
                  src={programmeCover(lead.programme)}
                  alt=""
                  width="480"
                  height="480"
                  fetchPriority="high"
                  decoding="async"
                />
              </Link>
            </div>
          ) : null}
        </section>
      </div>

      <div className="home-sheet">
        <div className="home-sheet__surface">
          {lead ? (
            <section
              className="content-container stage-feature"
              aria-labelledby="presenter-programmes"
            >
              <h2 className="visually-hidden" id="presenter-programmes">
                {programmesTitle}
              </h2>
              <h3 className="stage-feature__title">
                <Link href={programmeHref(lead.programme)}>{lead.programme.name}</Link>
              </h3>
              <p className="stage-feature__text">{lead.programme.description}</p>
              <p className="presenter-feature__credit">
                {hosts ? `${hosts}، من ` : 'من '}
                <Link href={`/communities/${lead.community.slug}`}>{lead.community.name}</Link>
              </p>
              <Link className="stage-link" href={programmeHref(lead.programme)}>
                اكتشف البرنامج
                <span className="visually-hidden"> {lead.programme.name}</span>
              </Link>
            </section>
          ) : programmes.length ? (
            <section className="content-container" aria-labelledby="presenter-programmes">
              <h2 className="cover-section__title" id="presenter-programmes">
                {programmesTitle}
              </h2>
              <ul className="community-programmes">
                {programmes.map(({ programme }) => (
                  <ProgrammeTile key={programme.slug} programme={programme} />
                ))}
              </ul>
            </section>
          ) : null}

          {latest && latest.episodes.length ? (
            <section aria-labelledby="presenter-episodes">
              <div className="content-container home-head">
                <h2 className="cover-section__title" id="presenter-episodes">
                  أحدث الحلقات
                </h2>
                <div className="home-head__tools">
                  {shows.length === 1 ? (
                    <Link
                      className="stage-link"
                      href={`/episodes?showId=${encodeURIComponent(shows[0].id)}`}
                    >
                      كل الحلقات
                    </Link>
                  ) : null}
                  <RailControls target="presenter-episodes-rail" label="الحلقات" />
                </div>
              </div>
              <div
                id="presenter-episodes-rail"
                className="stage-rail stage-rail--episodes"
                role="list"
                tabIndex={0}
                aria-label={`أحدث حلقات ${programmes.map(({ programme }) => programme.name).join(' و')}`}
              >
                {latest.episodes.map((episode) => {
                  const show = latest.shows.get(episode.showId);
                  return (
                    <EpisodeCard
                      key={episode.id}
                      episode={episode}
                      showName={show ? showFace(show).name : undefined}
                      showArtwork={show?.artworkUrl}
                    />
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
