import { CustomerAuth } from '@/components/customer-auth';
export const metadata = {
  title: 'تأكيد البريد',
  robots: { index: false, follow: false },
  alternates: { canonical: '/confirm' },
};
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; email?: string }>;
}) {
  const { next, email } = await searchParams;
  return <CustomerAuth mode="confirm" next={next} email={email} />;
}
