import type { ReactNode } from 'react';

interface RequestPageProps {
  title: string;
  intro: string;
  note?: string;
  /** Extra context under the picture, such as the ways to work together. */
  details?: ReactNode;
  children: ReactNode;
}

export function RequestPage({ title, intro, note, details, children }: RequestPageProps) {
  return (
    <div className="content-page request-page">
      <div className="content-container public-request-layout">
        <header className="request-page__header public-request-context">
          <h1>{title}</h1>
          <p>{intro}</p>
          <img
            src="/handoff/mukhtalif-scene.png"
            alt="مختلف، المهنة وهمومها قضيتنا"
            width="460"
            height="259"
          />
          {details}
          {note ? <p className="public-request-note">{note}</p> : null}
        </header>
        <div className="request-page__body">{children}</div>
      </div>
    </div>
  );
}
