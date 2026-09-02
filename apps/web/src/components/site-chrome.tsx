import Link from 'next/link';
import { apiOrigin } from '@/lib/config';
import { NewsletterSignup } from './newsletter-signup';
import { Wordmark } from './wordmark';
import { SiteNavigation } from './site-navigation';

const COMPANY_LINKS = [
  { href: '/about', label: 'من نحن' },
  { href: '/suggest', label: 'اقترح لنا ضيف' },
  { href: '/join-us', label: 'انضم مع المختلفين' },
  { href: '/guests', label: 'مكتبة الضيوف' },
  { href: '/prodservice', label: 'خدمة الإنتاج' },
  { href: '/sponsor', label: 'للشراكات والرعايات' },
] as const;

const SOCIAL_LINKS = [
  { href: 'https://youtube.com/@mukhtalif_career', label: 'يوتيوب' },
  { href: 'https://open.spotify.com/show/6m9xb0r6xCBtTvq4UnnYbh', label: 'سبوتيفاي' },
  { href: 'https://podcasts.apple.com/sa/podcast/id1532674246', label: 'آبل بودكاست' },
  { href: 'https://www.linkedin.com/company/mukhtalifcareer', label: 'لينكدإن' },
  { href: 'https://x.com/MukhtalifCareer', label: 'إكس' },
  { href: 'https://www.instagram.com/mukhtalif_career/', label: 'إنستغرام' },
  { href: 'https://www.tiktok.com/@mukhtalif_career', label: 'تيك توك' },
] as const;

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="shell site-header__inner">
        <Link className="site-header__brand" href="/" aria-label="مختلف - الرئيسية">
          <Wordmark title="مختلف" className="site-header__wordmark" />
        </Link>

        <SiteNavigation />

        <div className="site-header__actions">
          <Link className="site-header__partner-link" href="/sponsor">
            للشراكات والرعايات
          </Link>
          <Link className="site-header__avatar" href="/account" aria-label="الحساب">
            ع
          </Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell site-footer__inner">
        <div className="site-footer__grid">
          <div className="site-footer__brand">
            <Wordmark title="مختلف" className="site-footer__wordmark" />
            <p className="site-footer__tagline">مختلف.. لمسار مهني يشبهك.</p>
            <p className="site-footer__meta">الرياض، المملكة العربية السعودية</p>
            <p className="site-footer__meta">
              <a className="site-footer__email" href="mailto:Info@mukhtalif.net">
                <bdi dir="ltr">Info@mukhtalif.net</bdi>
              </a>
            </p>
          </div>

          <nav className="site-footer__group" aria-label="روابط مختلف">
            <h2 className="site-footer__heading">روابط</h2>
            <div className="site-footer__links">
              {COMPANY_LINKS.map((item) => (
                <Link key={item.href} href={item.href}>
                  {item.label}
                </Link>
              ))}
            </div>
          </nav>

          <nav className="site-footer__group" aria-label="منصات مختلف">
            <h2 className="site-footer__heading">تابعنا على المنصة التي تفضلها</h2>
            <div className="site-footer__links site-footer__socials">
              {SOCIAL_LINKS.map((item) => (
                <a key={item.href} href={item.href}>
                  {item.label}
                </a>
              ))}
            </div>
          </nav>

          <NewsletterSignup apiOrigin={apiOrigin()} />
        </div>

        <p className="site-footer__copyright">جميع الحقوق محفوظة © ٢٠٢٦ | مختلف</p>
      </div>
    </footer>
  );
}
