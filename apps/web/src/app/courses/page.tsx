import { CourseCatalog } from '@/components/courses/catalog';
export const metadata = { title: 'الدورات', alternates: { canonical: '/courses' } };
export default function CoursesPage() {
  return <CourseCatalog />;
}
