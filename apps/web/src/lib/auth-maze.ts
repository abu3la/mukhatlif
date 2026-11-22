import { arrival } from './arrival-maze';

/**
 * The sign-in stage (D-24): the route that runs through the site arrives at
 * the form. It enters where every arrival does and ends at the diamond just
 * above the form's centre (phones: above the sheet that carries the form).
 * The form covers columns 24 to 34 from row 4, so no wall runs under it; the
 * form keeps its size while the drawing scales, so the wide route stays above
 * row 4 or right of column 39, clear of the form down to 821px. Seeds were
 * chosen by eye from the ones that keep to these rules (see maze.test.ts).
 */
export const SIGNIN_WIDE = arrival({
  pitch: 48,
  cols: 59,
  rows: 19,
  height: 912,
  seed: 133,
  blocked: (c, r) => r <= 1 || (c >= 24 && c <= 34 && r >= 4),
  entrance: [38, 2, 'top'],
  last: [29, 3],
  first: [38.5, -0.3],
  blockedFrom: 24,
});

export const SIGNIN_PHONE = arrival({
  pitch: 26,
  cols: 33,
  rows: 13,
  height: 338,
  seed: 28,
  blocked: (_column, row) => row <= 2,
  entrance: [32, 4, 'right'],
  last: [16, 12],
  first: [33.3, 4.5],
  blockedFrom: 0,
});

/** Both compositions as drawings, each route ending at its centre. */
export const SIGNIN_DRAWINGS = {
  wide: { ...SIGNIN_WIDE, route: SIGNIN_WIDE.route(SIGNIN_WIDE.width / 2) },
  phone: { ...SIGNIN_PHONE, route: SIGNIN_PHONE.route(SIGNIN_PHONE.width / 2) },
};
