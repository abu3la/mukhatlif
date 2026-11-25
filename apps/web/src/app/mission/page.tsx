import type { Metadata } from 'next';
import Link from 'next/link';
import { HomeHero, ProgrammeRail } from '@/components/home-stage';
import { RailControls } from '@/components/public-content-controls';
import { findProgramme, type Programme } from '@/lib/communities';
import { FEATURED_PROGRAMMES } from '@/lib/site-facts';

export const metadata: Metadata = {
  title: 'قضيتنا',
  description: 'لمسار مهني يشبهك. المهنة وهمومها قضية مختلف.',
  alternates: { canonical: '/mission' },
};

/**
 * «قضيتنا» of the presentation site (D-24). The line the home opens with is
 * the cause itself, so the page stands on the same drawing, with the cause
 * under it; the sheet then opens the programmes that carry it.
 */
export default function MissionPage() {
  const programmes = FEATURED_PROGRAMMES.map((slug) => findProgramme(slug)?.programme).filter(
    (programme): programme is Programme => Boolean(programme),
  );
  return (
    <div className="stage-page mission-page">
      <div className="stage-scope">
        <HomeHero lede="نهدف إلى أن يعيش كل شخص يومًا مهنيًا يناسب قيمه وظروفه وإمكاناته، لذلك اخترنا المهنة وهمومها قضيتنا." />
      </div>

      <div className="home-sheet">
        <div className="home-sheet__surface">
          <section className="content-container mission-cause" aria-labelledby="mission-title">
            <h2 id="mission-title" className="stage-statement">
              قضيتنا
            </h2>
            <p className="mission-cause__text">
              تتنوع المهن وتتعدد تجارب أصحابها. في برامج مختلف وقراءاتها مساحة لفهم العمل، وتبادل
              التجربة، والتأمل في الخيارات التي تشكل حياتنا المهنية.
            </p>
          </section>

          <section aria-labelledby="mission-programmes">
            <div className="content-container home-head">
              <h2 id="mission-programmes" className="cover-section__title">
                أصوات من داخل المهن.
              </h2>
              <div className="home-head__tools">
                <Link className="stage-link" href="/programmes">
                  استكشف برامج مختلف
                </Link>
                <RailControls target="mission-programmes-rail" label="البرامج" />
              </div>
            </div>
            <ProgrammeRail
              id="mission-programmes-rail"
              label="برامج من مختلف"
              programmes={programmes}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
