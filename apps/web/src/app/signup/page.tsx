import { CustomerAuth } from '@/components/customer-auth';
export const metadata = {
  title: 'إنشاء حساب',
  robots: { index: false, follow: false },
  alternates: { canonical: '/signup' },
};
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <CustomerAuth mode="signup" next={next} />;
}
