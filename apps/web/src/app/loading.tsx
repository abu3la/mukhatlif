import { SkeletonSection, StageSkeleton } from '@/components/content-skeleton';

/** Any page without its own: the night stage, then a section of cards on the sheet. */
export default function Loading() {
  return (
    <StageSkeleton label="تحميل الصفحة">
      <SkeletonSection />
    </StageSkeleton>
  );
}
