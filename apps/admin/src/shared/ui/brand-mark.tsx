import { wordmark } from '@mukhtalif/design-tokens';

interface BrandMarkProps {
  height?: number;
  className?: string;
}

export function BrandMark({ height = 24, className }: BrandMarkProps) {
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
