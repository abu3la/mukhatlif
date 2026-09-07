'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { BrandIcon } from './brand-icon';

const NAVIGATION = [
  { href: '/', label: 'الرئيسية' },
  { href: '/shows', label: 'البرامج' },
  { href: '/episodes', label: 'الحلقات' },
  { href: '/guests', label: 'الضيوف' },
  { href: '/articles', label: 'قراءات من مختلف' },
  { href: '/about', label: 'من نحن' },
  { href: '/services', label: 'الإنتاج' },
  { href: '/search', label: 'بحث' },
] as const;
export function SiteNavigation() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const previousPath = useRef(pathname);
  useEffect(() => {
    if (previousPath.current !== pathname) {
      previousPath.current = pathname;
      document.getElementById('main')?.focus({ preventScroll: true });
    }
  }, [pathname]);
  return (
    <>
      <button
        ref={trigger}
        className="site-menu-toggle icon-action"
        aria-label={open ? 'إغلاق القائمة' : 'فتح القائمة'}
        aria-controls="site-navigation"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <BrandIcon name={open ? 'close' : 'menu'} />
      </button>
      <nav
        id="site-navigation"
        className={`site-header__nav${open ? ' is-open' : ''}`}
        aria-label="التنقل الرئيسي"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false);
            trigger.current?.focus();
          }
        }}
      >
        {NAVIGATION.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="site-header__nav-link"
            aria-current={
              (item.href === '/' ? pathname === '/' : pathname.startsWith(item.href))
                ? 'page'
                : undefined
            }
            onClick={() => setOpen(false)}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
