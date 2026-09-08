import { CustomerOnboarding } from '@/components/customer-onboarding';
export const metadata = {
  title: 'اهتماماتك',
  robots: { index: false, follow: false },
  alternates: { canonical: '/onboarding' },
};
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; step?: string }>;
}) {
  const { next, step } = await searchParams;
  return <CustomerOnboarding step={step === '2' ? 2 : 1} next={next} />;
}
