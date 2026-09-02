import { CardSkeletonGrid, LoadingRegion } from '@/components/states';

export default function Loading() {
  return (
    <div className="content-page">
      <div className="content-container loading-page">
        <LoadingRegion label="جارٍ التحميل…" />
        <CardSkeletonGrid />
      </div>
    </div>
  );
}
