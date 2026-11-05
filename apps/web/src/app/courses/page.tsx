import { CourseCatalog } from '@/components/courses/catalog';
export const metadata = { title: 'أكاديمية مختلف', alternates: { canonical: '/courses' } };
export default function CoursesPage() {
  return <CourseCatalog />;
}
