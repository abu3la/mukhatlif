import { CustomerAuth } from '@/components/customer-auth';
export const metadata = {
  title: 'تسجيل الدخول',
  robots: { index: false, follow: false },
  alternates: { canonical: '/login' },
};
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <CustomerAuth mode="login" next={next} />;
}
