'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { BrandIcon } from './brand-icon';
import { ThemeControl } from './theme-control';
import styles from './site-navigation.module.css';

// Main bar of the presentation site (D-24), built on the site brief of 9
// November 2026 (section 2). The logo returns home; «استمع» is the one way into
// listening. Partnerships stay in the menu above appearance (owner rule, 2026-10-17).
const NAVIGATION = [
  { href: '/programmes', label: 'البرامج' },
  { href: '/communities', label: 'المجتمعات' },
  { href: '/articles', label: 'المقالات والنشرات' },
  { href: '/courses', label: 'الأكاديمية' },
  { href: '/services', label: 'الإنتاج' },
] as const;

// «عن مختلف» opens a short list. «أرقام مختلف» joins it once the page exists.
const ABOUT_LINKS = [
  { href: '/about', label: 'من نحن' },
  { href: '/mission', label: 'قضيتنا' },
  { href: '/presenters', label: 'مقدّمو مختلف' },
] as const;

const MENU_GROUPS = [
  {
    title: 'اكتشف مختلف',
    links: [
      { href: '/communities', label: 'المجتمعات' },
      { href: '/programmes', label: 'برامج البودكاست' },
      { href: '/episodes', label: 'الحلقات' },
      { href: '/guests', label: 'الضيوف' },
      { href: '/articles', label: 'المقالات والنشرات' },
      { href: '/courses', label: 'الأكاديمية' },
    ],
  },
  {
    title: 'عن مختلف',
    links: [
      { href: '/about', label: 'من نحن' },
      { href: '/mission', label: 'قضيتنا' },
      { href: '/presenters', label: 'مقدّمو مختلف' },
      { href: '/services', label: 'الإنتاج' },
      { href: '/suggest', label: 'اقترح ضيفًا' },
      { href: '/join-us', label: 'انضم لفريقنا' },
      { href: '/contact', label: 'تواصل معنا' },
    ],
  },
  {
    title: 'حسابك ومكتبتك',
    links: [
      { href: '/account', label: 'حسابي' },
      { href: '/library', label: 'مكتبتي' },
      { href: '/library/courses', label: 'دوراتي' },
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
        <NavDisclosure label="عن مختلف" links={ABOUT_LINKS} isCurrent={isCurrent} />
      </nav>
      <div className={styles.actions}>
        <Link
          className={styles.listen}
          href="/episodes"
          aria-current={isCurrent('/episodes') ? 'page' : undefined}
        >
          <BrandIcon name="play" />
          <span>استمع</span>
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
        <Link className={styles.menuSponsor} href="/sponsor" onClick={closeMenu}>
          الرعايات والمشاريع
        </Link>
        <div className={styles.menuSettings}>
          <span>مظهر الموقع</span>
          <ThemeControl />
        </div>
      </dialog>
    </>
  );
}

/**
 * A top-bar item that opens a short list of links. It closes on a choice, on
 * Escape (returning focus to its button), and when focus or a pointer leaves it.
 */
function NavDisclosure({
  label,
  links,
  isCurrent,
}: {
  label: string;
  links: readonly { href: string; label: string }[];
  isCurrent: (href: string) => boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div
      ref={wrapper}
      className={styles.navGroup}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        className={styles.navLink}
        aria-expanded={open}
        aria-controls={panelId}
        data-current={links.some((link) => isCurrent(link.href)) || undefined}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
        <BrandIcon name="down" />
      </button>
      <div id={panelId} className={styles.navPanel} hidden={!open}>
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={styles.navPanelLink}
            aria-current={isCurrent(link.href) ? 'page' : undefined}
            onClick={() => setOpen(false)}
          >
            {link.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
