import { SkeletonFeature, SkeletonSection, StageSkeleton } from '@/components/content-skeleton';

/** The reading index: the newest cover crossing, its introduction, then the articles. */
export default function Loading() {
  return (
    <StageSkeleton label="تحميل المقالات…" cross>
      <SkeletonFeature />
      <SkeletonSection />
    </StageSkeleton>
  );
}
