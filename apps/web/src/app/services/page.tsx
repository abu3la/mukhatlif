import type { Metadata } from 'next';
import Link from 'next/link';
import { ProgrammeRail } from '@/components/home-stage';
import { ProductionChooser, type BriefField } from '@/components/production-chooser';
import { RailControls } from '@/components/public-content-controls';
import { BRIEF_PHONE, BRIEF_WIDE, briefDrawing } from '@/lib/brief-maze';
import { findProgramme } from '@/lib/communities';
import { FEATURED_PROGRAMMES, SERVICES } from '@/lib/site-facts';

export const metadata: Metadata = {
  title: 'الإنتاج',
  description: 'طوّر فكرتك مع مختلف إلى بودكاست أو سلسلة مرئية أو قصة علامة.',
  alternates: { canonical: '/services' },
};

/** The production form's own note on what happens next. */
const NOTE =
  'يقرأ فريق الإنتاج تفاصيل المشروع، ثم يتواصل معك لتحديد النطاق والموعد والخطوة التالية.';

const field = (drawing: ReturnType<typeof briefDrawing>): BriefField => ({
  width: drawing.width,
  height: drawing.height,
  frameWidth: drawing.plan.frameWidth,
  frameLeft: drawing.frameLeft,
  pitch: drawing.plan.pitch,
  walls: drawing.walls,
  routes: drawing.routes,
  formRows: drawing.plan.formRows,
  buttonRow: drawing.plan.buttonRow,
  right: drawing.plan.right,
  font: drawing.plan.font,
  buttonWidth: drawing.plan.buttonWidth,
});

/**
 * «الإنتاج» of the presentation site (D-24): the page is the first step of
 * the brief. Choose a form and its route draws through the maze to the
 * request; under the stage, the work that already has a voice.
 */
export default function ServicesPage() {
  const work = FEATURED_PROGRAMMES.flatMap((slug) => {
    const found = findProgramme(slug);
    return found ? [found.programme] : [];
  });
  return (
    <div className="stage-page production-page">
      <div className="stage-scope">
        <ProductionChooser
          wide={field(briefDrawing(BRIEF_WIDE))}
          phone={field(briefDrawing(BRIEF_PHONE))}
          forms={SERVICES}
          note={NOTE}
        />
      </div>

      <div className="home-sheet">
        <div className="home-sheet__surface">
          <section aria-labelledby="production-work">
            <div className="content-container home-head production-work__head">
              <div>
                <h2 className="cover-section__title" id="production-work">
                  أعمال لها صوت.
                </h2>
                <p className="production-work__lede">برامج منشورة من مختلف.</p>
              </div>
              <div className="home-head__tools">
                <Link className="stage-link" href="/work">
                  كل الأعمال
                </Link>
                <RailControls target="production-work-rail" label="الأعمال" />
              </div>
            </div>
            <ProgrammeRail programmes={work} id="production-work-rail" label="أعمال مختلف" />
          </section>
        </div>
      </div>
    </div>
  );
}
