import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  adminPaths,
  canManagePage,
  STUDIO_PAGE_LABELS,
  useAdminAuth,
  useStudioMemberDirectory,
} from '@/application';
import {
  isAdminRepositoryError,
  type AdminRepositoryCapabilities,
} from '@/data';
import {
  formatPageCount,
  formatRoleCount,
  formatArabicInteger,
  type PermissionId,
  type RoleId,
  type StudioPageId,
  type StudioRole,
} from '@/lib';
import {
  Button,
  Field,
  Input,
  PageBreadcrumb,
  PageHeader,
  Textarea,
} from '@/shared/ui/primitives';

export type PermissionLevel = 'none' | 'view' | 'manage';

interface PermissionPageDefinition {
  readonly id: StudioPageId;
  readonly viewPermission: PermissionId;
  readonly managePermission?: PermissionId;
}

const PERMISSION_LEVEL_LABELS = {
  none: 'بدون وصول',
  view: 'عرض فقط',
  manage: 'إدارة',
} as const satisfies Record<PermissionLevel, string>;

const PERMISSION_PAGES: readonly PermissionPageDefinition[] = [
  { id: 'overview', viewPermission: 'overview.view' },
  {
    id: 'episodes',
    viewPermission: 'episodes.view',
    managePermission: 'episodes.manage',
  },
  { id: 'shows', viewPermission: 'shows.view', managePermission: 'shows.manage' },
  { id: 'guests', viewPermission: 'guests.view', managePermission: 'guests.manage' },
  {
    id: 'articles',
    viewPermission: 'articles.view',
    managePermission: 'articles.manage',
  },
  {
    id: 'subscribers',
    viewPermission: 'subscribers.view',
    managePermission: 'subscribers.manage',
  },
  {
    id: 'access',
    viewPermission: 'access.view',
    managePermission: 'access.manage',
  },
];

const PERMISSION_ORDER = PERMISSION_PAGES.flatMap((page) =>
  page.managePermission
    ? ([page.viewPermission, page.managePermission] as const)
    : ([page.viewPermission] as const),
);

function isPermissionPageAvailable(
  page: StudioPageId,
  capabilities: AdminRepositoryCapabilities,
): boolean {
  if (page === 'guests') return capabilities['guest-management'];
  if (page === 'access') return capabilities['access-management'];
  return true;
}

function canonicalPermissions(permissions: readonly PermissionId[]): PermissionId[] {
  const selected = new Set(permissions);
  for (const page of PERMISSION_PAGES) {
    if (page.managePermission && selected.has(page.managePermission)) {
      selected.add(page.viewPermission);
    }
  }
  return PERMISSION_ORDER.filter((permission) => selected.has(permission));
}

function samePermissions(left: readonly PermissionId[], right: readonly PermissionId[]) {
  const canonicalLeft = canonicalPermissions(left);
  const canonicalRight = canonicalPermissions(right);
  return (
    canonicalLeft.length === canonicalRight.length &&
    canonicalLeft.every((permission, index) => permission === canonicalRight[index])
  );
}

export function permissionLevelForPage(
  permissions: readonly PermissionId[],
  page: PermissionPageDefinition,
): PermissionLevel {
  if (page.managePermission && permissions.includes(page.managePermission)) return 'manage';
  if (permissions.includes(page.viewPermission)) return 'view';
  return 'none';
}

export function updatePagePermissionLevel(
  permissions: readonly PermissionId[],
  page: PermissionPageDefinition,
  level: PermissionLevel,
): PermissionId[] {
  const next = new Set(
    canonicalPermissions(permissions).filter(
      (permission) =>
        permission !== page.viewPermission && permission !== page.managePermission,
    ),
  );
  if (level === 'view' || level === 'manage') next.add(page.viewPermission);
  if (level === 'manage' && page.managePermission) next.add(page.managePermission);
  return canonicalPermissions([...next]);
}

export function accessPermissionUpdateErrorMessage(error: unknown): string {
  if (isAdminRepositoryError(error)) {
    if (error.code === 'FORBIDDEN' || error.code === 'UNAUTHENTICATED') {
      return 'لا يمكنك تعديل صلاحيات هذا الدور.';
    }
    if (error.code === 'NOT_FOUND') return 'الدور غير موجود. ارجع إلى قائمة الأدوار.';
    if (error.code === 'VALIDATION') {
      return 'راجع الصلاحيات المحددة ثم حاول مرة أخرى.';
    }
    if (error.code === 'CONFLICT') {
      return 'تغيّر الدور في جلسة أخرى. حدّث الصفحة ثم حاول مرة أخرى.';
    }
  }
  return 'تعذّر حفظ الصلاحيات. حاول مرة أخرى.';
}

export function roleCreateErrorMessage(error: unknown): string {
  if (isAdminRepositoryError(error)) {
    if (error.code === 'FORBIDDEN' || error.code === 'UNAUTHENTICATED') {
      return 'لا يمكنك إنشاء أدوار.';
    }
    if (error.code === 'CONFLICT') return 'اسم الدور مستخدم. اختر اسمًا آخر.';
    if (error.code === 'VALIDATION') return 'راجع اسم الدور ووصفه وصلاحياته.';
  }
  return 'تعذّر إنشاء الدور. حاول مرة أخرى.';
}

function rolePageCount(role: StudioRole): number {
  return PERMISSION_PAGES.filter(
    (page) => permissionLevelForPage(role.permissions, page) !== 'none',
  ).length;
}

function PermissionEditor({
  roleId,
  permissions,
  capabilities,
  disabled,
  onChange,
}: {
  roleId: RoleId;
  permissions: readonly PermissionId[];
  capabilities: AdminRepositoryCapabilities;
  disabled: boolean;
  onChange(next: PermissionId[]): void;
}) {
  return (
    <section className="role-permissions" aria-labelledby="role-permissions-title">
      <header className="role-permissions__header">
        <h2 id="role-permissions-title">صلاحيات الصفحات</h2>
        <p>اختر مستوى الوصول المناسب لكل صفحة.</p>
      </header>
      <div className="role-permissions__list">
        {PERMISSION_PAGES.map((page) => {
          const available = isPermissionPageAvailable(page.id, capabilities);
          const levels: readonly PermissionLevel[] = page.managePermission
            ? ['none', 'view', 'manage']
            : ['none', 'view'];
          const noteId = available ? undefined : `role-page-unavailable-${page.id}`;
          return (
            <fieldset
              className="role-permission-row"
              key={page.id}
              disabled={disabled || !available}
              aria-describedby={noteId}
            >
              <legend>{STUDIO_PAGE_LABELS[page.id]}</legend>
              {!available ? (
                <p className="role-permission-row__note" id={noteId}>
                  غير متاحة في مصدر البيانات الحالي
                </p>
              ) : null}
              <div className="permission-level__choices" data-option-count={levels.length}>
                {levels.map((level) => (
                  <label className="permission-choice" key={level}>
                    <input
                      type="radio"
                      name={`permission-${roleId}-${page.id}`}
                      value={level}
                      checked={permissionLevelForPage(permissions, page) === level}
                      onChange={() =>
                        onChange(updatePagePermissionLevel(permissions, page, level))
                      }
                    />
                    <span>{PERMISSION_LEVEL_LABELS[level]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          );
        })}
      </div>
    </section>
  );
}

export function RolesView() {
  const { roles } = useStudioMemberDirectory();
  const { viewer } = useAdminAuth();
  const canCreate = Boolean(viewer && canManagePage(viewer, 'access'));

  return (
    <div className="access-page roles-directory-page">
      <PageHeader
        title="الأدوار والصلاحيات"
        detail={formatRoleCount(roles.length)}
        action={
          canCreate ? (
            <Link className="button button--primary" to={adminPaths.roleNew}>
              دور جديد
            </Link>
          ) : null
        }
      />
      <section className="card roles-directory" aria-labelledby="roles-directory-title">
        <header className="roles-directory__header">
          <h2 id="roles-directory-title">دليل الأدوار</h2>
          <p>افتح أي دور لتصفح صلاحياته أو تعديلها.</p>
        </header>
        <ul className="roles-directory__list">
          {roles.map((role) => (
            <li className="roles-directory__item" key={role.id}>
              <div className="roles-directory__identity">
                <h3>
                  <Link to={adminPaths.role(role.id)}>{role.name}</Link>
                </h3>
                <p>{role.description || 'لا يوجد وصف لهذا الدور.'}</p>
              </div>
              <div className="roles-directory__facts" aria-label={`ملخص دور ${role.name}`}>
                <span>عدد حسابات الاستوديو: {formatArabicInteger(role.memberCount)}</span>
                <span>{formatPageCount(rolePageCount(role))}</span>
                {role.isProtected ? <span>دور ثابت</span> : role.isSystem ? <span>دور نظامي</span> : null}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function RoleNewView() {
  const { createRole, capabilities } = useStudioMemberDirectory();
  const navigate = useNavigate();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [permissions, setPermissions] = useState<PermissionId[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => headingRef.current?.focus(), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const normalizedName = name.trim();
    const normalizedDescription = description.trim();
    if (normalizedName.length < 2) {
      setError('اكتب اسمًا من حرفين على الأقل.');
      return;
    }
    setPending(true);
    setError('');
    try {
      const created = await createRole({
        name: normalizedName,
        description: normalizedDescription,
        permissions: canonicalPermissions(permissions),
      });
      navigate(adminPaths.role(created.id), { replace: true });
    } catch (cause) {
      setError(roleCreateErrorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="access-page role-editor-page">
      <PageBreadcrumb
        parentLabel="الأدوار والصلاحيات"
        parentTo={adminPaths.roles}
        current="دور جديد"
      />
      <header className="page-header">
        <div className="page-header__title-row">
          <h1 ref={headingRef} tabIndex={-1}>دور جديد</h1>
          <div className="page-header__detail">حدّد بيانات الدور وصلاحيات صفحاته.</div>
        </div>
      </header>
      <form className="card role-editor" aria-label="بيانات الدور الجديد" onSubmit={(event) => void submit(event)}>
        <div className="role-editor__fields">
          <Field label="اسم الدور">
            <Input
              name="name"
              value={name}
              minLength={2}
              maxLength={60}
              required
              disabled={pending}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label="الوصف (اختياري)" hint="وصف موجز يوضح مسؤوليات هذا الدور.">
            <Textarea
              name="description"
              value={description}
              maxLength={240}
              rows={3}
              disabled={pending}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
        </div>
        <PermissionEditor
          roleId="new"
          permissions={permissions}
          capabilities={capabilities}
          disabled={pending}
          onChange={(next) => {
            setPermissions(next);
            setError('');
          }}
        />
        <div className="role-editor__footer">
          <Button type="submit" variant="primary" disabled={pending} aria-busy={pending}>
            {pending ? 'جارٍ الإنشاء…' : 'إنشاء الدور'}
          </Button>
          <div className="role-editor__feedback" aria-live="polite">
            {error ? <p className="notice notice--error" role="alert">{error}</p> : null}
          </div>
        </div>
      </form>
    </div>
  );
}

export function RoleDetailsView() {
  const { roleId = '' } = useParams();
  const { roles, capabilities, updateRolePermissions } = useStudioMemberDirectory();
  const { viewer } = useAdminAuth();
  const role = useMemo(
    () => roles.find((candidate) => candidate.id === roleId),
    [roleId, roles],
  );
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [permissions, setPermissions] = useState<PermissionId[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => headingRef.current?.focus(), [roleId]);
  useEffect(() => {
    if (role) setPermissions(canonicalPermissions(role.permissions));
  }, [role]);

  if (!role) {
    return (
      <div className="access-page role-editor-page">
        <PageBreadcrumb
          parentLabel="الأدوار والصلاحيات"
          parentTo={adminPaths.roles}
          current="دور غير موجود"
        />
        <section className="card embedded-state" role="status">
          <h1 ref={headingRef} tabIndex={-1}>الدور غير موجود</h1>
          <p>قد يكون الدور محذوفًا أو أن الرابط غير صحيح.</p>
          <Link className="button button--primary" to={adminPaths.roles}>العودة إلى الأدوار</Link>
        </section>
      </div>
    );
  }

  const canEdit = Boolean(
    viewer && canManagePage(viewer, 'access') && !role.isProtected,
  );
  const dirty = !samePermissions(permissions, role.permissions);

  async function save() {
    if (!role || !canEdit || !dirty || pending) return;
    setPending(true);
    setError('');
    setSuccess('');
    try {
      await updateRolePermissions(role.id, permissions);
      setSuccess(`حُفظت صلاحيات ${role.name}.`);
    } catch (cause) {
      setError(accessPermissionUpdateErrorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="access-page role-editor-page">
      <PageBreadcrumb
        parentLabel="الأدوار والصلاحيات"
        parentTo={adminPaths.roles}
        current={role.name}
      />
      <header className="page-header role-details-header">
        <div className="page-header__title-row">
          <h1 ref={headingRef} tabIndex={-1}>{role.name}</h1>
          <div className="page-header__detail">{role.description || 'لا يوجد وصف لهذا الدور.'}</div>
        </div>
        <div className="role-details-header__facts">
          <span>عدد حسابات الاستوديو: {formatArabicInteger(role.memberCount)}</span>
          {role.isProtected ? <span>دور ثابت للقراءة فقط</span> : null}
        </div>
      </header>
      <section className="card role-editor" aria-label={`صلاحيات دور ${role.name}`}>
        {role.isProtected ? (
          <p className="role-editor__protected-note">
            صلاحيات المشرف العام ثابتة ولا يمكن تعديلها.
          </p>
        ) : null}
        <PermissionEditor
          roleId={role.id}
          permissions={permissions}
          capabilities={capabilities}
          disabled={!canEdit || pending}
          onChange={(next) => {
            setPermissions(next);
            setError('');
            setSuccess('');
          }}
        />
        {canEdit ? (
          <div className="role-editor__footer">
            <Button
              type="button"
              variant="primary"
              disabled={!dirty || pending}
              aria-busy={pending}
              onClick={() => void save()}
            >
              {pending ? 'جارٍ الحفظ…' : 'حفظ الصلاحيات'}
            </Button>
            <div className="role-editor__feedback" aria-live="polite">
              {error ? <p className="notice notice--error" role="alert">{error}</p> : null}
              {success ? <p className="notice notice--success" role="status">{success}</p> : null}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

/** Kept for the legacy /access redirect module. */
export const AccessView = RolesView;
