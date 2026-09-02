import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  adminPaths,
  canManagePage,
  useAdminAuth,
  useStudioMemberDirectory,
} from '@/application';
import { isAdminRepositoryError } from '@/data';
import {
  formatArabicDate,
  formatArabicInteger,
  type RoleId,
  type StudioMember,
  type StudioRole,
} from '@/lib';
import {
  Button,
  Field,
  Input,
  PageBreadcrumb,
  PageHeader,
  Select,
} from '@/shared/ui/primitives';

export function studioMemberRoleUpdateErrorMessage(error: unknown): string {
  if (isAdminRepositoryError(error)) {
    if (error.code === 'FORBIDDEN') return 'لا يمكنك تعيين هذا الدور.';
    if (error.code === 'CONFLICT') {
      return 'لا يمكن تغيير دور المشرف العام الوحيد.';
    }
  }
  return 'تعذّر تحديث الدور. حاول مرة أخرى.';
}

export function studioMemberCreateErrorMessage(error: unknown): string {
  if (isAdminRepositoryError(error)) {
    if (
      error.context?.remoteCode ===
        'STUDIO_MEMBER_PROVISIONING_PARTIAL_FAILURE'
    ) {
      return 'تعذّر التأكد من حالة الحساب. راجع مسؤول النظام قبل أي محاولة أخرى.';
    }
    if (error.code === 'FORBIDDEN' || error.code === 'UNAUTHENTICATED') {
      return 'لا يمكنك إضافة حسابات إلى الاستوديو.';
    }
    if (error.context?.remoteCode === 'AUTH_IDENTITY_ALREADY_EXISTS') {
      return 'هذا البريد مرتبط بحساب دخول موجود. راجع مسؤول النظام لإضافته إلى الاستوديو.';
    }
    if (error.code === 'CONFLICT') {
      return 'هذا البريد مستخدم في الاستوديو. أدخل بريدًا آخر.';
    }
    if (error.code === 'VALIDATION') {
      return 'راجع بيانات الحساب ثم حاول مرة أخرى.';
    }
  }
  return 'تعذّرت إضافة الحساب. حاول مرة أخرى.';
}

function CreateStudioMemberForm() {
  const { createStudioMember, roles } = useStudioMemberDirectory();
  const { viewer } = useAdminAuth();
  const assignableRoles = useMemo(
    () =>
      roles.filter(
        (candidate) =>
          candidate.id !== 'listener' &&
          (candidate.id !== 'admin' || viewer?.role === 'admin'),
      ),
    [roles, viewer?.role],
  );
  const defaultRole =
    assignableRoles.find((candidate) => candidate.id === 'editor')?.id ??
    assignableRoles[0]?.id ??
    '';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<RoleId>(defaultRole);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [localLogin, setLocalLogin] = useState<{
    readonly email: string;
    readonly password: string;
  } | null>(null);

  useEffect(() => {
    if (!assignableRoles.some((candidate) => candidate.id === role)) {
      setRole(defaultRole);
    }
  }, [assignableRoles, defaultRole, role]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedName || !normalizedEmail || !role) {
      setSuccess('');
      setLocalLogin(null);
      setError('أدخل الاسم والبريد الإلكتروني واختر الدور.');
      return;
    }

    setPending(true);
    setError('');
    setSuccess('');
    setLocalLogin(null);
    try {
      const result = await createStudioMember({
        name: normalizedName,
        email: normalizedEmail,
        role,
        locale: 'ar',
      });
      const created = result.member;
      setName('');
      setEmail('');
      setRole(defaultRole);
      setSuccess(`أُضيف حساب ${created.name}.`);
      setLocalLogin(
        result.localDemoCredential
          ? {
              email: created.email,
              password: result.localDemoCredential.password,
            }
          : null,
      );
    } catch (cause) {
      setError(studioMemberCreateErrorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="card users-create-form"
      aria-label="بيانات حساب الاستوديو الجديد"
      onSubmit={(event) => void submit(event)}
    >
      <Field label="الاسم">
        <Input
          name="name"
          autoComplete="name"
          value={name}
          disabled={pending}
          minLength={2}
          maxLength={100}
          required
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      <Field label="البريد الإلكتروني">
        <Input
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          dir="ltr"
          value={email}
          disabled={pending}
          maxLength={254}
          required
          onChange={(event) => setEmail(event.target.value)}
        />
      </Field>
      <Field label="الدور الإداري">
        <Select
          name="role"
          value={role}
          disabled={pending || assignableRoles.length === 0}
          required
          onChange={(event) => setRole(event.target.value)}
        >
          {assignableRoles.map((candidate) => (
            <option value={candidate.id} key={candidate.id}>
              {candidate.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="users-create-form__action">
        <Button
          type="submit"
          variant="primary"
          disabled={pending || assignableRoles.length === 0}
          aria-busy={pending}
        >
          {pending ? 'جارٍ الإضافة…' : 'إضافة الحساب'}
        </Button>
        <div className="users-create-form__feedback" aria-live="polite">
          {error ? (
            <p className="notice notice--error" role="alert">
              {error}
            </p>
          ) : null}
          {success ? (
            <div className="users-create-form__success" role="status">
              <p>{success}</p>
              {localLogin ? (
                <div className="users-create-form__local-login">
                  <p className="users-create-form__local-login-title">
                    بيانات الدخول المحلية
                  </p>
                  <dl>
                    <div>
                      <dt>البريد الإلكتروني</dt>
                      <dd>
                        <bdi dir="ltr">{localLogin.email}</bdi>
                      </dd>
                    </div>
                    <div>
                      <dt>كلمة مرور العرض</dt>
                      <dd>
                        <bdi dir="ltr">{localLogin.password}</bdi>
                      </dd>
                    </div>
                  </dl>
                  <p className="users-create-form__local-login-note">
                    يبقى الحساب متاحًا في نسخة العرض المحلية حتى إعادة تحميل الصفحة.
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </form>
  );
}

export function CreateStudioMemberView() {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="users-page">
      <PageBreadcrumb
        parentLabel="حسابات الاستوديو"
        parentTo={adminPaths.studioMembers}
        current="إضافة حساب إداري"
      />
      <header className="page-header">
        <div className="page-header__title-row">
          <h1 ref={headingRef} tabIndex={-1}>
            إضافة حساب إداري
          </h1>
          <div className="page-header__detail">
            أضف حسابًا للاستوديو وحدد دوره.
          </div>
        </div>
      </header>
      <CreateStudioMemberForm />
    </div>
  );
}

function StudioMemberAccessRow({
  member,
  viewerId,
  viewerRole,
  canManageAccess,
  roles,
}: {
  member: StudioMember;
  viewerId: string;
  viewerRole: RoleId;
  canManageAccess: boolean;
  roles: readonly StudioRole[];
}) {
  const { updateStudioMemberRole } = useStudioMemberDirectory();
  const assignableRoles = roles.filter((candidate) => candidate.id !== 'listener');
  const [role, setRole] = useState<RoleId>(member.role);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const isSelf = member.id === viewerId;
  const isProtectedAssignment = member.role === 'admin' && viewerRole !== 'admin';
  const canEdit = canManageAccess && !isSelf && !isProtectedAssignment;
  const editabilityNote = isSelf
    ? 'لا يمكنك تغيير دور حسابك الحالي.'
    : !canEdit
      ? !canManageAccess
        ? 'يمكنك عرض الدور فقط.'
        : 'لا يمكنك تعديل حساب المشرف العام.'
      : '';
  const noteId = editabilityNote ? `studio-member-role-note-${member.id}` : undefined;

  useEffect(() => setRole(member.role), [member.role]);

  function changeRole(nextRole: RoleId) {
    setRole(nextRole);
    setError('');
    setSuccess('');
  }

  async function saveRole() {
    if (!canEdit || pending || role === member.role) return;
    setPending(true);
    setError('');
    setSuccess('');
    try {
      await updateStudioMemberRole(member.id, role);
      setSuccess(`حُفظ دور ${member.name}.`);
    } catch (cause) {
      setError(studioMemberRoleUpdateErrorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <article className="access-row">
      <div className="row-copy">
        <p className="table-primary">
          {member.name}
          {isSelf ? <span className="access-row__self">حسابك</span> : null}
        </p>
        <p className="user-email" dir="ltr">
          {member.email}
        </p>
      </div>
      <p className="table-secondary">{formatArabicDate(member.joinedAt)}</p>
      {canEdit ? (
        <div className="access-role-editor">
          <Select
            aria-label={`دور ${member.name}`}
            aria-describedby={noteId}
            value={role}
            disabled={pending}
            onChange={(event) => changeRole(event.target.value)}
          >
            {assignableRoles.map((candidate) => (
              <option
                value={candidate.id}
                key={candidate.id}
                disabled={candidate.id === 'admin' && viewerRole !== 'admin'}
              >
                {candidate.name}
              </option>
            ))}
          </Select>
          <Button
            type="button"
            disabled={pending || role === member.role}
            aria-busy={pending}
            aria-describedby={noteId}
            onClick={() => void saveRole()}
          >
            {pending ? 'جارٍ الحفظ…' : 'حفظ الدور'}
          </Button>
        </div>
      ) : (
        <p className="access-role-name">{member.roleName}</p>
      )}
      {editabilityNote ? (
        <p className="access-row__note" id={noteId}>
          {editabilityNote}
        </p>
      ) : null}
      <div className="access-row__feedback" aria-live="polite">
        {error ? (
          <p className="notice notice--error access-row__error" role="alert">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="access-row__success" role="status">
            {success}
          </p>
        ) : null}
      </div>
    </article>
  );
}

export function StudioMembersView() {
  const { data, roles } = useStudioMemberDirectory();
  const { viewer } = useAdminAuth();
  const studioMembers = useMemo(() => {
    const roleOrder = new Map(roles.map((role, index) => [role.id, index]));
    return data.studioMembers.slice().sort(
      (left, right) =>
        (roleOrder.get(left.role) ?? Number.MAX_SAFE_INTEGER) -
          (roleOrder.get(right.role) ?? Number.MAX_SAFE_INTEGER) ||
        left.name.localeCompare(right.name, 'ar'),
    );
  }, [data.studioMembers, roles]);

  if (!viewer) return null;
  const canManageAccess = canManagePage(viewer, 'access');

  return (
    <div className="users-page">
      <PageHeader
        title="حسابات الاستوديو"
        detail="حسابات فريق الإدارة فقط. مستخدمو التطبيق في صفحة المشتركين."
        action={
          canManageAccess ? (
            <Link to={adminPaths.studioMemberNew} className="button button--primary">
              إضافة حساب
            </Link>
          ) : null
        }
      />

      <section
        className="card table-card access-directory-card"
        aria-labelledby="studio-members-directory-title"
      >
        <div className="table-card__header access-directory-header">
          <div>
            <h2 id="studio-members-directory-title">الحسابات الإدارية</h2>
            <p>
              عدد حسابات الاستوديو: {formatArabicInteger(studioMembers.length)}
            </p>
          </div>
        </div>
        <div
          className="access-table-scroll"
          role="region"
          aria-label="قائمة حسابات الاستوديو"
          tabIndex={0}
        >
          <div className="access-table access-table--studio-members">
            <div className="access-table__header" aria-hidden="true">
              <span>الحساب</span>
              <span>أُضيف في</span>
              <span>الدور</span>
            </div>
            {studioMembers.map((member) => (
              <StudioMemberAccessRow
                key={member.id}
                member={member}
                viewerId={viewer.id}
                viewerRole={viewer.role}
                canManageAccess={canManageAccess}
                roles={roles}
              />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
