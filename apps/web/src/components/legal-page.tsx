import Link from 'next/link';

export interface LegalSection {
  /** The section's anchor, so the stage's index and a shared link can reach it. */
  id: string;
  title: string;
  text: string;
}

/**
 * A policy page of the presentation site (D-24): its title and line on the
 * night stage with an index of its sections at the stage's edge, the text on
 * the sheet at the article's reading measure, and where to act on it after.
 */
export function LegalPage({
  title,
  lede,
  sections,
  links,
}: {
  title: string;
  lede: string;
  sections: readonly LegalSection[];
  links: readonly (readonly [href: string, label: string])[];
}) {
  return (
    <div className="stage-page legal-page">
      <div className="stage-scope">
        <section className="stage-intro legal-stage" aria-labelledby="legal-title">
          <div className="content-container stage-head">
            <h1 id="legal-title" className="stage-statement">
              {title}
            </h1>
            <p className="stage-head__lede">{lede}</p>
          </div>
          <nav className="search-kinds legal-index" aria-label={`أقسام ${title}`}>
            <ul>
              {sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`}>{section.title}</a>
                </li>
              ))}
            </ul>
          </nav>
        </section>
      </div>

      <div className="home-sheet">
        <div className="home-sheet__surface">
          <article
            className="content-container article-read legal-read"
            aria-labelledby="legal-title"
          >
            <div className="prose">
              {sections.map((section) => (
                <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`}>
                  <h2 id={`${section.id}-title`}>{section.title}</h2>
                  <p>{section.text}</p>
                </section>
              ))}
            </div>
            <ul className="stage-topics legal-read__links">
              {links.map(([href, label]) => (
                <li key={href}>
                  <Link className="stage-link" href={href}>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </article>
        </div>
      </div>
    </div>
  );
}
