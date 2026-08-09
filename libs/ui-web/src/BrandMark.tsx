import { wordmark } from '@mukhtalif/design-tokens';

export interface BrandMarkProps {
  /** Rendered height in px; width follows the mark's aspect ratio. */
  height?: number;
  className?: string;
}

/** The official مختلف wordmark. Inherits `currentColor`, so it works on any ground. */
export function BrandMark({ height = 28, className }: BrandMarkProps) {
  return (
    <svg
      viewBox={wordmark.viewBox}
      height={height}
      role="img"
      aria-label="مختلف"
      className={className}
      fill="currentColor"
    >
      <path d={wordmark.path} />
      {wordmark.rects.map((rect, index) => (
        <rect
          key={index}
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
