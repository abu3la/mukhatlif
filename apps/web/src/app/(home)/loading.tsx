import { SkeletonSection, StageSkeleton } from '@/components/content-skeleton';

/** The home: the hero's stage at its own height, then the programmes on the sheet. */
export default function Loading() {
  return (
    <StageSkeleton label="التحميل…" hero>
      <SkeletonSection shape="square" count={4} />
    </StageSkeleton>
  );
}
