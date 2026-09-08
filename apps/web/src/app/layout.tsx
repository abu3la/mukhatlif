import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { PlayerProvider } from '@/components/player';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { isSearchIndexingEnabled, publicWebUrl } from '@/lib/config';
import { connection } from 'next/server';
import { CustomerProvider } from '@/components/customer-provider';
import { customerConfig } from '@/lib/customer-config';
import './listener.css';
import './handoff.css';
import './public-pages.css';

export const metadata: Metadata = {
  metadataBase: new URL(publicWebUrl()),
  title: {
    default: 'مختلف: الإذاعة المهنية الأولى في الوطن العربي',
    template: '%s | مختلف',
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
  themeColor: '#ffffff',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await connection();
  const config = customerConfig();
  return (
    <html lang="ar" dir="rtl" data-concept="first" suppressHydrationWarning>
      <head>
        <Script
          id="mukhtalif-appearance"
          strategy="beforeInteractive"
        >{`var t='first';try{if(localStorage.getItem('mukhtalif-appearance')==='third')t='third'}catch(e){}document.documentElement.dataset.concept=t;var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',t==='third'?'#1a1b19':'#ffffff')`}</Script>
      </head>
      <body>
        <a className="skip-link" href="#main">
          تخطَّ إلى المحتوى
        </a>

        <CustomerProvider config={config}>
          <PlayerProvider>
            <SiteHeader />

            <main id="main" className="site-main" tabIndex={-1}>
              {children}
            </main>

            <SiteFooter />
          </PlayerProvider>
        </CustomerProvider>
      </body>
    </html>
  );
}
