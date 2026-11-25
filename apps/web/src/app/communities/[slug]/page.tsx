import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EpisodeCard } from '@/components/cards';
import { NEWSLETTERS_NOUN, PROGRAMMES_NOUN, countInWords } from '@/components/formatting';
import { CommunityHero, CommunitySlides, ProgrammeTile } from '@/components/home-stage';
import { NewsletterCards } from '@/components/newsletter-cards';
import { RailControls } from '@/components/public-content-controls';
import {
  COMMUNITIES,
  communityLogo,
  findCommunity,
  newslettersOf,
  type Community,
} from '@/lib/communities';
import { latestEpisodesOf } from '@/lib/community-episodes';

export const revalidate = 60;

type Params = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return COMMUNITIES.map((community) => ({ slug: community.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const community = findCommunity((await params).slug);
  if (!community) return { title: 'الصفحة غير موجودة' };
  return {
    title: community.name,
    description: community.description,
    alternates: { canonical: `/communities/${community.slug}` },
    openGraph: { images: [communityLogo(community)] },
  };
}

/** «تسعة برامج ونشرتان»: said only when there is more than one programme to count. */
function communityFact(community: Community) {
  const programmes = community.programmes.length;
  if (programmes < 2) return undefined;
  const newsletters = newslettersOf(community).length;
  const held = countInWords(programmes, PROGRAMMES_NOUN);
  return newsletters ? `${held} و${countInWords(newsletters, NEWSLETTERS_NOUN)}` : held;
}

/**
 * A community page of the presentation site (D-24). The route that left the
 * home headline arrives at the community's name on the night stage; the sheet
 * then shows its programmes whole, its latest episodes, its newsletters and
 * the other communities.
 */
export default async function CommunityPage({ params }: Params) {
  const community = findCommunity((await params).slug);
  if (!community) notFound();
  const showSlugs = community.programmes.flatMap((p) => (p.showSlug ? [p.showSlug] : []));
  const latest = await latestEpisodesOf(showSlugs);
  const newsletters = newslettersOf(community);
  const others = COMMUNITIES.filter((other) => other.slug !== community.slug);

  return (
    <div className="stage-page">
      <div className="stage-scope">
        <CommunityHero community={community} fact={communityFact(community)} />
      </div>

      <div className="home-sheet">
        <div className="home-sheet__surface">
          {community.programmes.length ? (
            <section className="content-container" aria-labelledby="community-programmes">
              <h2 className="cover-section__title" id="community-programmes">
                برامج {community.name}
              </h2>
              <ul className="community-programmes">
                {community.programmes.map((programme) => (
                  <ProgrammeTile key={programme.slug} programme={programme} />
                ))}
              </ul>
            </section>
          ) : null}

          {latest && latest.episodes.length ? (
            <section aria-labelledby="community-episodes">
              <div className="content-container home-head">
                <h2 className="cover-section__title" id="community-episodes">
                  أحدث الحلقات
                </h2>
                <div className="home-head__tools">
                  <Link className="stage-link" href="/episodes">
                    كل الحلقات
                  </Link>
                  <RailControls target="community-episodes-rail" label="الحلقات" />
                </div>
              </div>
              <div
                id="community-episodes-rail"
                className="stage-rail stage-rail--episodes"
                role="list"
                tabIndex={0}
                aria-label={`أحدث حلقات ${community.name}`}
              >
                {latest.episodes.map((episode) => {
                  const show = latest.shows.get(episode.showId);
                  return (
                    <EpisodeCard
                      key={episode.id}
                      episode={episode}
                      showName={show?.titleAr}
                      showArtwork={show?.artworkUrl}
                    />
                  );
                })}
              </div>
            </section>
          ) : null}

          {newsletters.length ? (
            <section className="content-container" aria-labelledby="community-newsletters">
              <h2 className="cover-section__title" id="community-newsletters">
                {newsletters.length > 1 ? 'نشرات' : 'نشرة'} {community.name}
              </h2>
              <div className="cover-section__body">
                <NewsletterCards newsletters={newsletters} variant="stage" />
              </div>
            </section>
          ) : null}

          <section aria-labelledby="community-others">
            <div className="content-container home-head">
              <h2 className="cover-section__title" id="community-others">
                مجتمعات أخرى
              </h2>
              <div className="home-head__tools">
                <Link className="stage-link" href="/communities">
                  كل المجتمعات
                </Link>
                <RailControls target="community-others-rail" label="المجتمعات" />
              </div>
            </div>
            <CommunitySlides communities={others} id="community-others-rail" />
          </section>

          <div className="content-container">
            <section className="community-invite cover-invite" aria-labelledby="invite-title">
              <div>
                <h2 className="community-invite__title" id="invite-title">
                  مين ودّك نسمع قصته؟
                </h2>
                <p>رشّح لنا شخصًا عنده تجربة أو معرفة تستحق نفتح حولها حوار.</p>
              </div>
              <Link className="public-primary" href="/suggest">
                اقترح ضيفًا
              </Link>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
