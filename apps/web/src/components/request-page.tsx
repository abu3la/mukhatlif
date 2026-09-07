import type { ReactNode } from 'react';

interface RequestPageProps {
  title: string;
  intro: string;
  note: string;
  children: ReactNode;
}

export function RequestPage({ title, intro, note, children }: RequestPageProps) {
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
          <p className="public-request-note">{note}</p>
        </header>
        <div className="request-page__body">{children}</div>
      </div>
    </div>
  );
}
