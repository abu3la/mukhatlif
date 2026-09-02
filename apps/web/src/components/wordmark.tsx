import { wordmark } from '@mukhtalif/design-tokens';

/**
 * The official مختلف wordmark. Geometry comes from the brand's own SVG through
 * @mukhtalif/design-tokens; the fill is inherited so one mark serves the
 * masthead and the oversized footer signature without a second asset.
 */
export function Wordmark({
  className,
  title = 'مختلف',
  decorative = false,
}: {
  className?: string;
  title?: string;
  decorative?: boolean;
}) {
  return (
    <svg
      className={className}
      viewBox={wordmark.viewBox}
      fill="currentColor"
      role={decorative ? 'presentation' : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : title}
      focusable="false"
    >
      <path d={wordmark.path} />
      {wordmark.rects.map((rect) => (
        <rect
          key={`${rect.x}-${rect.y}`}
          x={rect.x}
          y={rect.y}
          width={rect.size}
          height={rect.size}
          transform={rect.transform}
        />
      ))}
    </svg>
  );
}
