import type { ReactNode } from 'react';
import { Diamond, MazeDrawing } from '@/components/maze-drawing';
import { SIGNIN_DRAWINGS } from '@/lib/auth-maze';

interface RequestPageProps {
  title: string;
  intro: string;
  note?: string;
  /** Extra context above the form, such as the ways to work together. */
  details?: ReactNode;
  children: ReactNode;
}

/**
 * Every request form on the presentation site (D-24): the maze stage of the
 * sign-in pages, where the route that runs through the site arrives at the
 * form. «الإنتاج» ends at «تابع إلى الطلب», which lands here. On phones the
 * form is the sheet under the drawing.
 */
export function RequestPage({ title, intro, note, details, children }: RequestPageProps) {
  return (
    <div className="stage-page auth-page request-page">
      <section className="stage-scope auth-stage" aria-labelledby="request-title">
        <MazeDrawing maze={SIGNIN_DRAWINGS.wide} variant="wide" />
        <MazeDrawing maze={SIGNIN_DRAWINGS.phone} variant="phone" />
        <Diamond className="auth-stage__stop" />
        {/* The field recipes are scoped to .public-request-layout. */}
        <div className="auth-card request-card public-request-layout">
          <h1 id="request-title" className="request-card__title">
            {title}
          </h1>
          <p className="auth-card__intro">{intro}</p>
          {details ? <div className="request-card__details">{details}</div> : null}
          <div className="request-page__body">{children}</div>
          {note ? <p className="request-card__note">{note}</p> : null}
        </div>
      </section>
    </div>
  );
}
