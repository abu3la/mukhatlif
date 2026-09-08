import { ContentSkeleton } from '@/components/content-skeleton';

export default function Loading() {
  return (
    <div className="content-page">
      <div className="content-container loading-page">
        <ContentSkeleton label="تحميل الصفحة" />
      </div>
    </div>
  );
}
