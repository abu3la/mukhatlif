import Link from 'next/link';
import { RetryContentButton } from './public-content-controls';

/**
 * The three states every list and detail page must be able to render.
 *
 * They are separate components rather than one with a variant because they mean
 * different things: an empty shelf is normal, an unreachable API is a fault the
 * reader should be told about honestly, and neither should be mistaken for the
 * other.
 */
export function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="state">
      <h2 className="state__title">{title}</h2>
      <p className="state__text">{text}</p>
    </div>
  );
}

export function ErrorState({
  title = 'تعذّر تحميل المحتوى',
  text = 'لم نتمكن من الوصول إلى المحتوى الآن. جرّب التحديث بعد قليل.',
  retryHref,
}: {
  title?: string;
  text?: string;
  retryHref?: string;
}) {
  return (
    <div className="state state--alert">
      <h2 className="state__title">{title}</h2>
      <p className="state__text">{text}</p>
      <RetryContentButton />
      {retryHref ? (
        <Link className="action" href={retryHref}>
          العودة
        </Link>
      ) : null}
    </div>
  );
}

/** Fixed-count placeholder rows used while a route segment streams. */
export function CardSkeletonGrid({
  count = 6,
  variant = 'shows',
}: {
  count?: number;
  variant?: 'shows' | 'articles';
}) {
  return (
    <div className={`grid grid--${variant}`} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="skeleton-card">
          <div className="skeleton skeleton-card__image" />
          <div className="skeleton content-skeleton__line" />
          <div className="skeleton content-skeleton__line content-skeleton__line--short" />
        </div>
      ))}
    </div>
  );
}

export function RowSkeletonList({ count = 6 }: { count?: number }) {
  return (
    <div className="episodes" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="content-skeleton__item" style={{ marginBlock: 24 }}>
          <div className="skeleton content-skeleton__image" />
          <div className="content-skeleton__copy">
            <div className="skeleton content-skeleton__line" />
            <div className="skeleton content-skeleton__line content-skeleton__line--short" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Announces a pending route segment to assistive technology. */
export function LoadingRegion({ label }: { label: string }) {
  return (
    <p role="status" aria-live="polite" className="loading-announcement">
      {label}
    </p>
  );
}
