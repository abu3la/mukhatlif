import { CardSkeletonGrid, LoadingRegion } from '@/components/states';

export default function Loading() {
  return (
    <div className="content-page">
      <div className="content-container loading-page">
        <LoadingRegion label="جارٍ تحميل البرامج…" />
        <CardSkeletonGrid />
      </div>
    </div>
  );
}
