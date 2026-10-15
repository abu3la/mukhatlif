import { CourseCatalog } from '@/components/courses/catalog';
export const metadata = { title: 'دوراتي', robots: { index: false, follow: false } };
export default function MyCoursesPage() {
  return <CourseCatalog mine />;
}
