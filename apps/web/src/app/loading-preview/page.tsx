import { LoadingButtonPreview } from '@/components/loading-button-preview';
import { UploadProgress } from '@/components/upload-progress';
import { notFound } from 'next/navigation';
import { BusyButton } from '@/components/busy-button';
import { ContentSkeleton } from '@/components/content-skeleton';

export default function LoadingPreview() {
  if (process.env.NODE_ENV !== 'development') notFound();

  return (
    <div className="content-page">
      <div className="content-container" style={{ paddingBlock: 40 }}>
        <h1>معاينة التحميل</h1>
        <section className="loading-action-preview">
          <h2>حالات الأزرار</h2>
          <p>معاينة تصميم فقط، لا تُرسل بيانات.</p>
          <div>
            <LoadingButtonPreview />
            <BusyButton className="customer-primary" aria-busy>جار التحقق…</BusyButton>
            <BusyButton className="customer-primary" aria-busy>جار الحفظ…</BusyButton>
            <BusyButton className="customer-primary" disabled>غير متاح</BusyButton>
          </div>
        </section>
        <div style={{ maxWidth: 640, marginBlock: 32 }}>
          <UploadProgress filename="مقدمة الدورة.mp4" bytes={268435456} percent={42} />
        </div>
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
