import { redirect } from 'next/navigation';
export default function FollowedPage() {
  redirect('/library?tab=followed');
}
