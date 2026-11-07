import { type ReactNode, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { adminPaths, canViewPage, STUDIO_PAGE_LABELS, useAdminAuth } from '@/application';
import type { AdminRepositoryCapabilities } from '@/data';
import type { StudioDomain } from '@mukhtalif/design-tokens';
import { BrandMark } from '@/shared/ui/brand-mark';
import { Button } from '@/shared/ui/primitives';
import type { AdminViewer, StudioPageId } from '@/lib';
import { publicWebsite } from '../config/public-website';

type NavGroupId = 'content' | 'audience' | 'management';

interface StudioNavItem {
  readonly href: string;
  readonly page: StudioPageId;
  readonly label: string;
  readonly group: NavGroupId;
  /** The hue that signs the item, its page head and its counts (STUDIO.md). */
  readonly domain?: StudioDomain;
  /** Only the admin role sees the item, beyond the page permission. */
  readonly adminOnly?: boolean;
  readonly match: (path: string) => boolean;
}

const NAV_GROUPS: readonly { id: NavGroupId; label: string }[] = [
  { id: 'content', label: 'المحتوى' },
  { id: 'audience', label: 'الجمهور' },
  { id: 'management', label: 'الإدارة' },
];

const NAV_ITEMS: readonly StudioNavItem[] = [
  {
    href: adminPaths.overview,
    page: 'overview',
    label: STUDIO_PAGE_LABELS.overview,
    group: 'content',
    match: (path: string) => path === '/',
  },
  {
    href: adminPaths.episodes,
    page: 'episodes',
    label: STUDIO_PAGE_LABELS.episodes,
    group: 'content',
    domain: 'episodes',
    match: (path: string) => path.startsWith(adminPaths.episodes),
  },
  {
    href: adminPaths.shows,
    page: 'shows',
    label: STUDIO_PAGE_LABELS.shows,
    group: 'content',
    domain: 'shows',
    match: (path: string) => path.startsWith(adminPaths.shows),
  },
  {
    href: adminPaths.guests,
    page: 'guests',
    label: STUDIO_PAGE_LABELS.guests,
    group: 'content',
    domain: 'guests',
    match: (path: string) => path.startsWith(adminPaths.guests),
  },
  {
    href: adminPaths.articles,
    page: 'articles',
    label: STUDIO_PAGE_LABELS.articles,
    group: 'content',
    domain: 'articles',
    match: (path: string) => path.startsWith(adminPaths.articles),
  },
  {
    href: '/courses',
    page: 'overview',
    label: 'أكاديمية مختلف',
    group: 'content',
    domain: 'academy',
    adminOnly: true,
    match: (path: string) => path === '/courses',
  },
  {
    href: adminPaths.subscribers,
    page: 'subscribers',
    label: STUDIO_PAGE_LABELS.subscribers,
    group: 'audience',
    domain: 'audience',
    match: (path: string) => path.startsWith(adminPaths.subscribers),
  },
  {
    href: adminPaths.newsletter,
    page: 'subscribers',
    label: 'النشرة البريدية',
    group: 'audience',
    domain: 'audience',
    match: (path: string) => path.startsWith(adminPaths.newsletter),
  },
  {
    href: adminPaths.formSubmissions,
    page: 'forms',
    label: STUDIO_PAGE_LABELS.forms,
    group: 'audience',
    domain: 'forms',
    match: (path: string) => path.startsWith(adminPaths.formSubmissions),
  },
  {
    href: '/forms',
    page: 'forms',
    label: 'النماذج والتسجيلات',
    group: 'audience',
    domain: 'forms',
    match: (path) => path === '/forms',
  },
  {
    href: adminPaths.roles,
    page: 'access',
    label: 'الأدوار والصلاحيات',
    group: 'management',
    domain: 'access',
    match: (path: string) =>
      path === adminPaths.roles ||
      path.startsWith(`${adminPaths.roles}/`) ||
      path === adminPaths.access,
  },
  {
    href: adminPaths.studioMembers,
    page: 'access',
    label: 'حسابات الاستوديو',
    group: 'management',
    domain: 'access',
    match: (path: string) =>
      path === adminPaths.studioMembers || path.startsWith(`${adminPaths.studioMembers}/`),
  },
];

/** The domain of the current page, for the page head's mark. */
export function studioDomainForPath(pathname: string): StudioDomain | undefined {
  if (pathname === adminPaths.account) return 'access';
  return NAV_ITEMS.find((item) => item.match(pathname))?.domain;
}

export function isStudioPageAvailable(
  page: StudioPageId,
  capabilities: AdminRepositoryCapabilities,
): boolean {
  if (page === 'guests') return capabilities['guest-management'];
  if (page === 'access') return capabilities['access-management'];
  return true;
}

export function StudioShell({
  capabilities,
  children,
  viewer,
}: {
  capabilities: AdminRepositoryCapabilities;
  children: ReactNode;
  viewer: AdminViewer;
}) {
  const { pathname } = useLocation();
  const { isSubmitting, signOut } = useAdminAuth();
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const visibleItems = NAV_ITEMS.filter(
    (item) =>
      (!item.adminOnly || viewer.role === 'admin') &&
      canViewPage(viewer, item.page) &&
      isStudioPageAvailable(item.page, capabilities),
  );
  const homePath = visibleItems[0]?.href ?? adminPaths.overview;
  const domain = studioDomainForPath(pathname);
  const website = publicWebsite(
    window.location.hostname,
    import.meta.env.VITE_PRODUCTION_WEB_TARGET,
  );

  useEffect(() => {
    setIsNavigationOpen(false);
  }, [pathname]);

  return (
    <div className="studio-shell">
      <aside className="studio-sidebar">
        <div className="studio-sidebar__header">
          <Link to={homePath} className="studio-brand" aria-label="الانتقال إلى أول صفحة متاحة">
            <BrandMark height={24} />
            <span>لوحة التحكم</span>
          </Link>

          {website && (
            <a
              className="studio-website-link"
              href={website.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`عرض الموقع: ${website.label} (يفتح في تبويب جديد)`}
              title="يفتح في تبويب جديد"
            >
              <span>عرض الموقع</span>
              <small>{website.label}</small>
            </a>
          )}

          <button
            className="studio-menu-toggle"
            type="button"
            aria-expanded={isNavigationOpen}
            aria-controls="studio-navigation-panel"
            onClick={() => setIsNavigationOpen((open) => !open)}
          >
            {isNavigationOpen ? 'إغلاق القائمة' : 'القائمة'}
          </button>
        </div>

        <div
          className={`studio-sidebar__body ${isNavigationOpen ? 'studio-sidebar__body--open' : ''}`}
          id="studio-navigation-panel"
        >
          <nav className="studio-nav" aria-label="أقسام الاستوديو">
            {NAV_GROUPS.map((group) => {
              const items = visibleItems.filter((item) => item.group === group.id);
              if (items.length === 0) return null;
              return (
                <div className="studio-nav__group" key={group.id}>
                  <p className="studio-nav__heading" aria-hidden="true">
                    {group.label}
                  </p>
                  {items.map((item) => {
                    const active = item.match(pathname);
                    return (
                      <Link
                        key={item.href}
                        to={item.href}
                        className={`studio-nav__item ${active ? 'studio-nav__item--active' : ''}`}
                        aria-current={active ? 'page' : undefined}
                        data-domain={item.domain}
                        onClick={() => setIsNavigationOpen(false)}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              );
            })}
          </nav>

          <div className="studio-account">
            <div className="studio-viewer">
              <div className="studio-viewer__avatar" aria-hidden="true">
                {viewer.avatarInitial}
              </div>
              <div>
                <p>{viewer.name}</p>
                <span>{viewer.roleName}</span>
              </div>
            </div>
            <Link
              to={adminPaths.account}
              className={`studio-account-link ${pathname === adminPaths.account ? 'studio-account-link--active' : ''}`}
              aria-current={pathname === adminPaths.account ? 'page' : undefined}
            >
              أمان الحساب
            </Link>
            <Button
              className="studio-sign-out"
              type="button"
              disabled={isSubmitting}
              aria-busy={isSubmitting}
              onClick={() => {
                setSignOutError('');
                void signOut().catch(() => setSignOutError('تعذر تسجيل الخروج.'));
              }}
            >
              {'تسجيل الخروج'}
            </Button>
            {signOutError ? (
              <p className="studio-sign-out-error" role="alert">
                {signOutError}
              </p>
            ) : null}
          </div>
        </div>
      </aside>

      <main className="studio-main" data-domain={domain}>
        <div className="studio-main__inner">{children}</div>
      </main>
    </div>
  );
}
