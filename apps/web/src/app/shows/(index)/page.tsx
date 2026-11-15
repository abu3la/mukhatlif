import { redirect } from 'next/navigation';

/** The programme directory now lives at /programmes, grouped by community. */
export default function ShowsPage() {
  redirect('/programmes');
}
