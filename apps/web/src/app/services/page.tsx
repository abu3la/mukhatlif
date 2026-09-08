import type { Metadata } from 'next';
import Link from 'next/link';
export const metadata: Metadata = {
  title: 'الإنتاج',
  description: 'طوّر فكرتك مع مختلف إلى بودكاست أو سلسلة مرئية أو قصة علامة.',
  alternates: { canonical: '/services' },
};
const services = [
  ['بودكاست', 'تطوير فكرة البرنامج، محاوره وصوته، ثم تصور التسجيل والمونتاج.'],
  ['سلسلة مرئية', 'تصور لحلقات مترابطة، معالجة تحريرية، وإطار موحّد للتصوير.'],
  ['قصة علامة', 'تحديد الرسالة والجمهور، وتطوير معالجة لفيلم قصير.'],
] as const;
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
