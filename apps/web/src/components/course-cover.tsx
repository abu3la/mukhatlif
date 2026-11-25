import type { CSSProperties } from 'react';

/** The cover's own units: 1000 wide, 16:9. */
const W = 1000;
const H = 562.5;
const HIGH = 352;
const LOW = 408;

/**
 * The stops of a course's route, one per lesson, alternating between two
 * heights across the cover's lower half.
 */
export function coverStops(lessons: number) {
  if (lessons < 1) return [];
  if (lessons === 1) return [[W / 2, HIGH] as const];
  const [from, to] = lessons > 5 ? [860, 140] : [770, 254];
  const step = (from - to) / (lessons - 1);
  return Array.from({ length: lessons }, (_, i) => [from - i * step, i % 2 ? LOW : HIGH] as const);
}

/** Enters from the right edge, runs to each stop and steps between them. */
export function coverRoute(stops: readonly (readonly [number, number])[]) {
  if (!stops.length) return '';
  const fixed = (n: number) => +n.toFixed(1);
  let d = `M${W + 40} ${stops[0][1]}H${fixed(stops[0][0])}`;
  for (let i = 1; i < stops.length; i++) {
    const [x0, y0] = stops[i - 1];
    const [x1, y1] = stops[i];
    const middle = fixed((x0 + x1) / 2);
    d += y1 === y0 ? `H${fixed(x1)}` : `H${middle}V${y1}H${fixed(x1)}`;
  }
  return d;
}

/**
 * A course has no artwork of its own, so its cover is drawn from what it is
 * (D-24): its skill, its title, and a route with one stop per lesson; the last
 * stop is the full stop. Large covers name the lessons under their stops when
 * there is room.
 */
export function CourseCover({
  title,
  skill,
  lessons,
  large = false,
}: {
  title: string;
  skill: string;
  /** Lesson titles when known, else their count. */
  lessons: readonly string[] | number;
  large?: boolean;
}) {
  const count = typeof lessons === 'number' ? lessons : lessons.length;
  const stops = coverStops(count);
  const size = count > 10 ? 9 : 12;
  const spacing = stops.length > 1 ? stops[0][0] - stops[1][0] : W;
  const named = large && typeof lessons !== 'number' && count <= 4 ? lessons : [];
  return (
    <span className={'course-cover' + (large ? ' course-cover--large' : '')}>
      <svg
        className="course-cover__route"
        viewBox={`0 0 ${W} ${H}`}
        aria-hidden="true"
        focusable="false"
      >
        <path d={coverRoute(stops)} />
        {stops.map(([x, y], i) => {
          const r = i === stops.length - 1 ? size * 1.35 : size;
          return (
            <path
              key={i}
              className="course-cover__stop"
              d={`M${x} ${y - r}L${x + r} ${y}L${x} ${y + r}L${x - r} ${y}Z`}
            />
          );
        })}
      </svg>
      {skill ? <span className="course-cover__skill">{skill}</span> : null}
      <span className="course-cover__title">{title}</span>
      {named.length ? (
        <span className="course-cover__lessons" aria-hidden="true">
          {named.map((lesson, i) => (
            <span
              key={i}
              className="course-cover__lesson"
              style={
                {
                  '--x': `${((W - stops[i][0]) / W) * 100}%`,
                  '--y': `${((stops[i][1] + 34) / H) * 100}%`,
                  '--w': `${(Math.min(200, spacing * 0.92) / W) * 100}%`,
                } as CSSProperties
              }
            >
              {lesson}
            </span>
          ))}
        </span>
      ) : null}
    </span>
  );
}
