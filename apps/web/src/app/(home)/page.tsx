import type { Metadata } from 'next';
import Link from 'next/link';
import type { Programme } from '@/lib/communities';
import {
  CommunityPicker,
  type PickerBoard,
  type PickerCommunity,
} from '@/components/community-picker';
import { HomeManifesto } from '@/components/home-manifesto';
import {
  CommunitySlides,
  HomeCredits,
  HomeHero,
  HomeServices,
  HomeStory,
  ProgrammeRail,
} from '@/components/home-stage';
import { NewsletterSignup } from '@/components/newsletter-signup';
import { RailControls } from '@/components/public-content-controls';
import {
  COMMUNITIES,
  communityLogo,
  coverTone,
  findProgramme,
  programmeCover,
  programmeHref,
} from '@/lib/communities';
import { apiOrigin } from '@/lib/config';
import { PICKER } from '@/lib/home-maze';
import { FEATURED_PROGRAMMES } from '@/lib/site-facts';

export const metadata: Metadata = { alternates: { canonical: '/' } };

/**
 * The home page as a presentation of Mukhtalif (direction C, D-24): the night
 * stage tells who we are, the sheet shows the programmes and the way to one's
 * community, and the floor offers production and names the team. Listening
 * starts from «استمع» in the header and from every programme.
 */
export default function HomePage() {
  const featured = FEATURED_PROGRAMMES.map((slug) => findProgramme(slug)?.programme).filter(
    (programme): programme is Programme => Boolean(programme),
  );
  const board: PickerBoard = {
    width: PICKER.width,
    height: PICKER.height,
    walls: PICKER.walls,
    origin: PICKER.origin,
    exits: PICKER.exits.map(({ slug, side, top, route }) => ({ slug, side, top, route })),
  };
  const communities: PickerCommunity[] = COMMUNITIES.map((community) => ({
    slug: community.slug,
    name: community.name,
    description: community.description,
    logo: communityLogo(community),
    programmes: community.programmes.map((programme) => ({
      slug: programme.slug,
      name: programme.name,
      href: programmeHref(programme),
      cover: programmeCover(programme),
      tone: coverTone(programme),
    })),
  }));

  return (
    <div className="stage-page">
      <div className="stage-scope">
        <HomeHero />
        <HomeManifesto />
        <HomeStory />
      </div>

      <div className="home-sheet">
        <div className="home-sheet__surface">
          <section className="home-programmes" aria-labelledby="home-programmes-title">
            <div className="content-container home-head">
              <h2 id="home-programmes-title" className="stage-statement">
                أصوات من داخل المهن.
              </h2>
              <div className="home-head__tools">
                <Link className="stage-link" href="/programmes">
                  كل البرامج
                </Link>
                <RailControls target="home-programmes-rail" label="البرامج" />
              </div>
            </div>
            <ProgrammeRail id="home-programmes-rail" label="برامج من مختلف" programmes={featured} />
          </section>

          <section className="home-ways" aria-labelledby="home-ways-title">
            <div className="content-container home-ways__head">
              <h2 id="home-ways-title" className="stage-statement">
                أي مسار يشبهك؟
              </h2>
              <p className="home-ways__lede">
                لكل مجال عالمه الخاص وتجاربه. اختر مجتمعًا لترى طريقك إليه.
              </p>
            </div>
            <div className="content-container home-ways__picker">
              <CommunityPicker board={board} communities={communities} />
            </div>
            <div className="home-ways__slides">
              <div className="content-container home-head home-head--end">
                <Link className="stage-link" href="/communities">
                  كل المجتمعات
                </Link>
                <RailControls target="home-communities-rail" label="المجتمعات" />
              </div>
              <CommunitySlides communities={COMMUNITIES} id="home-communities-rail" />
            </div>
          </section>

          <div className="content-container home-newsletter">
            <NewsletterSignup apiOrigin={apiOrigin()} />
          </div>
        </div>
      </div>

      <div className="floor-scope home-floor">
        <HomeServices />
        <HomeCredits />
      </div>
    </div>
  );
}
