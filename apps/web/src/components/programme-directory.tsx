'use client';

import type { CSSProperties } from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { Diamond } from '@/components/maze-drawing';
import { ProgrammeTileView, type ProgrammeTileData } from '@/components/programme-tile-view';

export interface TileArt {
  width: number;
  height: number;
  walls: string;
  route: string;
  stopTop: number;
  nameRight: number;
  nameSize: number;
}

export interface DirectoryGroup {
  slug: string;
  name: string;
  description: string;
  /** «تسعة برامج» */
  count: string;
  wide: TileArt;
  phone: TileArt;
  programmes: ProgrammeTileData[];
}

/** A community's small night stage: the route enters from the top and arrives at its name. */
function CommunityArt({ art, name, variant }: { art: TileArt; name: string; variant: string }) {
  const box = {
    aspectRatio: `${art.width} / ${art.height.toFixed(2)}`,
    '--stop-top': `${(art.stopTop * 100).toFixed(3)}%`,
    '--name-right': `${(art.nameRight * 100).toFixed(3)}%`,
    '--name-size': `${(art.nameSize * 100).toFixed(4)}cqi`,
  } as CSSProperties;
  const viewBox = `0 0 ${art.width} ${art.height.toFixed(2)}`;
  return (
    <span className={`directory-art directory-art--${variant}`} style={box} aria-hidden="true">
      <svg className="directory-art__drawing" viewBox={viewBox} focusable="false">
        <path className="directory-art__walls" d={art.walls} />
        <path className="stage-route__trace" d={art.route} />
        <path className="stage-route__ink" d={art.route} pathLength={1} />
      </svg>
      <span className="directory-art__name">
        {name}
        <Diamond className="stage-hero__stop" />
      </span>
    </span>
  );
}

/**
 * «كل البرامج» (D-24): the whole directory, community by community. Each
 * community opens with its own night tile, then its programmes, all in one
 * grid; on phones each community is a band above a rail. Choosing a community
 * keeps only its part.
 */
export function ProgrammeDirectory({ groups, total }: { groups: DirectoryGroup[]; total: number }) {
  const [show, setShow] = useState('all');
  const choices = [
    { slug: 'all', name: 'كل البرامج', count: total },
    ...groups.map((group) => ({
      slug: group.slug,
      name: group.name,
      count: group.programmes.length,
    })),
  ];
  return (
    <section className="content-container programme-directory" aria-labelledby="directory-title">
      <h2 id="directory-title" className="visually-hidden">
        كل البرامج
      </h2>
      <ul className="programme-directory__filter" aria-label="اختر مجتمعًا">
        {choices.map((choice) => (
          <li key={choice.slug}>
            <button
              type="button"
              aria-pressed={show === choice.slug}
              onClick={() => setShow(choice.slug)}
            >
              {choice.name}
              <bdi>{choice.count}</bdi>
            </button>
          </li>
        ))}
      </ul>
      <div className="programme-directory__groups">
        {groups.map((group) => (
          <section
            key={group.slug}
            className="directory-group"
            aria-label={group.name}
            hidden={show !== 'all' && show !== group.slug}
          >
            <div className="programme-tile directory-community">
              <Link className="programme-tile__link" href={`/communities/${group.slug}`}>
                <CommunityArt art={group.wide} name={group.name} variant="wide" />
                <CommunityArt art={group.phone} name={group.name} variant="phone" />
                <span className="programme-tile__name">{group.name}</span>
                <span className="programme-tile__text">{group.description}</span>
                <span className="programme-tile__hosts">{group.count}</span>
              </Link>
            </div>
            <ul className="directory-group__list" aria-label={`برامج ${group.name}`}>
              {group.programmes.map((programme) => (
                <ProgrammeTileView key={programme.slug} programme={programme} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}
