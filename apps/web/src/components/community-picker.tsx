'use client';

import Link from 'next/link';
import { useState } from 'react';

/** The drawing, computed on the server from `PICKER` so the maze code never ships. */
export interface PickerBoard {
  width: number;
  height: number;
  walls: string;
  origin: { x: number; y: number };
  exits: { slug: string; side: 'right' | 'left'; top: number; route: string }[];
}

export interface PickerCommunity {
  slug: string;
  name: string;
  description: string;
  logo: string;
  programmes: { slug: string; name: string; href: string; cover: string; tone: 'dark' | 'light' }[];
}

/**
 * «أي مسار يشبهك؟» on wide screens (D-24): every community is an exit of one
 * maze. Choosing one draws its route from the centre and shows the community
 * under the board. Phones and tablets get `CommunitySlides` instead.
 */
export function CommunityPicker({
  board,
  communities,
}: {
  board: PickerBoard;
  communities: PickerCommunity[];
}) {
  const [selected, setSelected] = useState(communities[0]?.slug ?? '');
  const bySlug = new Map(communities.map((community) => [community.slug, community]));
  const exit = board.exits.find((item) => item.slug === selected);
  const community = bySlug.get(selected);
  const viewBox = `0 0 ${board.width} ${board.height}`;

  return (
    <div className="community-picker">
      <div className="community-picker__board" role="group" aria-label="اختر مجتمعًا">
        <svg
          className="community-picker__walls"
          viewBox={viewBox}
          aria-hidden="true"
          focusable="false"
        >
          <path d={board.walls} />
        </svg>
        {exit ? (
          // A new key redraws the route from the centre on every choice.
          <svg
            key={exit.slug}
            className="community-picker__route"
            viewBox={viewBox}
            aria-hidden="true"
            focusable="false"
          >
            <path className="stage-route__trace" d={exit.route} />
            <path className="stage-route__ink" d={exit.route} pathLength={1} />
          </svg>
        ) : null}
        <svg
          className="community-picker__origin"
          viewBox={viewBox}
          aria-hidden="true"
          focusable="false"
        >
          <path d={`M${board.origin.x} ${board.origin.y - 13}l13 13-13 13-13-13Z`} />
        </svg>
        {board.exits.map((item) => {
          const name = bySlug.get(item.slug)?.name;
          if (!name) return null;
          return (
            <button
              key={item.slug}
              type="button"
              className="community-picker__exit"
              data-side={item.side}
              style={{ top: `${(item.top * 100).toFixed(3)}%` }}
              aria-pressed={item.slug === selected}
              aria-controls="community-picker-detail"
              onClick={() => setSelected(item.slug)}
            >
              {name}
            </button>
          );
        })}
      </div>
      <div id="community-picker-detail" className="community-picker__detail" aria-live="polite">
        {community ? (
          <>
            <img
              className="community-picker__logo"
              src={community.logo}
              alt=""
              width="400"
              height="400"
              loading="lazy"
              decoding="async"
            />
            <div className="community-picker__about">
              <h3 className="community-picker__name">{community.name}</h3>
              <p className="community-picker__text">{community.description}</p>
              {community.programmes.length ? (
                <ul className="community-picker__covers" aria-label={`برامج ${community.name}`}>
                  {community.programmes.map((programme) => (
                    <li key={programme.slug} data-tone={programme.tone}>
                      <Link href={programme.href} title={programme.name}>
                        <img
                          src={programme.cover}
                          alt={programme.name}
                          width="112"
                          height="112"
                          loading="lazy"
                          decoding="async"
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
              <Link className="stage-link" href={`/communities/${community.slug}`}>
                ادخل {community.name}
              </Link>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
