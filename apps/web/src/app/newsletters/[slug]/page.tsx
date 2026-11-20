import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EpisodeCard } from '@/components/cards';
import { NewsletterCards } from '@/components/newsletter-cards';
import { RailControls } from '@/components/public-content-controls';
import {
  NEWSLETTERS,
  coverTone,
  findProgramme,
  programmeCover,
  programmeHref,
  programmeMark,
} from '@/lib/communities';
import { latestEpisodesOf } from '@/lib/community-episodes';

export const revalidate = 60;

type Params = { params: Promise<{ slug: string }> };

const find = (slug: string) => NEWSLETTERS.find((newsletter) => newsletter.slug === slug);

export function generateStaticParams() {
  return NEWSLETTERS.map((newsletter) => ({ slug: newsletter.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const newsletter = find((await params).slug);
  if (!newsletter) return { title: 'الصفحة غير موجودة' };
  return {
    title: `نشرة ${newsletter.name}`,
    description: newsletter.description,
    alternates: { canonical: `/newsletters/${newsletter.slug}` },
  };
}

/**
 * A newsletter page of the presentation site (D-24). A programme's newsletter
 * stands on that programme's cover ground with its mark or cover; the general
 * one stands on the night stage. The sheet carries the programme's latest
 * episodes and the other newsletters.
 */
export default async function NewsletterPage({ params }: Params) {
  const newsletter = find((await params).slug);
  if (!newsletter) notFound();
  const programme = newsletter.programme
    ? findProgramme(newsletter.programme)?.programme
    : undefined;
  const latest = programme?.showSlug ? await latestEpisodesOf([programme.showSlug], 6) : null;
  const show = latest?.shows.values().next().value;
  const mark = programme ? programmeMark(programme) : undefined;
  const others = NEWSLETTERS.filter((other) => other.slug !== newsletter.slug);
  const ground = (
    programme
      ? {
          '--cover-ground': `var(--mk-cover-${programme.slug}-ground)`,
          '--cover-accent': `var(--mk-cover-${programme.slug}-accent)`,
        }
      : { '--cover-ground': 'var(--mk-stage)', '--cover-accent': 'var(--mk-stage-ink-muted)' }
  ) as CSSProperties;

  return (
    <div className="cover-page" style={ground}>
      <section
        className="cover-stage"
        data-tone={programme ? coverTone(programme) : 'dark'}
        aria-labelledby="newsletter-title"
      >
        <div className="content-container stage-head">
          {programme ? (
            mark ? (
              <img
                className="newsletter-stage__mark"
                src={mark.src}
                alt=""
                width={mark.width}
                height={mark.height}
                fetchPriority="high"
              />
            ) : (
              <img
                className="newsletter-stage__art"
                src={programmeCover(programme)}
                alt=""
                width="720"
                height="720"
                fetchPriority="high"
              />
            )
          ) : null}
          <h1 id="newsletter-title" className="stage-head__title">
            نشرة {newsletter.name}
          </h1>
          <p className="stage-head__lede">{newsletter.description}</p>
          {newsletter.frequency ? (
            <p className="stage-head__meta stage-head__strong stage-head__accent">
              تصلك {newsletter.frequency}
            </p>
          ) : null}
          <div className="stage-head__actions">
            {/*
              Each newsletter has its own list on the current site. Until those lists
              are connected here, the subscription happens on that page, so nobody is
              added to the wrong list.
            */}
            <a className="public-primary" href={newsletter.subscribeUrl}>
              اشترك في النشرة
            </a>
            {programme ? (
              <Link className="stage-link" href={programmeHref(programme)}>
                استمع إلى {programme.name}
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <div className="cover-sheet">
        <div className="home-sheet__surface">
          {programme && show && latest?.episodes.length ? (
            <section aria-labelledby="newsletter-episodes">
              <div className="content-container home-head">
                <h2 className="cover-section__title" id="newsletter-episodes">
                  أحدث حلقات {programme.name}
                </h2>
                <div className="home-head__tools">
                  <Link
                    className="stage-link"
                    href={`/episodes?showId=${encodeURIComponent(show.id)}`}
                  >
                    كل الحلقات
                  </Link>
                  <RailControls target="newsletter-episodes-rail" label="الحلقات" />
                </div>
              </div>
              <div
                id="newsletter-episodes-rail"
                className="stage-rail stage-rail--episodes"
                role="list"
                tabIndex={0}
                aria-label={`أحدث حلقات ${programme.name}`}
              >
                {latest.episodes.map((episode) => (
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

          <section className="content-container" aria-labelledby="newsletter-others">
            <h2 className="cover-section__title" id="newsletter-others">
              نشرات أخرى
            </h2>
            <div className="cover-section__body">
              <NewsletterCards newsletters={others} variant="stage" />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
