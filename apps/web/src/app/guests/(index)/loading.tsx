import { SkeletonSection, StageSkeleton } from '@/components/content-skeleton';

/** The guests: the question's field on the stage, then the guests by name three to a row. */
export default function Loading() {
  return (
    <StageSkeleton label="تحميل مكتبة الضيوف…" field>
      <SkeletonSection shape="names" count={6} />
    </StageSkeleton>
  );
}
