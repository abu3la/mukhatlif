import type { Metadata } from 'next';
import Link from 'next/link';
import { SERVICES as services } from '@/lib/site-facts';
export const metadata: Metadata = {
  title: 'الإنتاج',
  description: 'طوّر فكرتك مع مختلف إلى بودكاست أو سلسلة مرئية أو قصة علامة.',
  alternates: { canonical: '/services' },
};
export default function ServicesPage() {
  return (
    <div className="content-page public-page">
      <div className="content-container">
        <header className="public-page-head">
          <h1>لفكرتك، شكل يستحقها.</h1>
          <p>حدد ما تحتاجه، وساعدنا على فهم ما تريد قوله.</p>
        </header>
        <div className="public-services">
          {services.map(([title, text]) => (
            <article key={title}>
              <h2>{title}</h2>
              <p>{text}</p>
              <Link
                href={'/prodservice?service=' + encodeURIComponent(title)}
                aria-label={'اطلب إنتاج ' + title}
              >
                ابدأ بهذا الشكل
              </Link>
            </article>
          ))}
        </div>
        <div className="public-service-footer">
          <Link className="public-primary" href="/prodservice">
            اطلب إنتاجًا
          </Link>
          <Link href="/work">استعرض أعمالنا</Link>
        </div>
      </div>
    </div>
  );
}
