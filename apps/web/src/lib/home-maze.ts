import { arrival, type ArrivalMaze } from './arrival-maze';
import { centers, dotPath, makeMaze, routePath, wallPath, type Cell, type Exit } from './maze';

export type { ArrivalMaze } from './arrival-maze';

/**
 * The fixed pictures of the home page (D-24): the hero maze in two
 * compositions and the community picker. Seeds were chosen by eye from the
 * ones whose route meets each layout's rules (see home-maze.test.ts), so the
 * same drawing renders on every request.
 */

export interface HeroMaze {
  /** Grid pitch in design pixels. */
  pitch: number;
  width: number;
  height: number;
  walls: string;
  route: string;
  /** Centre of the headline's diamond, from the composition's centre and top. */
  stop: { x: number; y: number };
  /** Kept for the tests: the route through the corridors, cell by cell. */
  cells: Cell[];
  open: (col: number, row: number) => boolean;
}

interface HeroPlan {
  pitch: number;
  cols: number;
  rows: number;
  /** Section height in design pixels; the last row may be cut by it. */
  height: number;
  seed: number;
  blocked: (col: number, row: number) => boolean;
  /** First corridor cell, beside the diamond. */
  start: Cell;
  /** The opening in the bottom wall, under the centre column. */
  exit: Cell;
  /** The diamond, in cell units (a centre is i + 0.5). */
  stop: readonly [number, number];
  /** How far below the maze the route runs, in cell units, so it meets the next section. */
  tail: number;
}

function hero(plan: HeroPlan): HeroMaze {
  const maze = makeMaze({
    cols: plan.cols,
    rows: plan.rows,
    seed: plan.seed,
    blocked: plan.blocked,
    braid: 0.1,
    start: plan.start,
  });
  const cells = maze.route(plan.start, plan.exit);
  const exits: Exit[] = [[plan.exit[0], plan.exit[1], 'bottom']];
  const { runs, dots } = maze.walls(exits);
  const width = plan.cols * plan.pitch;
  return {
    pitch: plan.pitch,
    width,
    height: plan.height,
    walls: wallPath(runs, plan.pitch) + dotPath(dots, plan.pitch),
    route: routePath([plan.stop, ...centers(cells), [plan.exit[0] + 0.5, plan.tail]], plan.pitch),
    stop: { x: plan.stop[0] * plan.pitch - width / 2, y: plan.stop[1] * plan.pitch },
    cells,
    open: maze.open,
  };
}

/** Desktop and tablet: 59 columns of 48px, wide enough for a 2800px screen. */
export const HERO_WIDE = hero({
  pitch: 48,
  cols: 59,
  rows: 19,
  height: 900,
  seed: 15,
  blocked: (c, r) => r <= 1 || (c >= 18 && c <= 40 && r >= 6 && r <= 11),
  start: [17, 8],
  exit: [29, 18],
  stop: [20.5, 8.5],
  tail: 19.6,
});

/** Phones and portrait tablets: 33 columns of 26px around a 390px composition. */
export const HERO_PHONE = hero({
  pitch: 26,
  cols: 33,
  rows: 27,
  height: 702,
  seed: 7,
  blocked: (c, r) => r <= 1 || (c >= 11 && c <= 21 && r >= 10 && r <= 19),
  start: [10, 15],
  exit: [16, 26],
  stop: [13.5, 15.5],
  tail: 27.7,
});

/** «أي مسار يشبهك؟»: a 15 x 11 maze of 40px inside a 1080 x 520 box. */
const PICK = { pitch: 40, cols: 15, rows: 11, x: 240, y: 40, width: 1080, height: 520 } as const;

export type PickerSide = 'right' | 'left';
export interface PickerExit {
  slug: string;
  side: PickerSide;
  row: number;
  route: string;
  /** Vertical centre of the exit, as a share of the box height. */
  top: number;
}

const PICK_EXITS: readonly [slug: string, side: PickerSide, row: number][] = [
  ['idhaa', 'right', 2],
  ['riyadi', 'right', 4],
  ['mohandis', 'right', 6],
  ['tayyar', 'right', 8],
  ['jinai', 'left', 1],
  ['nafsi', 'left', 3],
  ['tarbawi', 'left', 5],
  ['thakali', 'left', 7],
  ['comedian', 'left', 9],
];

const picker = makeMaze({
  cols: PICK.cols,
  rows: PICK.rows,
  seed: 909,
  braid: 0.06,
  start: [7, 5],
});

export const PICKER = {
  width: PICK.width,
  height: PICK.height,
  /** The maze's left and right edges, as shares of the box width. */
  mazeStart: PICK.x / PICK.width,
  mazeEnd: (PICK.x + PICK.cols * PICK.pitch) / PICK.width,
  walls: (() => {
    const { runs, dots } = picker.walls(
      PICK_EXITS.map(([, side, row]) =>
        side === 'right' ? [PICK.cols - 1, row, 'right'] : [0, row, 'left'],
      ),
    );
    return wallPath(runs, PICK.pitch, PICK.x, PICK.y) + dotPath(dots, PICK.pitch, PICK.x, PICK.y);
  })(),
  /** The diamond everyone starts from, at the maze's centre cell. */
  origin: { x: PICK.x + 7.5 * PICK.pitch, y: PICK.y + 5.5 * PICK.pitch },
  exits: PICK_EXITS.map(([slug, side, row]): PickerExit => {
    const target: Cell = side === 'right' ? [PICK.cols - 1, row] : [0, row];
    const cells = picker.route([7, 5], target);
    const outside = side === 'right' ? PICK.cols + 0.85 : -0.85;
    return {
      slug,
      side,
      row,
      route: routePath(
        [[7.5, 5.5], ...centers(cells).slice(1), [outside, row + 0.5]],
        PICK.pitch,
        PICK.x,
        PICK.y,
      ),
      top: (PICK.y + (row + 0.5) * PICK.pitch) / PICK.height,
    };
  }),
  /** For the tests. */
  route: (to: Cell) => picker.route([7, 5], to),
};

/**
 * Community pages (D-24): the route that left the home headline arrives at the
 * community's name, above it, and ends at its full stop. Only the last point
 * depends on the name, through its measured width, so every name stays centred.
 */
export const ARRIVAL_WIDE = arrival({
  pitch: 48,
  cols: 59,
  rows: 14,
  height: 640,
  seed: 7,
  blocked: (c, r) => r <= 1 || (c >= 18 && c <= 40 && r >= 4 && r <= 11),
  entrance: [38, 2, 'top'],
  last: [17, 6],
  first: [38.5, -0.3],
  blockedFrom: 18,
});

export const ARRIVAL_PHONE = arrival({
  pitch: 26,
  cols: 33,
  rows: 22,
  height: 560,
  seed: 56,
  blocked: (c, r) => r <= 2 || (c >= 10 && c <= 22 && r >= 8 && r <= 19),
  entrance: [32, 4, 'right'],
  last: [9, 11],
  first: [33.3, 4.5],
  blockedFrom: 10,
});

/**
 * Each community's name set at 1em, its full stop included: IBM Plex Sans
 * Arabic bold, measured in the browser. A new community without a width gets
 * an estimate until it is measured (see maze.test.ts).
 */
export const COMMUNITY_NAME_EM: Record<string, number> = {
  idhaa: 5.516,
  riyadi: 5.716,
  mohandis: 6.536,
  tayyar: 5.039,
  jinai: 5.487,
  nafsi: 5.682,
  tarbawi: 5.673,
  thakali: 5.385,
  comedian: 7.028,
};

/** Type sizes (design pixels) and routes of one community's hero. */
export function communityHero(slug: string, name: string) {
  const em = COMMUNITY_NAME_EM[slug] ?? 0.62 * Array.from(name).length;
  // Phones: the name fits 330 design pixels, so the longest one clears the gutter.
  const sizes = { wide: 104, phone: Math.min(54, Math.floor(330 / em)) };
  const end = (maze: ArrivalMaze, size: number) => maze.width / 2 - (em * size) / 2 + 0.11 * size;
  return {
    sizes,
    wide: ARRIVAL_WIDE.route(end(ARRIVAL_WIDE, sizes.wide)),
    phone: ARRIVAL_PHONE.route(end(ARRIVAL_PHONE, sizes.phone)),
    ends: { wide: end(ARRIVAL_WIDE, sizes.wide), phone: end(ARRIVAL_PHONE, sizes.phone) },
  };
}
