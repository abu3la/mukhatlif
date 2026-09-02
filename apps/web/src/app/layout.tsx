import type { Metadata, Viewport } from 'next';
import { PlayerProvider } from '@/components/player';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { isSearchIndexingEnabled, publicWebUrl } from '@/lib/config';
import './listener.css';

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
  robots: isSearchIndexingEnabled()
    ? { index: true, follow: true }
    : { index: false, follow: false, noarchive: true, nocache: true },
};

export const viewport: Viewport = {
  themeColor: '#f3f4f9',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <a className="skip-link" href="#main">
          تخطَّ إلى المحتوى
        </a>

        <PlayerProvider>
          <SiteHeader />

          <main id="main" className="site-main">
            {children}
          </main>

          <SiteFooter />
        </PlayerProvider>
      </body>
    </html>
  );
}
