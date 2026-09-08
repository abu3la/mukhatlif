import { LoadingRegion, RowSkeletonList } from '@/components/states';

export default function Loading() {
  return (
    <div className="content-page">
      <div className="content-container loading-page">
        <LoadingRegion label="تحميل الحلقات…" />
        <RowSkeletonList />
      </div>
    </div>
  );
}
