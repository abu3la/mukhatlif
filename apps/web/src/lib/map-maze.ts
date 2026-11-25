import { COMMUNITY_NAME_EM } from './home-maze';
import { centers, dotPath, makeMaze, routePath, wallPath, type Cell } from './maze';

/**
 * «اكتشف مجتمعات مختلف» (D-24): the stage is a map. The communities are
 * stations in one maze, a route from its entrance arrives at each name's full
 * stop, and the page draws the one being pointed at. Both compositions bleed
 * past their frame so wider screens see more maze, never an edge; routes keep
 * inside the frame. Seeds are the most direct of those that keep the rules in
 * maze.test.ts (the shortest routes in total).
 */

export interface MapStation {
  slug: string;
  /** The name's right edge from the frame's right edge, and its row's centre, in design pixels. */
  right: number;
  top: number;
  /** The route to this name, in the drawing's coordinates. */
  route: string;
  /** Kept for the tests. */
  cells: Cell[];
  row: number;
  nameFrom: number;
  nameTo: number;
}

export interface MapDrawing {
  pitch: number;
  /** The frame (the composition the names sit in), in design pixels. */
  frameWidth: number;
  height: number;
  /** The whole drawing and where the frame starts in it. */
  width: number;
  frameLeft: number;
  walls: string;
  font: number;
  stations: MapStation[];
  /** Kept for the tests. */
  open: (col: number, row: number) => boolean;
  frameCols: readonly [number, number];
}

const emOf = (community: { slug: string; name: string }) =>
  COMMUNITY_NAME_EM[community.slug] ?? 0.62 * Array.from(community.name).length;

/**
 * Wide: a 1440 frame of 30 columns of 48, with fifteen more columns on each
 * side. The title holds rows 2 to 7 on the right, set at 64 with its full stop
 * on row 4's centre; names at 38 sit at the three starts of the page's columns
 * on rows 9, 14 and 19. Every route leaves the title's full stop, as the
 * home's leaves its headline, and enters the maze on row 4.
 */
/** «اكتشف مجتمعات مختلف» at 1em with its full stop, measured in the browser. */
export const MAP_TITLE_EM = 10.428;

export function wideMap(communities: readonly { slug: string; name: string }[]): MapDrawing {
  const pitch = 48,
    bleed = 15,
    font = 38,
    rows = 22;
  const starts = [1375.2, 938.4, 501.6];
  const nameRows = [9, 14, 19];
  const spots = communities.map((community, i) => {
    const right = starts[i % 3];
    const row = nameRows[Math.floor(i / 3)];
    const left = right - emOf(community) * font;
    return {
      community,
      right,
      row,
      left,
      from: Math.floor(left / pitch),
      to: Math.ceil(right / pitch),
    };
  });
  const blocked = (c: number, r: number) => {
    const f = c - bleed;
    return (
      r <= 1 ||
      (r >= 2 && r <= 7 && f >= 13 && f <= 29) ||
      spots.some((s) => r >= s.row - 1 && r <= s.row + 1 && f >= s.from && f <= s.to)
    );
  };
  const entry: Cell = [12 + bleed, 4];
  const stopX = 1375.2 - MAP_TITLE_EM * 64 + 0.11 * 64;
  const maze = makeMaze({
    cols: 30 + 2 * bleed,
    rows,
    seed: 257,
    blocked,
    braid: 0.06,
    start: entry,
  });
  const { runs, dots } = maze.walls();
  return {
    pitch,
    frameWidth: 1440,
    height: rows * pitch,
    width: (30 + 2 * bleed) * pitch,
    frameLeft: bleed * pitch,
    walls: wallPath(runs, pitch) + dotPath(dots, pitch),
    font,
    stations: spots.map((s) => {
      const cells = maze.route(entry, [s.from - 1 + bleed, s.row]);
      return {
        slug: s.community.slug,
        right: 1440 - s.right,
        top: (s.row + 0.5) * pitch,
        route: routePath(
          [
            [stopX / pitch + bleed, entry[1] + 0.5],
            ...centers(cells),
            [(s.left + 0.11 * font) / pitch + bleed, s.row + 0.5],
          ],
          pitch,
        ),
        cells,
        row: s.row,
        nameFrom: s.from + bleed,
        nameTo: s.to + bleed,
      };
    }),
    open: maze.open,
    frameCols: [bleed, bleed + 29],
  };
}

/**
 * Phones: a 390 frame of 15 columns of 26 that stands at the page's right
 * edge, with 32 more columns to its left for wider screens. The maze keeps to
 * the frame's first seven columns; the names sit to its right at 24, one every
 * third row, and each route leaves the maze on its name's row. The route
 * enters at the top of the maze, under the title.
 */
export function phoneMap(communities: readonly { slug: string; name: string }[]): MapDrawing {
  const pitch = 26,
    bleed = 32,
    font = 24,
    rows = 29,
    nameEdge = 370;
  const entry: Cell = [bleed + 3, 0];
  const spots = communities.map((community, i) => ({
    community,
    row: 2 + 3 * i,
    left: nameEdge - emOf(community) * font,
  }));
  const maze = makeMaze({
    cols: bleed + 15,
    rows,
    seed: 2179,
    blocked: (c) => c - bleed >= 7,
    braid: 0.06,
    start: entry,
  });
  // Blocked cells draw no wall, so every name's row is already open towards it.
  const { runs, dots } = maze.walls([[entry[0], entry[1], 'top']]);
  return {
    pitch,
    frameWidth: 390,
    height: rows * pitch,
    width: (bleed + 15) * pitch,
    frameLeft: bleed * pitch,
    walls: wallPath(runs, pitch) + dotPath(dots, pitch),
    font,
    stations: spots.map((s) => {
      const cells = maze.route(entry, [bleed + 6, s.row]);
      return {
        slug: s.community.slug,
        right: 390 - nameEdge,
        top: (s.row + 0.5) * pitch,
        route: routePath(
          [
            [entry[0] + 0.5, -0.3],
            ...centers(cells),
            [(s.left + 0.11 * font) / pitch + bleed, s.row + 0.5],
          ],
          pitch,
        ),
        cells,
        row: s.row,
        nameFrom: bleed + Math.floor(s.left / pitch),
        nameTo: bleed + 14,
      };
    }),
    open: maze.open,
    frameCols: [bleed, bleed + 6],
  };
}
