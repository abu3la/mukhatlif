import { CustomerAuth } from '@/components/customer-auth';
export const metadata = {
  title: 'تأكيد الحساب',
  robots: { index: false, follow: false },
  alternates: { canonical: '/auth/callback' },
};
export default async function AuthCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <CustomerAuth mode="callback" next={next} />;
}
