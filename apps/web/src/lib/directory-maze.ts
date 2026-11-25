import { COMMUNITY_NAME_EM } from './home-maze';
import { centers, dotPath, makeMaze, routePath, wallPath, type Cell } from './maze';

/**
 * The programme directory (D-24): every community opens its programmes with a
 * small night stage where a route enters from the top and arrives at the
 * community's name, the way its own page opens. Two compositions: a square
 * tile in the directory's grid, and a band above a phone's rail. Sizes are
 * design pixels of the drawing, which scales with its box.
 */
export interface TilePlan {
  size: number;
  cols: number;
  rows: number;
  /** The name's size. */
  font: number;
  /** From the drawing's right edge to the name's. */
  pad: number;
  /** The row the name sits on. */
  nameRow: number;
}

export const TILE_WIDE: TilePlan = { size: 304, cols: 9, rows: 9, font: 28, pad: 22, nameRow: 7 };
export const TILE_PHONE: TilePlan = { size: 350, cols: 13, rows: 7, font: 26, pad: 20, nameRow: 5 };

/**
 * Seeds found by `findTileSeed`, each searched from its own start so no two
 * communities share a drawing (maze.test.ts checks every one against the rule).
 */
const SEEDS: Record<string, { wide: number; phone: number }> = {
  idhaa: { wide: 101, phone: 109 },
  riyadi: { wide: 202, phone: 204 },
  tayyar: { wide: 308, phone: 306 },
  jinai: { wide: 405, phone: 415 },
  nafsi: { wide: 505, phone: 507 },
  tarbawi: { wide: 606, phone: 607 },
  thakali: { wide: 710, phone: 712 },
  comedian: { wide: 808, phone: 822 },
  mohandis: { wide: 910, phone: 909 },
};

/** A name without a measured width gets an estimate, as on the community page. */
const nameEm = (slug: string, name: string) =>
  COMMUNITY_NAME_EM[slug] ?? 0.62 * Array.from(name).length;

function geometry(plan: TilePlan, em: number) {
  const pitch = plan.size / plan.cols;
  const right = plan.size - plan.pad;
  const left = right - em * plan.font;
  const nameFrom = Math.floor(left / pitch);
  return {
    pitch,
    left,
    nameFrom,
    entrance: Math.floor(plan.cols / 2),
    last: [nameFrom - 1, plan.nameRow] as Cell,
    blocked: (c: number, r: number) => r >= plan.nameRow - 1 && c >= nameFrom,
  };
}

/**
 * The rule a tile's route keeps: a real walk through the maze (neither a
 * straight drop nor a tour of every corridor) that stays off the name's row
 * until it arrives.
 */
export function tileRouteIsGood(plan: TilePlan, cells: readonly Cell[]) {
  return (
    cells.length >= plan.cols + 2 &&
    cells.length <= plan.cols * 2.6 &&
    !cells.slice(0, -2).some(([, row]) => row === plan.nameRow)
  );
}

function build(plan: TilePlan, em: number, seed: number) {
  const g = geometry(plan, em);
  const maze = makeMaze({
    cols: plan.cols,
    rows: plan.rows,
    seed,
    blocked: g.blocked,
    braid: 0.08,
    start: [g.entrance, 0],
  });
  return { g, maze, cells: maze.route([g.entrance, 0], g.last) };
}

/** The first seed from `from` whose route keeps the rule. */
export function findTileSeed(plan: TilePlan, em: number, from = 1) {
  for (let seed = from; seed < from + 4000; seed++) {
    try {
      if (tileRouteIsGood(plan, build(plan, em, seed).cells)) return seed;
    } catch {
      // The name's area cut the maze in two for this seed; try the next.
    }
  }
  throw new Error('No directory tile seed keeps the rule');
}

export interface CommunityTileDrawing {
  width: number;
  height: number;
  walls: string;
  route: string;
  /** The full stop's centre from the top, as a share of the height. */
  stopTop: number;
  /** The name's right edge from the drawing's right edge, as a share of the width. */
  nameRight: number;
  /** The name's size, as a share of the width. */
  nameSize: number;
  /** Kept for the tests. */
  cells: Cell[];
}

export function communityTile(
  community: { slug: string; name: string },
  variant: 'wide' | 'phone',
): CommunityTileDrawing {
  const plan = variant === 'wide' ? TILE_WIDE : TILE_PHONE;
  const em = nameEm(community.slug, community.name);
  const seed = SEEDS[community.slug]?.[variant] ?? findTileSeed(plan, em);
  const { g, maze, cells } = build(plan, em, seed);
  const { runs, dots } = maze.walls([[g.entrance, 0, 'top']]);
  const height = plan.rows * g.pitch;
  const stopY = (plan.nameRow + 0.5) * g.pitch;
  return {
    width: plan.size,
    height,
    walls: wallPath(runs, g.pitch) + dotPath(dots, g.pitch),
    route: routePath(
      [
        [g.entrance + 0.5, -0.3],
        ...centers(cells),
        [(g.left + 0.11 * plan.font) / g.pitch, plan.nameRow + 0.5],
      ],
      g.pitch,
    ),
    stopTop: stopY / height,
    nameRight: plan.pad / plan.size,
    nameSize: plan.font / plan.size,
    cells,
  };
}
