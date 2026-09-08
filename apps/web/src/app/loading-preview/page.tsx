import { notFound } from 'next/navigation';
import { ContentSkeleton } from '@/components/content-skeleton';

export default function LoadingPreview() {
  if (process.env.NODE_ENV !== 'development') notFound();

  return (
    <div className="content-page">
      <div className="content-container" style={{ paddingBlock: 40 }}>
        <h1>معاينة التحميل</h1>
        <section style={{ marginBlock: 40 }}>
          <h2>الحلقات</h2>
          <ContentSkeleton count={3} />
        </section>
        <section style={{ marginBlock: 40 }}>
          <h2>البرامج</h2>
          <ContentSkeleton variant="cards" count={4} />
        </section>
        <section style={{ marginBlock: 40 }}>
          <h2>الحساب</h2>
          <ContentSkeleton variant="account" count={2} />
        </section>
      </div>
    </div>
  );
}
