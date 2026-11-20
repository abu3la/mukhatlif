import Link from 'next/link';
import { PLATFORMS } from '@/lib/site-facts';
import { PlatformMark } from './platform-mark';
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
/** The floor's link groups (D-24), drawn from the site brief (section 22). The
 * store and numbers pages are added when they have approved content. */
const FOOTER_GROUPS: [string, [string, string][]][] = [
  [
    'استمع',
    [
      ['/programmes', 'البرامج'],
      ['/episodes', 'الحلقات'],
      ['/communities', 'المجتمعات'],
      ['/guests', 'الضيوف'],
    ],
  ],
  [
    'اقرأ وتعلّم',
    [
      ['/articles', 'المقالات والنشرات'],
      ['/courses', 'الأكاديمية'],
      ['/presenters', 'مقدّمو مختلف'],
    ],
  ],
  [
    'مختلف',
    [
      ['/about', 'من نحن'],
      ['/mission', 'قضيتنا'],
      ['/services', 'الإنتاج'],
      ['/work', 'أعمالنا'],
      ['/join-us', 'انضم لفريقنا'],
    ],
  ],
  [
    'تواصل',
    [
      ['/contact', 'تواصل معنا'],
      ['/suggest', 'اقترح ضيفًا'],
      ['/sponsor', 'الرعايات والمشاريع'],
    ],
  ],
];

/**
 * The floor every page stands on (D-06, reshaped by D-24): four link groups,
 * the listening platforms, the legal line, and the wordmark set large at the
 * bottom edge.
 */
export function SiteFooter() {
  return (
    <footer className="site-floor floor-scope">
      <div className="content-container site-floor__inner">
        <div className="site-floor__cols">
          {FOOTER_GROUPS.map(([title, links]) => (
            <nav className="site-floor__group" aria-label={title} key={title}>
              <h2 className="site-floor__heading">{title}</h2>
              <ul>
                {links.map(([href, label]) => (
                  <li key={href}>
                    <Link href={href}>{label}</Link>
                  </li>
                ))}
                {title === 'تواصل' ? (
                  <li>
                    <a href="mailto:Info@mukhtalif.net">
                      <bdi>Info@mukhtalif.net</bdi>
                    </a>
                  </li>
                ) : null}
              </ul>
            </nav>
          ))}
        </div>
        <div className="site-floor__base">
          <ul className="site-floor__marks" aria-label="مختلف على منصات الاستماع">
            {PLATFORMS.map((platform) => (
              <li key={platform.id}>
                <a
                  className="site-floor__mark"
                  href={platform.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${platform.context} على ${platform.label}، يفتح في علامة تبويب جديدة`}
                >
                  <PlatformMark id={platform.id} />
                  <bdi>{platform.label}</bdi>
                </a>
              </li>
            ))}
          </ul>
          <p className="site-floor__legal">
            <span>
              © {new Date().getFullYear()} مختلف، إحدى شركات ماد قروب. جميع الحقوق محفوظة.
            </span>
            <span className="site-floor__policies">
              <Link href="/privacy">سياسة الخصوصية</Link>
              <Link href="/terms">الشروط والأحكام</Link>
            </span>
          </p>
        </div>
        <img
          className="site-floor__wordmark"
          src="/handoff/mukhtalif-logo-white.svg"
          width="556"
          height="184"
          alt=""
          loading="lazy"
          decoding="async"
        />
      </div>
    </footer>
  );
}
