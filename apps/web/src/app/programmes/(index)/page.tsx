import type { Metadata } from 'next';
import Link from 'next/link';
import { COMMUNITIES_NOUN, PROGRAMMES_NOUN, countInWords } from '@/components/formatting';
import { programmeTileData } from '@/components/home-stage';
import { ProgrammeDirectory, type DirectoryGroup } from '@/components/programme-directory';
import { COMMUNITIES, coverTone, programmeCover, programmeHref } from '@/lib/communities';
import { communityTile } from '@/lib/directory-maze';

export const metadata: Metadata = {
  title: 'برامج البودكاست',
  description: 'لكل برنامج عالمه. اختر ما يشغلك، وتابع الحكاية.',
  alternates: { canonical: '/programmes' },
};

const strip = ({
  width,
  height,
  walls,
  route,
  stopTop,
  nameRight,
  nameSize,
}: DirectoryGroup['wide']) => ({
  width,
  height,
  walls,
  route,
  stopTop,
  nameRight,
  nameSize,
});

/**
 * «برامج البودكاست» of the presentation site (D-24). Every cover drifts
 * across the edge of the night stage onto the sheet; under it the whole
 * directory, community by community, each opening with a tile where the route
 * arrives at its name.
 */
export default function ProgrammesPage() {
  const communities = COMMUNITIES.filter((community) => community.programmes.length);
  const programmes = communities.flatMap((community) => community.programmes);
  const groups: DirectoryGroup[] = communities.map((community) => ({
    slug: community.slug,
    name: community.name,
    description: community.description,
    count: countInWords(community.programmes.length, PROGRAMMES_NOUN),
    wide: strip(communityTile(community, 'wide')),
    phone: strip(communityTile(community, 'phone')),
    programmes: community.programmes.map(programmeTileData),
  }));
  // The band runs twice, so its loop has no seam; the second run is for the eye only.
  const band = (copy: number) => (
    <ul className="programmes-band__set" key={copy}>
      {programmes.map((programme) => (
        <li key={programme.slug} data-tone={coverTone(programme)}>
          <Link href={programmeHref(programme)} tabIndex={-1}>
            <img
              src={programmeCover(programme)}
              alt=""
              width="200"
              height="200"
              loading="lazy"
              decoding="async"
            />
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="stage-page programmes-page">
      <div className="stage-scope">
        <section className="stage-intro programmes-intro" aria-labelledby="programmes-title">
          <div className="content-container stage-head">
            <h1 id="programmes-title" className="stage-statement">
              برامج البودكاست
            </h1>
            <p className="stage-head__lede">
              لكل برنامج عالمه. اختر ما يشغلك، وتابع الحكاية.{' '}
              <span className="stage-head__fact">
                {countInWords(programmes.length, PROGRAMMES_NOUN)} في{' '}
                {countInWords(communities.length, COMMUNITIES_NOUN)}.
              </span>
            </p>
          </div>
          <div className="programmes-band" aria-hidden="true">
            <div className="programmes-band__track">{[0, 1].map(band)}</div>
          </div>
        </section>
      </div>

      <div className="home-sheet">
        <div className="home-sheet__surface">
          <ProgrammeDirectory groups={groups} total={programmes.length} />
        </div>
      </div>
    </div>
  );
}
