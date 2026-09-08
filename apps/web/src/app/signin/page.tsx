import { redirect } from 'next/navigation';
import { safeCustomerReturn } from '@/lib/customer-utils';
export default async function SigninPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  redirect(`/login?next=${encodeURIComponent(safeCustomerReturn(next))}`);
}
