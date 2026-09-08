/** Visual placeholders only; the live status remains available to screen readers. */
export function ContentSkeleton({
  label = 'تحميل المحتوى',
  variant = 'rows',
  count = 3,
}: {
  label?: string;
  variant?: 'rows' | 'cards' | 'account';
  count?: number;
}) {
  return (
    <div className={`content-skeleton content-skeleton--${variant}`} aria-busy="true">
      <span role="status" className="loading-announcement">
        {label}
      </span>
      <div className="content-skeleton__items" aria-hidden="true">
        {Array.from({ length: count }, (_, index) => (
          <div className="content-skeleton__item" key={index}>
            {variant !== 'account' && <div className="skeleton content-skeleton__image" />}
            <div className="content-skeleton__copy">
              <div className="skeleton content-skeleton__line" />
              <div className="skeleton content-skeleton__line content-skeleton__line--short" />
              {variant === 'account' && <div className="skeleton content-skeleton__field" />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
