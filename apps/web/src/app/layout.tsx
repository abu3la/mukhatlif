import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { Wordmark } from '@/components/wordmark';
import { Signal } from '@/components/signal';
import { publicWebUrl } from '@/lib/config';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(publicWebUrl()),
  title: {
    default: 'مختلف — الإذاعة المهنية الأولى في الوطن العربي',
    template: '%s — مختلف',
  },
  description: 'برامج ومقالات عن المسار المهني، من إنتاج شبكة مختلف.',
  openGraph: {
    type: 'website',
    locale: 'ar_SA',
    siteName: 'مختلف',
  },
  alternates: { canonical: '/' },
};

export const viewport: Viewport = {
  themeColor: '#0d0f2e',
};

const NAV = [
  { href: '/shows', label: 'البرامج' },
  { href: '/episodes', label: 'الحلقات' },
  { href: '/articles', label: 'المقالات' },
] as const;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <a className="skip-link" href="#main">
          تخطَّ إلى المحتوى
        </a>

        <header className="masthead">
          <div className="shell masthead__inner">
            <Link className="masthead__brand" href="/" aria-label="مختلف — الصفحة الرئيسية">
              <Wordmark title="مختلف" className="masthead__wordmark" />
              <Signal />
            </Link>
            <nav className="masthead__nav" aria-label="التنقل الرئيسي">
              {NAV.map((item) => (
                <Link key={item.href} className="masthead__link" href={item.href}>
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>

        <main id="main">{children}</main>

        <footer className="colophon">
          <div className="shell">
            <div className="colophon__inner">
              <p className="colophon__note">
                شبكة مختلف تنتج برامج ومقالات عن المسار المهني في الوطن العربي، من الرياض.
              </p>
              <nav className="colophon__nav" aria-label="روابط الموقع">
                {NAV.map((item) => (
                  <Link key={item.href} href={item.href}>
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
          </div>
          {/*
            The signature: the station's own wordmark at full width, flush to
            the bottom edge, on the layer above the ground rather than behind it.
          */}
          <Wordmark className="colophon__signature" decorative />
        </footer>
      </body>
    </html>
  );
}
