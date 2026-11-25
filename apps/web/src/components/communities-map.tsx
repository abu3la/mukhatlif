'use client';

import type { CSSProperties } from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { Diamond } from '@/components/maze-drawing';

export interface MapField {
  width: number;
  height: number;
  frameWidth: number;
  frameLeft: number;
  walls: string;
  font: number;
  stations: { slug: string; right: number; top: number; route: string }[];
}

/** One composition: the walls, the route to the name being pointed at, and the names. */
function Field({
  field,
  variant,
  names,
  lit,
  light,
}: {
  field: MapField;
  variant: 'wide' | 'phone';
  names: Record<string, string>;
  lit: string;
  light: (slug: string) => void;
}) {
  const viewBox = `0 0 ${field.width} ${field.height}`;
  const route = field.stations.find((station) => station.slug === lit)?.route;
  const size = {
    '--field-w': field.width,
    '--field-h': field.height,
    '--frame-w': field.frameWidth,
    '--frame-left': field.frameLeft,
    '--name-size': field.font,
  } as CSSProperties;
  return (
    <div className={`communities-map__field communities-map__field--${variant}`} style={size}>
      <svg
        className="communities-map__walls"
        viewBox={viewBox}
        aria-hidden="true"
        focusable="false"
      >
        <path d={field.walls} />
      </svg>
      {route ? (
        <svg
          className="communities-map__route"
          viewBox={viewBox}
          aria-hidden="true"
          focusable="false"
        >
          <path className="stage-route__trace" d={route} />
          {/* A new key draws the ink again whenever another name is chosen. */}
          <path key={lit} className="stage-route__ink" d={route} pathLength={1} />
        </svg>
      ) : null}
      <ul className="communities-map__names" aria-label="المجتمعات">
        {field.stations.map((station) => (
          <li
            key={station.slug}
            style={{ '--at-right': station.right, '--at-top': station.top } as CSSProperties}
          >
            <Link
              className="communities-map__name"
              href={`/communities/${station.slug}`}
              data-lit={station.slug === lit ? '' : undefined}
              onMouseEnter={() => light(station.slug)}
              onFocus={() => light(station.slug)}
            >
              {names[station.slug]}
              <Diamond className="stage-hero__stop" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * «اكتشف مجتمعات مختلف» (D-24): the stage is a map whose stations are the
 * communities. The first one's route is drawn; pointing at or focusing another
 * name draws the way to it.
 */
export function CommunitiesMap({
  wide,
  phone,
  names,
  lede,
}: {
  wide: MapField;
  phone: MapField;
  names: Record<string, string>;
  lede: string;
}) {
  const [lit, light] = useState(wide.stations[0]?.slug ?? '');
  return (
    <section className="communities-map" aria-labelledby="communities-title">
      <div className="communities-map__head">
        {/* Every route leaves this full stop, as the home's leaves its headline. */}
        <h1 id="communities-title" className="stage-statement communities-map__title">
          اكتشف مجتمعات مختلف
          <Diamond className="stage-hero__stop" />
        </h1>
        <p className="communities-map__lede">{lede}</p>
      </div>
      <Field field={wide} variant="wide" names={names} lit={lit} light={light} />
      <Field field={phone} variant="phone" names={names} lit={lit} light={light} />
    </section>
  );
}
