import { centers, dotPath, makeMaze, routePath, wallPath, type Cell } from './maze';
import { SERVICES } from './site-facts';

/**
 * «الإنتاج» (D-24): the page is the first step of the brief it asks for. The
 * three forms are set large beside a maze; the chosen one's route leaves its
 * full stop, enters the maze through its own row, and arrives at «تابع إلى
 * الطلب». Seeds are the most direct of those that keep the rules in
 * maze.test.ts: each route walks the maze (at least eight cells more than the
 * drop to the button) and never runs down the maze's edge for long.
 */

/** Each form's name at 1em with its full stop, measured in the browser. */
export const FORM_NAME_EM: Record<string, number> = {
  بودكاست: 3.983,
  'سلسلة مرئية': 5.336,
  'قصة علامة': 4.727,
};

export interface BriefPlan {
  pitch: number;
  cols: number;
  rows: number;
  /** Columns left of the frame, kept for wider screens. */
  bleed: number;
  frameWidth: number;
  /** The maze's last frame column. */
  edge: number;
  formRows: readonly number[];
  buttonRow: number;
  /** The forms' and the button's right edge, in frame pixels. */
  right: number;
  font: number;
  buttonWidth: number;
  seed: number;
  /** Rows kept clear at the top, under the header. */
  clearTop: number;
  /** Frame cells kept clear for the title. */
  title?: (frameCol: number, row: number) => boolean;
}

/** A 1440 frame of 30 columns of 48, fifteen more on each side; the forms at 72. */
export const BRIEF_WIDE: BriefPlan = {
  pitch: 48,
  cols: 60,
  rows: 25,
  bleed: 15,
  frameWidth: 1440,
  edge: 17,
  formRows: [9, 13, 17],
  buttonRow: 21,
  right: 1375.2,
  font: 72,
  buttonWidth: 252,
  seed: 694,
  clearTop: 2,
  title: (f, r) => r >= 2 && r <= 6 && f >= 13 && f <= 17,
};

/** Phones: a 390 frame of 15 columns of 26 at the page's right edge, 32 more to its left. */
export const BRIEF_PHONE: BriefPlan = {
  pitch: 26,
  cols: 47,
  rows: 23,
  bleed: 32,
  frameWidth: 390,
  edge: 5,
  formRows: [1, 6, 11],
  buttonRow: 17,
  right: 370,
  font: 36,
  buttonWidth: 200,
  seed: 1313,
  clearTop: 0,
};

export function briefBlocked(plan: BriefPlan) {
  return (c: number, r: number) => {
    const f = c - plan.bleed;
    // The forms' band runs from the maze's edge to the frame's right edge.
    return (
      r < plan.clearTop ||
      (f > plan.edge && f < plan.frameWidth / plan.pitch) ||
      Boolean(plan.title?.(f, r))
    );
  };
}

export interface BriefDrawing {
  plan: BriefPlan;
  width: number;
  height: number;
  frameLeft: number;
  walls: string;
  /** One route per form, in SERVICES order. */
  routes: string[];
  /** Kept for the tests. */
  cells: Cell[][];
}

export function briefDrawing(plan: BriefPlan): BriefDrawing {
  const edge = plan.edge + plan.bleed;
  const maze = makeMaze({
    cols: plan.cols,
    rows: plan.rows,
    seed: plan.seed,
    blocked: briefBlocked(plan),
    braid: 0.06,
    start: [edge, plan.formRows[0]],
  });
  const { runs, dots } = maze.walls();
  const cells = plan.formRows.map((row) => maze.route([edge, row], [edge, plan.buttonRow]));
  const frameLeft = plan.bleed * plan.pitch;
  return {
    plan,
    width: plan.cols * plan.pitch,
    height: plan.rows * plan.pitch,
    frameLeft,
    walls: wallPath(runs, plan.pitch) + dotPath(dots, plan.pitch),
    routes: SERVICES.map(([name], i) => {
      const stop = plan.right - (FORM_NAME_EM[name] ?? 0.62 * name.length) * plan.font;
      return routePath(
        [
          [(frameLeft + stop + 0.11 * plan.font) / plan.pitch, plan.formRows[i] + 0.5],
          ...centers(cells[i]),
          [(frameLeft + plan.right - plan.buttonWidth) / plan.pitch, plan.buttonRow + 0.5],
        ],
        plan.pitch,
      );
    }),
    cells,
  };
}
