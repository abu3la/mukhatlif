import { MyCourses } from '@/components/courses/my-courses';
export const metadata = { title: 'دوراتي', robots: { index: false, follow: false } };
export default function MyCoursesPage() {
  return <MyCourses />;
}
