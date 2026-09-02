import { Link } from 'react-router-dom';
import { adminPaths } from '@/application';

export function NotFoundView() {
  return (
    <section className="card form-card">
      <h1>الصفحة غير موجودة</h1>
      <p className="empty-state">لم نجد الصفحة المطلوبة.</p>
      <Link to={adminPaths.overview} className="back-link">
        → العودة إلى نظرة عامة
      </Link>
    </section>
  );
}
