import { CardSkeletonGrid, LoadingRegion } from '@/components/states';

export default function Loading() {
  return (
    <div className="shell section">
      <LoadingRegion label="جارٍ تحميل البرامج…" />
      <CardSkeletonGrid />
    </div>
  );
}
