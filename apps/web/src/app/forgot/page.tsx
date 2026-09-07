import { CustomerAuth } from '@/components/customer-auth';
export const metadata = {
  title: 'استعادة كلمة المرور',
  robots: { index: false, follow: false },
  alternates: { canonical: '/forgot' },
};
export default async function ForgotPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <CustomerAuth mode="forgot" next={next} />;
}
