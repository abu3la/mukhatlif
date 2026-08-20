'use client';

import { useEffect } from 'react';

/**
 * Route-level fault boundary. The message shown to the reader is deliberately
 * generic: the underlying error can carry internal detail and is logged rather
 * than rendered.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Route error', error.digest ?? error.message);
  }, [error]);

  return (
    <div className="shell">
      <div className="state state--alert">
        <h1 className="state__title">حدث خطأ غير متوقع</h1>
        <p className="state__text">تعذّر عرض هذه الصفحة. يمكنك المحاولة مرة أخرى.</p>
        <button className="action" type="button" onClick={reset}>
          إعادة المحاولة
        </button>
      </div>
    </div>
  );
}
