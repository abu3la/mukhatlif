'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { BrandIcon } from './brand-icon';
import { ThemeControl } from './theme-control';
import styles from './site-navigation.module.css';

const NAVIGATION = [
  { href: '/', label: 'الرئيسية' },
  { href: '/shows', label: 'البرامج' },
  { href: '/episodes', label: 'الحلقات' },
  { href: '/guests', label: 'الضيوف' },
  { href: '/articles', label: 'قراءات من مختلف' },
  { href: '/about', label: 'من نحن' },
  { href: '/services', label: 'الإنتاج' },
] as const;

const MENU_GROUPS = [
  { title: 'اكتشف مختلف', links: NAVIGATION.slice(0, 5) },
  {
    title: 'عن مختلف',
    links: [
      { href: '/about', label: 'من نحن' },
      { href: '/mission', label: 'قضيتنا' },
      { href: '/services', label: 'الإنتاج' },
      { href: '/work', label: 'أعمالنا' },
      { href: '/sponsor', label: 'الشراكات والرعايات' },
      { href: '/suggest', label: 'اقترح ضيفًا' },
      { href: '/join-us', label: 'انضم إلينا' },
    ],
  },
  {
    title: 'حسابك ومكتبتك',
    links: [
      { href: '/account', label: 'حسابي' },
      { href: '/library', label: 'مكتبتي' },
      { href: '/library?tab=playlists', label: 'قوائم التشغيل' },
      { href: '/search', label: 'بحث' },
    ],
  },
] as const;

export function SiteNavigation() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(true);
  const previousPath = useRef(pathname);

  useEffect(() => {
    if (previousPath.current !== pathname) {
      previousPath.current = pathname;
      restoreFocus.current = false;
      dialog.current?.close();
      document.getElementById('main')?.focus({ preventScroll: true });
    }
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const isCurrent = (href: string) =>
    !href.includes('?') &&
    (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`));
  const closeMenu = () => dialog.current?.close();

  return (
    <>
      <nav className={styles.primaryNav} aria-label="التنقل الرئيسي">
        {NAVIGATION.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={styles.navLink}
            aria-current={isCurrent(item.href) ? 'page' : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className={styles.actions}>
        <Link className={styles.sponsor} href="/sponsor">
          الشراكات والرعايات
        </Link>
        <Link
          className={styles.search}
          href="/search"
          aria-label="ابحث في مختلف"
          title="ابحث في مختلف"
        >
          <BrandIcon name="search" />
        </Link>
        <Link className={styles.library} href="/library">
          <BrandIcon name="library" />
          <span>مكتبتي</span>
        </Link>
        <button
          type="button"
          ref={trigger}
          className={styles.menuToggle}
          aria-label="فتح القائمة"
          aria-haspopup="dialog"
          aria-controls="site-navigation"
          aria-expanded={open}
          onClick={() => {
            restoreFocus.current = true;
            dialog.current?.showModal();
            setOpen(true);
            closeButton.current?.focus();
          }}
        >
          <BrandIcon name="menu" />
          <span>القائمة</span>
        </button>
      </div>
      <dialog
        ref={dialog}
        id="site-navigation"
        className={styles.menuDialog}
        aria-labelledby="site-navigation-title"
        onCancel={(event) => {
          event.preventDefault();
          closeMenu();
        }}
        onClose={() => {
          setOpen(false);
          if (restoreFocus.current) trigger.current?.focus({ preventScroll: true });
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            closeMenu();
        }}
      >
        <div className={styles.menuHead}>
          <h2 id="site-navigation-title">كل صفحات مختلف</h2>
          <button
            ref={closeButton}
            type="button"
            className={styles.closeButton}
            aria-label="إغلاق القائمة"
            onClick={closeMenu}
          >
            <BrandIcon name="close" />
          </button>
        </div>
        <div className={styles.menuGroups}>
          {MENU_GROUPS.map((group) => (
            <nav key={group.title} className={styles.menuGroup} aria-label={group.title}>
              <h3>{group.title}</h3>
              {group.links.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={styles.menuLink}
                  aria-current={isCurrent(item.href) ? 'page' : undefined}
                  onClick={closeMenu}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          ))}
        </div>
        <div className={styles.menuSettings}>
          <span>مظهر الموقع</span>
          <ThemeControl />
        </div>
      </dialog>
    </>
  );
}
