import { CustomerAuth } from '@/components/customer-auth';
export const metadata = {
  title: 'كلمة مرور جديدة',
  robots: { index: false, follow: false },
  alternates: { canonical: '/reset' },
};
export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <CustomerAuth mode="reset" next={next} />;
}
