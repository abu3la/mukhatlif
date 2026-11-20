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
