import { CustomerAccount } from '@/components/customer-account';
export const metadata = {
  title: 'حسابي',
  robots: { index: false, follow: false },
  alternates: { canonical: '/account' },
};
export default function AccountPage() {
  return <CustomerAccount />;
}
