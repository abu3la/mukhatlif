import { ComingSoon, comingSoonMetadata } from '@/components/coming-soon';

export const metadata = comingSoonMetadata('الحساب', '/account');

export default function AccountPage() {
  return <ComingSoon section="الحساب" />;
}
