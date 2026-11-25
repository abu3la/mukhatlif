/** The brand's full stop: a diamond, drawn in the text colour. */
export function Diamond({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 10 10" aria-hidden="true" focusable="false">
      <path d="M5 0 10 5 5 10 0 5Z" />
    </svg>
  );
}

export interface MazeDrawingData {
  width: number;
  height: number;
  walls: string;
  route: string;
}

/**
 * One composition of a maze stage (D-24): the walls, then the route's faint
 * trace and the ink that draws itself over it once.
 */
export function MazeDrawing({
  maze,
  variant,
}: {
  maze: MazeDrawingData;
  variant: 'wide' | 'phone';
}) {
  const viewBox = `0 0 ${maze.width} ${maze.height}`;
  return (
    <div className={`stage-hero__maze stage-hero__maze--${variant}`} aria-hidden="true">
      <svg className="stage-hero__walls" viewBox={viewBox} focusable="false">
        <path d={maze.walls} />
      </svg>
      {/* The trace is always there; the ink draws over it once. */}
      <svg className="stage-hero__route" viewBox={viewBox} focusable="false">
        <path className="stage-route__trace" d={maze.route} />
        <path className="stage-route__ink" d={maze.route} pathLength={1} />
      </svg>
    </div>
  );
}
