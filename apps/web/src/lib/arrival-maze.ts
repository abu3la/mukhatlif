import { centers, dotPath, makeMaze, routePath, wallPath, type Cell, type Exit } from './maze';

/**
 * A route that arrives (D-24): it enters the maze through the quiet gap between
 * the nav and the logo (phones: from the right edge) and ends at a given point,
 * a community's name or the sign-in form. Building one computes nothing until
 * it is called, so a page loads only the drawings it shows.
 */
export interface ArrivalMaze {
  pitch: number;
  width: number;
  height: number;
  walls: string;
  /** The full stop's centre, from the top, in design pixels. */
  stopY: number;
  /** The route, ending at `endX` design pixels from the drawing's left edge. */
  route: (endX: number) => string;
  /** Kept for the tests. */
  cells: Cell[];
  last: Cell;
  blockedFrom: number;
  open: (col: number, row: number) => boolean;
}

export interface ArrivalPlan {
  pitch: number;
  cols: number;
  rows: number;
  height: number;
  seed: number;
  blocked: (col: number, row: number) => boolean;
  entrance: Exit;
  /** The last corridor cell, beside the name. */
  last: Cell;
  /** Where the route starts, outside the drawing, in cell units. */
  first: readonly [number, number];
  /** First blocked column of the name's area. */
  blockedFrom: number;
}

export function arrival(plan: ArrivalPlan): ArrivalMaze {
  const start: Cell = [plan.entrance[0], plan.entrance[1]];
  const maze = makeMaze({
    cols: plan.cols,
    rows: plan.rows,
    seed: plan.seed,
    blocked: plan.blocked,
    braid: 0.1,
    start,
  });
  const cells = maze.route(start, plan.last);
  const { runs, dots } = maze.walls([plan.entrance]);
  const stopRow = plan.last[1] + 0.5;
  return {
    pitch: plan.pitch,
    width: plan.cols * plan.pitch,
    height: plan.height,
    walls: wallPath(runs, plan.pitch) + dotPath(dots, plan.pitch),
    stopY: stopRow * plan.pitch,
    route: (endX) =>
      routePath([plan.first, ...centers(cells), [endX / plan.pitch, stopRow]], plan.pitch),
    cells,
    last: plan.last,
    blockedFrom: plan.blockedFrom,
    open: maze.open,
  };
}
