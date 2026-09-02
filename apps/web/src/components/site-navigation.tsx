'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAVIGATION = [
  { href: '/', label: 'الرئيسية' },
  { href: '/about', label: 'من نحن' },
  { href: '/articles', label: 'المقالات' },
] as const;

function isCurrentPath(pathname: string, href: (typeof NAVIGATION)[number]['href']): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteNavigation() {
  const pathname = usePathname();

  return (
    <nav className="site-header__nav" aria-label="التنقل الرئيسي">
      {NAVIGATION.map((item) => (
        <Link
          key={item.href}
          className="site-header__nav-link"
          href={item.href}
          aria-current={isCurrentPath(pathname, item.href) ? 'page' : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
