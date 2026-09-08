import { CustomerLibraryPage } from '@/components/customer-library';
export const metadata = {
  title: 'مكتبتي',
  robots: { index: false, follow: false },
  alternates: { canonical: '/library' },
};
export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  return <CustomerLibraryPage tab={tab} />;
}
