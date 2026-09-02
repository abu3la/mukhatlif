import type { Metadata } from 'next';
import Link from 'next/link';

export function comingSoonMetadata(section: string, path: string): Metadata {
  return {
    title: `${section} | جاري البناء`,
    description: `نعمل على تجهيز صفحة ${section} في موقع مختلف.`,
    alternates: { canonical: path },
  };
}

export function ComingSoon({ section }: { section: string }) {
  return (
    <div className="content-page">
      <div className="content-container">
        <section className="state" aria-labelledby="coming-soon-title">
          <h1 className="state__title" id="coming-soon-title">
            جاري البناء
          </h1>
          <p className="state__text">نجهّز صفحة {section}. ستتوفر قريبًا.</p>
          <Link className="action" href="/">
            العودة إلى الرئيسية
          </Link>
        </section>
      </div>
    </div>
  );
}
