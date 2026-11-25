import { SkeletonFeature, SkeletonSection, StageSkeleton } from '@/components/content-skeleton';

/** «استمع»: the newest still crossing, its introduction, the programmes, then the episodes. */
export default function Loading() {
  return (
    <StageSkeleton label="تحميل الحلقات…" cross>
      <SkeletonFeature />
      <SkeletonSection covers={8} />
    </StageSkeleton>
  );
}
