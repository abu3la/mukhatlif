import { CoursePage } from '@/components/courses/course';
export const metadata = { title: 'الدورة' };
export default async function Page({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  return <CoursePage courseId={courseId} />;
}
