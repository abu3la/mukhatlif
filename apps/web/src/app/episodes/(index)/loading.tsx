import { LoadingRegion, RowSkeletonList } from '@/components/states';

export default function Loading() {
  return (
    <div className="shell section">
      <LoadingRegion label="جارٍ تحميل الحلقات…" />
      <RowSkeletonList />
    </div>
  );
}
