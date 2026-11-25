import Link from 'next/link';
import {
  PRESENTERS,
  coverTone,
  programmeCover,
  programmeHref,
  programmesOf,
  type Presenter,
  type Programme,
} from '@/lib/communities';

export interface PresenterCredit {
  /** Absent only for a presenter no programme lists yet. */
  programme?: Programme;
  presenters: Presenter[];
}

/**
 * The presenters grouped by the programme they present, in the brief's order:
 * co-hosts share one credit, so a cover is never shown twice in a row.
 */
export function presenterCredits(presenters: readonly Presenter[] = PRESENTERS): PresenterCredit[] {
  const credits: PresenterCredit[] = [];
  for (const presenter of presenters) {
    const programmes = programmesOf(presenter.slug).map(({ programme }) => programme);
    for (const programme of programmes.length ? programmes : [undefined]) {
      const credit = credits.find((item) => item.programme?.slug === programme?.slug);
      if (credit) credit.presenters.push(presenter);
      else credits.push({ programme, presenters: [presenter] });
    }
  }
  return credits;
}

/**
 * «مقدّمو مختلف» read like the programmes' closing credits (D-24): down the
 * page's axis run the programme covers; each presenter's name stands on one
 * side of their cover and what they do on the other. A co-host follows under
 * the same cover. Covers only: a portrait belongs to the presenter's own page,
 * and no one is drawn as initials.
 */
export function PresenterCredits({ labelledBy }: { labelledBy?: string }) {
  return (
    <ul className="presenter-credits" aria-labelledby={labelledBy}>
      {presenterCredits().map(({ programme, presenters }) => (
        <li
          className="presenter-credit"
          key={programme?.slug ?? 'none'}
          data-tone={programme ? coverTone(programme) : undefined}
        >
          {presenters.map((presenter, index) => (
            <article
              className="presenter-credit__row"
              key={presenter.slug}
              aria-labelledby={`presenter-${presenter.slug}`}
            >
              <h2 className="presenter-credit__name" id={`presenter-${presenter.slug}`}>
                {presenter.name}
              </h2>
              {programme && index === 0 ? (
                <Link className="presenter-credit__cover" href={programmeHref(programme)}>
                  <img
                    src={programmeCover(programme)}
                    alt={programme.name}
                    width="240"
                    height="240"
                    loading="lazy"
                    decoding="async"
                  />
                </Link>
              ) : (
                <span className="presenter-credit__cover" aria-hidden="true" />
              )}
              <div className="presenter-credit__about">
                <p className="presenter-credit__bio">{presenter.bio}</p>
                <Link className="stage-link" href={`/presenters/${presenter.slug}`}>
                  {presenter.feminine ? 'تعرّف عليها' : 'تعرّف عليه'}
                  <span className="visually-hidden">: {presenter.name}</span>
                </Link>
              </div>
            </article>
          ))}
        </li>
      ))}
    </ul>
  );
}
