import type { ReactNode } from 'react';

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

/**
 * A page of the presentation site while it loads (D-24): the night stage with
 * placeholders at the size of its title and line, then the sheet with the
 * shapes it will hold, so the page arrives without a jump. `hero` is the home's
 * stage, which is a drawing of a fixed height. One status is announced; every
 * shape is hidden from screen readers.
 */
export function StageSkeleton({
  label,
  crumbs = false,
  lede = true,
  cross = false,
  field = false,
  hero = false,
  children,
}: {
  label: string;
  /** The page's place above its title (a library view, an episode). */
  crumbs?: boolean;
  lede?: boolean;
  /** A picture that will cross from the stage onto the sheet. */
  cross?: boolean;
  /** A search field standing on the stage (search, the guests). */
  field?: boolean;
  hero?: boolean;
  /** The sheet's shapes: SkeletonFeature, SkeletonSection. */
  children?: ReactNode;
}) {
  return (
    <div className={'stage-page stage-skeleton' + (cross ? ' has-cross' : '')} aria-busy="true">
      <span role="status" className="loading-announcement">
        {label}
      </span>
      <div className="stage-scope" aria-hidden="true">
        {hero ? (
          <div className="stage-hero stage-skeleton__hero">
            <span className="skeleton stage-skeleton__hero-title" />
            <span className="skeleton stage-skeleton__hero-lede" />
          </div>
        ) : (
          <div className={'stage-intro' + (field ? ' search-stage' : '')}>
            <div className="content-container stage-head">
              {crumbs ? <span className="skeleton stage-skeleton__crumbs" /> : null}
              <span className="skeleton stage-skeleton__title" />
              {lede ? (
                <>
                  <span className="skeleton stage-skeleton__lede" />
                  <span className="skeleton stage-skeleton__lede stage-skeleton__lede--more" />
                </>
              ) : null}
              {field ? (
                <span className="stage-skeleton__field">
                  <span className="skeleton stage-skeleton__line stage-skeleton__line--short" />
                  <span className="skeleton stage-skeleton__box" />
                </span>
              ) : null}
            </div>
            {cross ? <span className="skeleton stage-cross stage-skeleton__cross" /> : null}
          </div>
        )}
      </div>
      {children ? (
        <div className="home-sheet" aria-hidden="true">
          <div className="home-sheet__surface">{children}</div>
        </div>
      ) : null}
    </div>
  );
}

/** The newest item introduced on the sheet: a line, its title, a line, an action. */
export function SkeletonFeature() {
  return (
    <div className="content-container stage-skeleton__feature">
      <span className="skeleton stage-skeleton__line stage-skeleton__line--short" />
      <span className="skeleton stage-skeleton__heading" />
      <span className="skeleton stage-skeleton__line" />
      <span className="skeleton stage-skeleton__action" />
    </div>
  );
}

/**
 * A section of the sheet: its title, an optional row of covers to choose from
 * with the search under them, then cards three to a row (`wide` for pictures, `square` for covers, `names`
 * for people listed by name and what they do, without a picture).
 */
export function SkeletonSection({
  shape = 'wide',
  count = 3,
  covers = 0,
}: {
  shape?: 'wide' | 'square' | 'names';
  count?: number;
  covers?: number;
}) {
  return (
    <div className="content-container">
      <span className="skeleton stage-skeleton__heading stage-skeleton__heading--section" />
      {covers ? (
        <>
          <div className="stage-skeleton__covers">
            {Array.from({ length: covers }, (_, index) => (
              <span className="stage-skeleton__choice" key={index}>
                <span className="skeleton stage-skeleton__cover" />
                <span className="skeleton stage-skeleton__line stage-skeleton__line--short" />
              </span>
            ))}
          </div>
          <span className="skeleton stage-skeleton__bar" />
        </>
      ) : null}
      <div className={`stage-skeleton__cards stage-skeleton__cards--${shape}`}>
        {Array.from({ length: count }, (_, index) => (
          <div className="stage-skeleton__card" key={index}>
            {shape === 'names' ? (
              <>
                <span className="skeleton stage-skeleton__name" />
                <span className="skeleton stage-skeleton__line" />
                <span className="skeleton stage-skeleton__line stage-skeleton__line--more" />
                <span className="skeleton stage-skeleton__line stage-skeleton__line--short" />
              </>
            ) : (
              <>
                <span className="skeleton stage-skeleton__art" />
                <span className="skeleton stage-skeleton__line" />
                <span className="skeleton stage-skeleton__line stage-skeleton__line--short" />
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
