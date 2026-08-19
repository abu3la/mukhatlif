import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  adminPagePaths,
  STUDIO_PAGE_LABELS,
  useAdminAuth,
} from '@/application';
import { BrandMark } from '@/shared/ui/brand-mark';
import { Button } from '@/shared/ui/primitives';
import type { AdminViewer, StudioPageId } from '@/lib';

export function AuthLoadingView() {
  return (
    <main className="auth-state-page" aria-busy="true" aria-live="polite">
      <BrandMark height={28} />
      <p>جارٍ التحقق من جلسة الاستوديو…</p>
    </main>
  );
}

export function AccessDeniedView({
  email,
  viewer,
}: {
  email?: string | null;
  viewer?: AdminViewer | null;
}) {
  const { isSubmitting, signOut } = useAdminAuth();
  const [signOutError, setSignOutError] = useState('');
  const accountEmail = viewer?.email ?? email;

  return (
    <main className="auth-state-page">
      <section className="auth-state-panel" aria-labelledby="access-denied-title">
        <BrandMark height={28} />
        <div>
          <h1 id="access-denied-title">لا تملك صلاحية دخول الاستوديو</h1>
          <p>
            {viewer
              ? 'لم تُمنح لهذا الحساب صلاحية عرض أي صفحة في استوديو الإدارة.'
              : 'هذا الحساب غير مرتبط بعضوية فعالة في فريق الاستوديو.'}
          </p>
          {viewer ? <p>الدور الحالي: {viewer.roleName}</p> : null}
          {accountEmail ? (
            <bdi className="auth-account-email" dir="ltr">
              {accountEmail}
            </bdi>
          ) : null}
        </div>
        {signOutError ? (
          <p className="notice notice--error" role="alert">
            {signOutError}
          </p>
        ) : null}
        <Button
          type="button"
          variant="primary"
          disabled={isSubmitting}
          aria-busy={isSubmitting}
          onClick={() => {
            setSignOutError('');
            void signOut().catch(() => {
              setSignOutError('تعذّر تسجيل الخروج. حاول مرة أخرى.');
            });
          }}
        >
          {isSubmitting ? 'جارٍ تسجيل الخروج…' : 'تسجيل الخروج'}
        </Button>
      </section>
    </main>
  );
}

export function AuthErrorView() {
  const { isSubmitting, retry, signOut } = useAdminAuth();
  const [actionError, setActionError] = useState('');

  return (
    <main className="auth-state-page">
      <section className="auth-state-panel" aria-labelledby="auth-error-title">
        <BrandMark height={28} />
        <div>
          <h1 id="auth-error-title">تعذّر التحقق من الحساب</h1>
          <p>تحقق من الاتصال ثم أعد المحاولة.</p>
        </div>
        {actionError ? (
          <p className="notice notice--error" role="alert">
            {actionError}
          </p>
        ) : null}
        <div className="auth-state-actions">
          <Button
            type="button"
            variant="primary"
            disabled={isSubmitting}
            onClick={() => void retry()}
          >
            إعادة المحاولة
          </Button>
          <Button
            type="button"
            disabled={isSubmitting}
            onClick={() => {
              setActionError('');
              void signOut().catch(() => setActionError('تعذّر تسجيل الخروج. حاول مرة أخرى.'));
            }}
          >
            تسجيل الخروج
          </Button>
        </div>
      </section>
    </main>
  );
}

export function AdminRouteDeniedView({
  page = 'access',
  fallbackPage = 'overview',
  action = 'view',
}: {
  page?: StudioPageId;
  fallbackPage?: StudioPageId;
  action?: 'view' | 'manage';
}) {
  return (
    <section className="card permission-state" aria-labelledby="admin-route-denied-title">
      <h1 id="admin-route-denied-title">
        لا تملك صلاحية {action === 'manage' ? 'إدارة' : 'عرض'} صفحة{' '}
        {STUDIO_PAGE_LABELS[page]}
      </h1>
      <p>تواصل مع المشرف العام إذا كنت تحتاج إلى هذه الصفحة.</p>
      <Link className="back-link" to={adminPagePaths[fallbackPage]}>
        → الانتقال إلى {STUDIO_PAGE_LABELS[fallbackPage]}
      </Link>
    </section>
  );
}
