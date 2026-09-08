import { CustomerPlaylistPage } from '@/components/customer-library';
export const metadata = { title: 'قائمة التشغيل', robots: { index: false, follow: false } };
export default async function PlaylistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CustomerPlaylistPage playlistId={id} />;
}
