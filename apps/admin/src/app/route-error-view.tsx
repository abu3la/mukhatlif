import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom';
import { adminPaths } from '@/application';

export function RouteErrorView() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? error.status === 404
      ? 'لم نجد الصفحة المطلوبة.'
      : 'تعذر فتح الصفحة المطلوبة.'
    : 'تعذر عرض هذه الصفحة. حاول مرة أخرى.';

  return (
    <main className="route-error" dir="rtl">
      <section className="card form-card">
        <h1>تعذر إكمال الطلب</h1>
        <p>{message}</p>
        <Link to={adminPaths.overview} className="back-link">
          → العودة إلى نظرة عامة
        </Link>
      </section>
    </main>
  );
}
