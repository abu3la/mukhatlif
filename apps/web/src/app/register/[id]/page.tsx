import { Registration } from '../../../components/registration/form';
export const metadata = { title: 'التسجيل', robots: { index: false, follow: false } };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Registration id={id} />;
}
