import { describe, expect, it } from 'vitest';
import { COMMUNITIES } from './communities';
import { HERO_PHONE, HERO_WIDE, PICKER } from './home-maze';
import { makeMaze, routePath, wallPath, type Cell } from './maze';

const adjacent = (a: Cell, b: Cell) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;

describe('the maze', () => {
  it('is the same drawing for the same seed', () => {
    const options = { cols: 12, rows: 9, seed: 42, start: [0, 0] as const };
    expect(makeMaze(options).walls()).toEqual(makeMaze(options).walls());
    expect(makeMaze({ ...options, seed: 43 }).walls()).not.toEqual(makeMaze(options).walls());
  });

  it('routes through corridors only, one step at a time, never into a blocked cell', () => {
    const blocked = (c: number, r: number) => c >= 4 && c <= 7 && r >= 3 && r <= 5;
    const maze = makeMaze({ cols: 12, rows: 9, seed: 5, blocked, start: [0, 0] });
    const cells = maze.route([0, 0], [11, 8]);
    expect(cells[0]).toEqual([0, 0]);
    expect(cells.at(-1)).toEqual([11, 8]);
    for (let i = 1; i < cells.length; i++) expect(adjacent(cells[i - 1], cells[i])).toBe(true);
    expect(cells.some(([c, r]) => blocked(c, r))).toBe(false);
  });

  it('leaves an opening exactly where an exit is asked for', () => {
    const maze = makeMaze({ cols: 6, rows: 4, seed: 1, start: [0, 0] });
    const closed = maze.walls().runs;
    const opened = maze.walls([[3, 3, 'bottom']]).runs;
    const coversBottom = (runs: typeof closed) =>
      runs.some(([o, line, from, to]) => o === 'h' && line === 4 && from <= 3 && to >= 4);
    expect(coversBottom(closed)).toBe(true);
    expect(coversBottom(opened)).toBe(false);
  });

  it('writes compact SVG path data', () => {
    expect(wallPath([['h', 2, 1, 4]], 10)).toBe('M10 20H40');
    expect(wallPath([['v', 3, 0, 2]], 10, 5, 5)).toBe('M35 5V25');
    // The middle point of a straight run is dropped.
    expect(
      routePath(
        [
          [0, 0],
          [1, 0],
          [2, 0],
          [2, 1],
        ],
        10,
      ),
    ).toBe('M0 0L20 0L20 10');
  });
});

describe('the home pictures', () => {
  for (const [name, hero, rule] of [
    ['wide', HERO_WIDE, ([c, r]: Cell) => r >= 8 && c >= 12 && c <= 29] as const,
    ['phone', HERO_PHONE, ([c, r]: Cell) => r >= 15 && c >= 4 && c <= 18] as const,
  ]) {
    it(`keeps the ${name} hero route below the headline and inside the maze`, () => {
      expect(hero.cells.every(rule)).toBe(true);
      expect(hero.cells.every(([c, r]) => hero.open(c, r))).toBe(true);
      // It leaves through the bottom wall under the centre column.
      const last = hero.cells.at(-1)!;
      expect((last[0] + 0.5) * hero.pitch).toBe(hero.width / 2);
      expect(hero.route.startsWith(`M${hero.stop.x + hero.width / 2} ${hero.stop.y}`)).toBe(true);
    });
  }

  it('draws a route from the centre to every community, and only to them', () => {
    const slugs = PICKER.exits.map((exit) => exit.slug).sort();
    expect(slugs).toEqual(COMMUNITIES.map((community) => community.slug).sort());
    for (const exit of PICKER.exits) {
      const target: Cell = exit.side === 'right' ? [14, exit.row] : [0, exit.row];
      const cells = PICKER.route(target);
      for (let i = 1; i < cells.length; i++) expect(adjacent(cells[i - 1], cells[i])).toBe(true);
      expect(exit.route.startsWith(`M${PICKER.origin.x} ${PICKER.origin.y}`)).toBe(true);
    }
  });
});

describe('the community heroes', () => {
  it('measures every community name and ends each route inside the name area', async () => {
    const { ARRIVAL_PHONE, ARRIVAL_WIDE, COMMUNITY_NAME_EM, communityHero } =
      await import('./home-maze');
    for (const community of COMMUNITIES) {
      expect(COMMUNITY_NAME_EM[community.slug], community.slug).toBeGreaterThan(0);
      const hero = communityHero(community.slug, community.name);
      for (const [maze, end] of [
        [ARRIVAL_WIDE, hero.ends.wide],
        [ARRIVAL_PHONE, hero.ends.phone],
      ] as const) {
        // The full stop sits past the last corridor cell, inside the cleared area.
        expect(end).toBeGreaterThan(maze.blockedFrom * maze.pitch);
        expect(end).toBeLessThan(maze.width / 2);
      }
      // On phones the whole name fits 330 design pixels.
      expect(COMMUNITY_NAME_EM[community.slug] * hero.sizes.phone).toBeLessThanOrEqual(330);
    }
  });

  it('keeps the arriving routes in their corridors', async () => {
    const { ARRIVAL_PHONE, ARRIVAL_WIDE } = await import('./home-maze');
    expect(ARRIVAL_WIDE.cells.every(([c, r]) => c >= 15 && c <= 44 && (r <= 3 || c <= 17))).toBe(
      true,
    );
    expect(ARRIVAL_PHONE.cells.every(([c, r]) => c >= 9 && (r <= 7 || c === 9))).toBe(true);
    for (const maze of [ARRIVAL_WIDE, ARRIVAL_PHONE]) {
      expect(maze.cells.every(([c, r]) => maze.open(c, r))).toBe(true);
      expect(maze.cells.at(-1)).toEqual(maze.last);
    }
  });
});

describe('the sign-in stage', () => {
  it('arrives above the middle of the form and never runs under it', async () => {
    const { SIGNIN_DRAWINGS, SIGNIN_PHONE, SIGNIN_WIDE } = await import('./auth-maze');
    // The form keeps its size while the drawing scales, so the wide route keeps
    // above it, or right of where it can reach at the narrowest wide layout.
    expect(SIGNIN_WIDE.cells.every(([c, r]) => c >= 17 && c <= 43 && (r <= 3 || c >= 40))).toBe(
      true,
    );
    expect(SIGNIN_PHONE.cells.every(([c]) => c >= 10)).toBe(true);
    for (const maze of [SIGNIN_WIDE, SIGNIN_PHONE]) {
      expect(maze.cells.every(([c, r]) => maze.open(c, r))).toBe(true);
      expect(maze.cells.at(-1)).toEqual(maze.last);
      expect((maze.last[0] + 0.5) * maze.pitch).toBe(maze.width / 2);
    }
    for (let c = 24; c <= 34; c++)
      for (let r = 4; r < 19; r++) expect(SIGNIN_WIDE.open(c, r)).toBe(false);
    expect(
      SIGNIN_DRAWINGS.wide.route.endsWith(`${SIGNIN_WIDE.width / 2} ${SIGNIN_WIDE.stopY}`),
    ).toBe(true);
    expect(
      SIGNIN_DRAWINGS.phone.route.endsWith(`${SIGNIN_PHONE.width / 2} ${SIGNIN_PHONE.stopY}`),
    ).toBe(true);
  });
});
