import Link from 'next/link';
import { LoadingButtonPreview } from '@/components/loading-button-preview';
import { UploadProgress } from '@/components/upload-progress';
import { notFound } from 'next/navigation';
import { BusyButton } from '@/components/busy-button';
import { ContentSkeleton } from '@/components/content-skeleton';
import RootLoading from '../loading';
import HomeLoading from '../(home)/loading';
import ArticlesLoading from '../articles/(index)/loading';
import EpisodesLoading from '../episodes/(index)/loading';
import GuestsLoading from '../guests/(index)/loading';

/** Each route's loading placeholder, shown whole at `?view=<name>`. */
const ROUTES = {
  root: RootLoading,
  home: HomeLoading,
  articles: ArticlesLoading,
  episodes: EpisodesLoading,
  guests: GuestsLoading,
} as const;

export default async function LoadingPreview({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  if (process.env.NODE_ENV !== 'development') notFound();
  const { view } = await searchParams;
  const Route = view && view in ROUTES ? ROUTES[view as keyof typeof ROUTES] : null;
  if (Route) return <Route />;

  return (
    <div className="content-page">
      <div className="content-container" style={{ paddingBlock: 40 }}>
        <h1>معاينة التحميل</h1>
        <section className="loading-action-preview">
          <h2>حالات الأزرار</h2>
          <p>معاينة تصميم فقط، لا تُرسل بيانات.</p>
          <div>
            <LoadingButtonPreview />
            <BusyButton className="customer-primary" aria-busy>
              جار التحقق…
            </BusyButton>
            <BusyButton className="customer-primary" aria-busy>
              جار الحفظ…
            </BusyButton>
            <BusyButton className="customer-primary" disabled>
              غير متاح
            </BusyButton>
          </div>
        </section>
        <div style={{ maxWidth: 640, marginBlock: 32 }}>
          <UploadProgress filename="مقدمة الدورة.mp4" bytes={268435456} percent={42} />
        </div>
        <section style={{ marginBlock: 40 }}>
          <h2>الحلقات</h2>
          <ContentSkeleton count={3} />
        </section>
        <section style={{ marginBlock: 40 }}>
          <h2>البرامج</h2>
          <ContentSkeleton variant="cards" count={4} />
        </section>
        <section style={{ marginBlock: 40 }}>
          <h2>الحساب</h2>
          <ContentSkeleton variant="account" count={2} />
        </section>
        <section style={{ marginBlock: 40 }}>
          <h2>الصفحات</h2>
          <ul>
            {Object.keys(ROUTES).map((name) => (
              <li key={name}>
                <Link href={`/loading-preview?view=${name}`}>{name}</Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
