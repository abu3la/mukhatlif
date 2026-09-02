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
      <div className="content-container content-container--narrow">
        <header className="request-page__header">
          <h1>{title}</h1>
          <p>{intro}</p>
        </header>
        <div className="request-page__body">
          <aside className="request-page__note">
            <h2>ماذا يحدث بعد الإرسال؟</h2>
            <p>{note}</p>
            <p>يُحفظ الطلب لدى الفريق حتى لا تضيع متابعته.</p>
          </aside>
          {children}
        </div>
      </div>
    </div>
  );
}
