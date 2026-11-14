import type { Metadata } from 'next';
import Link from 'next/link';
import { BrandIcon } from '@/components/brand-icon';

export const metadata: Metadata = {
  title: 'تواصل مع مختلف',
  description: 'عندك سؤال أو ملاحظة؟ اكتب لنا.',
  alternates: { canonical: '/contact' },
};

const paths = [
  ['/sponsor', 'الرعايات والمشاريع'],
  ['/suggest', 'اقترح ضيفًا'],
  ['/join-us', 'انضم لفريقنا'],
] as const;

export default function ContactPage() {
  return (
    <div className="content-page public-page">
      <div className="content-container contact-page">
        <header className="public-page-head">
          <h1>تواصل مع مختلف</h1>
          <p>عندك سؤال أو ملاحظة؟ اكتب لنا، وخلّ بيانات التواصل عشان نقدر نرد عليك.</p>
        </header>
        <nav className="contact-page__paths" aria-label="طلبات محددة">
          {paths.map(([href, label]) => (
            <Link href={href} key={href}>
              {label}
              <BrandIcon name="next" className="community-card__arrow" />
            </Link>
          ))}
        </nav>
        <a className="public-primary" href="mailto:Info@mukhtalif.net">
          أرسل رسالتك
        </a>
        <p className="contact-page__email">
          أو اكتب مباشرة إلى <bdi dir="ltr">Info@mukhtalif.net</bdi>
        </p>
      </div>
    </div>
  );
}
