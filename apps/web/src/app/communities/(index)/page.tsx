import type { Metadata } from 'next';
import Link from 'next/link';
import { CommunitiesMap, type MapField } from '@/components/communities-map';
import { PROGRAMMES_NOUN, countInWords } from '@/components/formatting';
import { COMMUNITIES, coverTone, programmeCover, programmeHref } from '@/lib/communities';
import { phoneMap, wideMap, type MapDrawing } from '@/lib/map-maze';

const LEDE = 'لكل مجال عالمه الخاص وتجاربه. اكتشف البرامج والقصص الأقرب إلى اهتماماتك.';

export const metadata: Metadata = {
  title: 'مجتمعات مختلف',
  description: LEDE,
  alternates: { canonical: '/communities' },
};

/** What the client needs of a drawing: no cells, no maze. */
const field = (map: MapDrawing): MapField => ({
  width: map.width,
  height: map.height,
  frameWidth: map.frameWidth,
  frameLeft: map.frameLeft,
  walls: map.walls,
  font: map.font,
  stations: map.stations.map(({ slug, right, top, route }) => ({ slug, right, top, route })),
});

/**
 * «اكتشف مجتمعات مختلف» of the presentation site (D-24). The stage is a map
 * of the nine communities; the sheet under it is the map's legend, in the same
 * order: what each holds, a few of its covers, and the way in.
 */
export default function CommunitiesPage() {
  const names = Object.fromEntries(
    COMMUNITIES.map((community) => [community.slug, community.name]),
  );
  return (
    <div className="stage-page communities-page">
      <div className="stage-scope">
        <CommunitiesMap
          wide={field(wideMap(COMMUNITIES))}
          phone={field(phoneMap(COMMUNITIES))}
          names={names}
          lede={LEDE}
        />
      </div>

      <div className="home-sheet">
        <div className="home-sheet__surface">
          <section className="content-container" aria-label="مفتاح الخريطة">
            <ul className="communities-legend">
              {COMMUNITIES.map((community) => {
                const covers = community.programmes.slice(0, 5);
                return (
                  <li className="communities-legend__item" key={community.slug}>
                    <h2 className="communities-legend__name">
                      <Link href={`/communities/${community.slug}`}>{community.name}</Link>
                    </h2>
                    <p className="communities-legend__count">
                      {community.programmes.length
                        ? countInWords(community.programmes.length, PROGRAMMES_NOUN)
                        : 'لا برامج بعد'}
                    </p>
                    <p className="communities-legend__text">{community.description}</p>
                    {covers.length ? (
                      <ul
                        className="communities-legend__covers"
                        aria-label={`من برامج ${community.name}`}
                      >
                        {covers.map((programme) => (
                          <li key={programme.slug} data-tone={coverTone(programme)}>
                            <Link href={programmeHref(programme)}>
                              <img
                                src={programmeCover(programme)}
                                alt={programme.name}
                                width="64"
                                height="64"
                                loading="lazy"
                                decoding="async"
                              />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="communities-legend__covers" aria-hidden="true" />
                    )}
                    <Link className="stage-link" href={`/communities/${community.slug}`}>
                      استكشف المجتمع
                      <span className="visually-hidden"> {community.name}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
