import { describe, expect, it } from 'vitest';
import { coverRoute, coverStops } from '@/components/course-cover';
import { BRIEF_PHONE, BRIEF_WIDE, briefBlocked, briefDrawing } from './brief-maze';
import { COMMUNITIES } from './communities';
import {
  TILE_PHONE,
  TILE_WIDE,
  communityTile,
  findTileSeed,
  tileRouteIsGood,
} from './directory-maze';
import { COMMUNITY_NAME_EM } from './home-maze';
import { MAP_TITLE_EM, phoneMap, wideMap } from './map-maze';
import type { Cell } from './maze';

const adjacent = (a: Cell, b: Cell) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;
const walks = (cells: readonly Cell[]) =>
  cells.every((cell, i) => !i || adjacent(cells[i - 1], cell));

describe('the programme directory tiles', () => {
  const withProgrammes = COMMUNITIES.filter((community) => community.programmes.length);

  it('gives every community its own drawing, in both compositions, by the rule', () => {
    for (const [plan, variant] of [
      [TILE_WIDE, 'wide'],
      [TILE_PHONE, 'phone'],
    ] as const) {
      const walls = new Set<string>();
      for (const community of withProgrammes) {
        const tile = communityTile(community, variant);
        expect(tileRouteIsGood(plan, tile.cells), `${community.slug} ${variant}`).toBe(true);
        expect(walks(tile.cells)).toBe(true);
        // The route starts at the entrance on the top row and ends beside the name.
        expect(tile.cells[0]).toEqual([Math.floor(plan.cols / 2), 0]);
        expect(tile.cells.at(-1)?.[1]).toBe(plan.nameRow);
        walls.add(tile.walls);
      }
      expect(walls.size).toBe(withProgrammes.length);
    }
  });

  it('finds a drawing for a community that has no pinned seed', () => {
    const em = COMMUNITY_NAME_EM.mohandis;
    expect(findTileSeed(TILE_WIDE, em)).toBeGreaterThan(0);
    expect(findTileSeed(TILE_PHONE, em)).toBeGreaterThan(0);
  });
});

describe('the communities map', () => {
  it('routes every name through the wide frame, clear of the title and the names', () => {
    const map = wideMap(COMMUNITIES);
    expect(map.stations.map((station) => station.slug)).toEqual(
      COMMUNITIES.map((community) => community.slug),
    );
    const [from, to] = map.frameCols;
    for (const station of map.stations) {
      expect(station.cells.length).toBeGreaterThanOrEqual(8);
      expect(station.cells.length).toBeLessThanOrEqual(70);
      expect(walks(station.cells)).toBe(true);
      expect(station.cells.every(([c, r]) => map.open(c, r) && c >= from && c <= to)).toBe(true);
      // Nothing runs where the title stands (rows 2 to 7, frame columns 13 and on).
      expect(station.cells.some(([c, r]) => r >= 2 && r <= 7 && c - from >= 13)).toBe(false);
      expect(station.cells.at(-1)).toEqual([station.nameFrom - 1, station.row]);
      // Every route leaves the title's full stop and enters the maze on row 4.
      expect(station.cells[0]).toEqual([from + 12, 4]);
      expect(
        station.route.startsWith(
          `M${+(1375.2 - MAP_TITLE_EM * 64 + 7.04 + from * 48).toFixed(1)} 216`,
        ),
      ).toBe(true);
    }
  });

  it('keeps the phone routes in the maze beside the names', () => {
    const map = phoneMap(COMMUNITIES);
    const [from, to] = map.frameCols;
    for (const station of map.stations) {
      expect(station.cells.length).toBeGreaterThanOrEqual(4);
      expect(station.cells.length).toBeLessThanOrEqual(60);
      expect(walks(station.cells)).toBe(true);
      expect(station.cells.every(([c, r]) => map.open(c, r) && c >= from && c <= to)).toBe(true);
      expect(station.cells.at(-1)).toEqual([to, station.row]);
    }
  });
});

describe('the production chooser', () => {
  for (const plan of [BRIEF_WIDE, BRIEF_PHONE]) {
    it(`walks the maze from each form to the button (${plan.frameWidth})`, () => {
      const drawing = briefDrawing(plan);
      const edge = plan.bleed + plan.edge;
      const blocked = briefBlocked(plan);
      expect(drawing.routes).toHaveLength(3);
      drawing.cells.forEach((cells, i) => {
        const drop = plan.buttonRow - plan.formRows[i];
        expect(cells.length).toBeGreaterThanOrEqual(drop + 8);
        expect(cells.length).toBeLessThanOrEqual(plan.buttonRow - plan.formRows[0] + 34);
        expect(walks(cells)).toBe(true);
        // Inside the frame's maze, never down its edge for long, never in the forms' band.
        expect(cells.every(([c, r]) => c >= plan.bleed && c <= edge && !blocked(c, r))).toBe(true);
        expect(cells.filter(([c]) => c === edge).length).toBeLessThanOrEqual(6);
        expect(cells[0]).toEqual([edge, plan.formRows[i]]);
        expect(cells.at(-1)).toEqual([edge, plan.buttonRow]);
      });
    });
  }
});

describe('a course cover', () => {
  it('has one stop per lesson and a route that enters from the right edge', () => {
    expect(coverStops(0)).toEqual([]);
    expect(coverStops(1)).toHaveLength(1);
    for (const count of [2, 3, 5, 6, 12]) {
      const stops = coverStops(count);
      expect(stops).toHaveLength(count);
      // Right to left, inside the cover.
      expect(stops.every(([x], i) => x > 0 && x < 1000 && (!i || x < stops[i - 1][0]))).toBe(true);
      expect(coverRoute(stops).startsWith('M1040 ')).toBe(true);
    }
  });
});
