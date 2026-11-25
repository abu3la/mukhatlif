/**
 * A maze drawn in the language of Mukhtalif's own pattern: rounded-cap wall
 * segments on a square grid, with single posts left as dots. Routes are real
 * paths through the corridors (breadth-first search), so a drawn route never
 * crosses a wall. Everything is deterministic for a given seed, so the server
 * renders the same picture on every request (D-24).
 */

export type Cell = readonly [col: number, row: number];
export type Side = 'top' | 'bottom' | 'left' | 'right';
/** An opening in the outer wall: the cell beside it and the side it opens on. */
export type Exit = readonly [col: number, row: number, side: Side];
/** A straight wall: horizontal on grid line `line` from `from` to `to`, or vertical. */
export type WallRun = readonly [orientation: 'h' | 'v', line: number, from: number, to: number];

export interface MazeOptions {
  cols: number;
  rows: number;
  seed: number;
  /** Cells kept empty (no walls, no corridors), e.g. where text sits. */
  blocked?: (col: number, row: number) => boolean;
  /** Share of interior walls knocked out after carving; leaves loops, short pieces and dots. */
  braid?: number;
  /** Carving starts here, so the route's first cell is in the main component. */
  start: Cell;
}

export interface Maze {
  open: (col: number, row: number) => boolean;
  route: (from: Cell, to: Cell) => Cell[];
  walls: (exits?: readonly Exit[]) => { runs: WallRun[]; dots: Cell[] };
}

const DIRECTIONS: readonly Cell[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function makeMaze({
  cols,
  rows,
  seed,
  blocked = () => false,
  braid = 0.08,
  start,
}: MazeOptions): Maze {
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const open = (c: number, r: number) => c >= 0 && r >= 0 && c < cols && r < rows && !blocked(c, r);
  const key = (c: number, r: number) => `${c},${r}`;
  const edge = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const passages = new Set<string>();
  const seen = new Set<string>();

  // Carve every open component with an iterative randomised depth-first search.
  const origins: Cell[] = [
    start,
    ...Array.from({ length: cols * rows }, (_, i) => [i % cols, Math.floor(i / cols)] as const),
  ];
  for (const [sc, sr] of origins) {
    if (!open(sc, sr) || seen.has(key(sc, sr))) continue;
    const stack: Cell[] = [[sc, sr]];
    seen.add(key(sc, sr));
    while (stack.length) {
      const [c, r] = stack[stack.length - 1];
      const next = DIRECTIONS.map(([dc, dr]) => [c + dc, r + dr] as const).filter(
        ([x, y]) => open(x, y) && !seen.has(key(x, y)),
      );
      if (!next.length) {
        stack.pop();
        continue;
      }
      const [nc, nr] = next[Math.floor(random() * next.length)];
      passages.add(edge(key(c, r), key(nc, nr)));
      seen.add(key(nc, nr));
      stack.push([nc, nr]);
    }
  }

  // Braid: knock out a share of the interior walls.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!open(c, r)) continue;
      for (const [dc, dr] of [
        [1, 0],
        [0, 1],
      ] as const) {
        const x = c + dc;
        const y = r + dr;
        if (open(x, y) && !passages.has(edge(key(c, r), key(x, y))) && random() < braid) {
          passages.add(edge(key(c, r), key(x, y)));
        }
      }
    }
  }
  const connected = (a: Cell, b: Cell) => passages.has(edge(key(a[0], a[1]), key(b[0], b[1])));

  function route(from: Cell, to: Cell): Cell[] {
    const previous = new Map<string, Cell | null>([[key(from[0], from[1]), null]]);
    const queue: Cell[] = [from];
    while (queue.length) {
      const current = queue.shift()!;
      if (current[0] === to[0] && current[1] === to[1]) break;
      for (const [dc, dr] of DIRECTIONS) {
        const next: Cell = [current[0] + dc, current[1] + dr];
        if (
          !open(next[0], next[1]) ||
          previous.has(key(next[0], next[1])) ||
          !connected(current, next)
        )
          continue;
        previous.set(key(next[0], next[1]), current);
        queue.push(next);
      }
    }
    if (!previous.has(key(to[0], to[1]))) throw new Error(`No route from ${from} to ${to}`);
    const cells: Cell[] = [];
    for (let cell: Cell | null | undefined = to; cell; cell = previous.get(key(cell[0], cell[1])))
      cells.unshift(cell);
    return cells;
  }

  function walls(exits: readonly Exit[] = []) {
    const isExit = (c: number, r: number, side: Side) =>
      exits.some((exit) => exit[0] === c && exit[1] === r && exit[2] === side);
    const horizontal = new Map<number, number[]>();
    const vertical = new Map<number, number[]>();
    const add = (map: Map<number, number[]>, line: number, at: number) => {
      const list = map.get(line) ?? [];
      list.push(at);
      map.set(line, list);
    };
    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c < cols; c++) {
        const above: Cell = [c, r - 1];
        const below: Cell = [c, r];
        const openAbove = open(...above);
        const openBelow = open(...below);
        if (openAbove && openBelow) {
          if (!connected(above, below)) add(horizontal, r, c);
        } else if (openAbove && r === rows) {
          if (!isExit(c, r - 1, 'bottom')) add(horizontal, r, c);
        } else if (openBelow && r === 0) {
          if (!isExit(c, r, 'top')) add(horizontal, r, c);
        }
      }
    }
    for (let c = 0; c <= cols; c++) {
      for (let r = 0; r < rows; r++) {
        const before: Cell = [c - 1, r];
        const after: Cell = [c, r];
        const openBefore = open(...before);
        const openAfter = open(...after);
        if (openBefore && openAfter) {
          if (!connected(before, after)) add(vertical, c, r);
        } else if (openBefore && c === cols) {
          if (!isExit(c - 1, r, 'right')) add(vertical, c, r);
        } else if (openAfter && c === 0) {
          if (!isExit(c, r, 'left')) add(vertical, c, r);
        }
      }
    }
    // Merge neighbouring unit walls on a line into one run.
    const runs: WallRun[] = [];
    const merge = (orientation: 'h' | 'v', map: Map<number, number[]>) => {
      for (const [line, list] of map) {
        list.sort((a, b) => a - b);
        let from = list[0];
        let to = list[0] + 1;
        for (const at of list.slice(1)) {
          if (at === to) to++;
          else {
            runs.push([orientation, line, from, to]);
            from = at;
            to = at + 1;
          }
        }
        runs.push([orientation, line, from, to]);
      }
    };
    merge('h', horizontal);
    merge('v', vertical);
    // Posts that no wall touches become dots, unless they border a blocked cell.
    const touched = new Set<string>();
    for (const [orientation, line, from, to] of runs) {
      for (let i = from; i <= to; i++)
        touched.add(orientation === 'h' ? key(i, line) : key(line, i));
    }
    const dots: Cell[] = [];
    for (let y = 1; y < rows; y++) {
      for (let x = 1; x < cols; x++) {
        if (touched.has(key(x, y))) continue;
        if (!open(x - 1, y - 1) || !open(x, y - 1) || !open(x - 1, y) || !open(x, y)) continue;
        dots.push([x, y]);
      }
    }
    return { runs, dots };
  }

  return { open, route, walls };
}

const fixed = (n: number) => +n.toFixed(1);

/** SVG path data for wall runs, in pixels. */
export function wallPath(runs: readonly WallRun[], pitch: number, ox = 0, oy = 0): string {
  return runs
    .map(([orientation, line, from, to]) =>
      orientation === 'h'
        ? `M${fixed(ox + from * pitch)} ${fixed(oy + line * pitch)}H${fixed(ox + to * pitch)}`
        : `M${fixed(ox + line * pitch)} ${fixed(oy + from * pitch)}V${fixed(oy + to * pitch)}`,
    )
    .join('');
}

/** A zero-length subpath with round caps renders as a dot. */
export function dotPath(dots: readonly Cell[], pitch: number, ox = 0, oy = 0): string {
  return dots.map(([x, y]) => `M${fixed(ox + x * pitch)} ${fixed(oy + y * pitch)}h0`).join('');
}

/** Points are in cell units (a cell's centre is i + 0.5); collinear points are dropped. */
export function routePath(
  points: readonly (readonly [number, number])[],
  pitch: number,
  ox = 0,
  oy = 0,
): string {
  const kept = points.filter((point, i, all) => {
    if (i === 0 || i === all.length - 1) return true;
    const [x0, y0] = all[i - 1];
    const [x1, y1] = point;
    const [x2, y2] = all[i + 1];
    return !((x0 === x1 && x1 === x2) || (y0 === y1 && y1 === y2));
  });
  return kept
    .map(([x, y], i) => `${i ? 'L' : 'M'}${fixed(ox + x * pitch)} ${fixed(oy + y * pitch)}`)
    .join('');
}

export const centers = (cells: readonly Cell[]) =>
  cells.map(([c, r]) => [c + 0.5, r + 0.5] as const);
