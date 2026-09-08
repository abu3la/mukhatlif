import Link from 'next/link';
import { SiteNavigation } from './site-navigation';
import styles from './site-navigation.module.css';

export function BrandLogo() {
  return (
    <>
      <img
        className="brand-logo brand-logo--light"
        src="/handoff/mukhtalif-logo.svg"
        width="122"
        height="41"
        alt="مختلف"
      />
      <img
        className="brand-logo brand-logo--dark"
        src="/handoff/mukhtalif-logo-white.svg"
        width="122"
        height="41"
        alt="مختلف"
      />
    </>
  );
}
export function SiteHeader() {
  return (
    <header className="site-header">
      <div className={styles.headerInner}>
        <Link className={styles.brand} href="/" aria-label="مختلف - الرئيسية">
          <BrandLogo />
        </Link>
        <SiteNavigation />
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
            <Link href="/" aria-label="مختلف - الرئيسية">
              <BrandLogo />
            </Link>
            <p className="site-footer__tagline">إعلام مهني. لمسار يشبهك.</p>
            <a className="site-footer__email" href="mailto:Info@mukhtalif.net">
              <bdi>Info@mukhtalif.net</bdi>
            </a>
          </div>
          <nav className="site-footer__group" aria-label="روابط مختلف">
            {[
              ['/about', 'من نحن'],
              ['/mission', 'قضيتنا'],
              ['/services', 'الإنتاج'],
              ['/work', 'أعمالنا'],
              ['/sponsor', 'للشراكات والرعايات'],
              ['/suggest', 'اقترح ضيفًا'],
              ['/join-us', 'انضم إلينا'],
            ].map(([href, label]) => (
              <Link href={href} key={href}>
                {label}
              </Link>
            ))}
          </nav>
          <nav className="site-footer__group" aria-label="حسابك والسياسات">
            {[
              ['/account', 'حسابي'],
              ['/library', 'مكتبتي'],
              ['/library?tab=playlists', 'قوائم التشغيل'],
              ['/privacy', 'الخصوصية'],
              ['/terms', 'الشروط'],
            ].map(([href, label]) => (
              <Link href={href} key={href}>
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <p className="site-footer__copyright">© {new Date().getFullYear()} مختلف</p>
      </div>
    </footer>
  );
}
