import { ComingSoon, comingSoonMetadata } from '@/components/coming-soon';

export const metadata = comingSoonMetadata('تسجيل الدخول', '/login');

export default function LoginPage() {
  return <ComingSoon section="تسجيل الدخول" />;
}
