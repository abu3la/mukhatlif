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
/** Footer groups per the site brief (section 22). The store and numbers pages
 * are added when they have approved content. */
const FOOTER_GROUPS: [string, [string, string][]][] = [
  [
    'اكتشف مختلف',
    [
      ['/communities', 'المجتمعات'],
      ['/shows', 'برامج البودكاست'],
      ['/articles', 'المقالات والنشرات'],
      ['/courses', 'الأكاديمية'],
    ],
  ],
  [
    'عن مختلف',
    [
      ['/about', 'من نحن'],
      ['/presenters', 'مقدّمو مختلف'],
      ['/account', 'حسابي'],
      ['/library', 'مكتبتي'],
    ],
  ],
  [
    'تعاون وشارك',
    [
      ['/sponsor', 'الرعايات والمشاريع'],
      ['/suggest', 'اقترح ضيفًا'],
      ['/join-us', 'انضم لفريقنا'],
      ['/contact', 'تواصل معنا'],
    ],
  ],
];

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell site-footer__inner">
        <div className="site-footer__grid">
          <div className="site-footer__brand">
            <Link href="/" aria-label="مختلف - الرئيسية">
              <BrandLogo />
            </Link>
            <p className="site-footer__tagline">
              مختلف، شبكة محتوى تفتح لك تجارب ومعارف تساعدك تكتشف مسارًا مهنيًا يشبهك. إحدى شركات
              ماد قروب.
            </p>
            <a className="site-footer__email" href="mailto:Info@mukhtalif.net">
              <bdi>Info@mukhtalif.net</bdi>
            </a>
          </div>
          {FOOTER_GROUPS.map(([title, links]) => (
            <nav className="site-footer__group" aria-label={title} key={title}>
              <h2 className="site-footer__heading">{title}</h2>
              {links.map(([href, label]) => (
                <Link href={href} key={href}>
                  {label}
                </Link>
              ))}
            </nav>
          ))}
        </div>
        <div className="site-footer__legal">
          <p className="site-footer__copyright">
            © {new Date().getFullYear()} مختلف. جميع الحقوق محفوظة.
          </p>
          <nav aria-label="السياسات">
            <Link href="/privacy">سياسة الخصوصية</Link>
            <Link href="/terms">الشروط والأحكام</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
