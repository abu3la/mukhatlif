/**
 * The station's broadcast trace.
 *
 * This is the site's one bespoke mark and it recurs at three scales: beside the
 * wordmark, on the hero station line, and as the premium marker on a row. The
 * bars are always painted at a resting height and only animate between heights,
 * so the mark is never invisible when motion is unavailable or reduced.
 */
export function Signal({ className }: { className?: string }) {
  return (
    <span className={className ? `signal ${className}` : 'signal'} aria-hidden="true">
      <span className="signal__bar" />
      <span className="signal__bar" />
      <span className="signal__bar" />
      <span className="signal__bar" />
      <span className="signal__bar" />
    </span>
  );
}
