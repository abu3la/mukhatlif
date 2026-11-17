import type { Metadata } from 'next';
import { CoursePage } from '@/components/courses/course';

type Params = { params: Promise<{ courseId: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { courseId } = await params;
  return { title: 'الدورة', alternates: { canonical: `/courses/${encodeURIComponent(courseId)}` } };
}

export default async function Page({ params }: Params) {
  const { courseId } = await params;
  return <CoursePage courseId={courseId} />;
}
