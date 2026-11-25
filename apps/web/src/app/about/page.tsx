import type { Metadata } from 'next';
import Link from 'next/link';
import { HomeManifesto } from '@/components/home-manifesto';
import { CommunitySlides, HomeCredits, HomeStory } from '@/components/home-stage';
import { RailControls } from '@/components/public-content-controls';
import { COMMUNITIES } from '@/lib/communities';

export const metadata: Metadata = {
  title: 'من نحن',
  description: 'مختلف شبكة محتوى تضم مجتمعات متخصصة وبرامج بودكاست ومقالات ونشرات وورشًا تعليمية.',
  alternates: { canonical: '/about' },
};

/**
 * «من نحن» of the presentation site (D-24): who we are on the night stage,
 * then the cause lit phrase by phrase and the story as stops on the route;
 * the sheet holds the communities and the way to write to us, and the floor
 * names the people behind Mukhtalif.
 */
export default function AboutPage() {
  return (
    <div className="stage-page about-stage-page">
      <div className="stage-scope">
        <section className="stage-intro about-intro" aria-labelledby="about-title">
          <div className="content-container stage-head">
            <h1 id="about-title" className="stage-statement">
              من نحن
            </h1>
            <p className="stage-head__lede">
              مختلف شبكة محتوى تضم مجتمعات متخصصة وبرامج بودكاست ومقالات ونشرات وورشًا تعليمية. نفتح
              مساحات للحوار، وننقل تجارب الناس ومعارفهم لمساعدتك على فهم مجالك واكتشاف مسار يشبهك.{' '}
              <span className="stage-head__fact">مختلف إحدى شركات ماد قروب.</span>
            </p>
          </div>
        </section>
        <HomeManifesto />
        <HomeStory />
      </div>

      <div className="home-sheet">
        <div className="home-sheet__surface">
          <section aria-labelledby="about-communities">
            <div className="content-container home-head">
              <h2 className="cover-section__title" id="about-communities">
                المجتمعات والبرامج
              </h2>
              <div className="home-head__tools">
                <Link className="stage-link" href="/communities">
                  كل المجتمعات
                </Link>
                <RailControls target="about-communities-rail" label="المجتمعات" />
              </div>
            </div>
            <CommunitySlides communities={COMMUNITIES} id="about-communities-rail" />
          </section>

          <div className="content-container">
            <section className="community-invite cover-invite" aria-labelledby="about-contact">
              <div>
                <h2 className="community-invite__title" id="about-contact">
                  تواصل معنا
                </h2>
                <p>
                  اكتب لنا على <bdi dir="ltr">Info@mukhtalif.net</bdi>
                </p>
              </div>
              <Link className="public-primary" href="/contact">
                تواصل مع مختلف
              </Link>
            </section>
          </div>
        </div>
      </div>

      <div className="floor-scope home-floor" id="team">
        <HomeCredits />
      </div>
    </div>
  );
}
