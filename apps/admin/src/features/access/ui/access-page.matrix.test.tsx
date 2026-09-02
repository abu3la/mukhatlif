import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PERMISSION_IDS, type PermissionId } from '@mukhtalif/types';
import { useMemo, useState, type ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AdminAuthContext,
  StudioMemberDirectoryContext,
  type AdminAuthContextValue,
  type StudioMemberDirectoryContextValue,
} from '@/application';
import type { AdminRepositoryCapabilities } from '@/data';
import { demoData, type StudioRole } from '@/lib';
import { RoleDetailsView, RoleNewView, RolesView } from './access-page';

const FIXTURE_CAPABILITIES = {
  'core-dashboard': true,
  'content-mutations': true,
  'subscription-mutations': true,
  'episode-audio-upload': true,
  'guest-management': true,
  'admin-analytics': true,
  'access-management': true,
} as const satisfies AdminRepositoryCapabilities;

const SEEDED_ROLES: readonly StudioRole[] = [
  {
    id: 'admin',
    name: 'المشرف العام',
    description: 'صلاحيات كاملة وثابتة.',
    isSystem: true,
    isProtected: true,
    permissions: [...PERMISSION_IDS],
    memberCount: 1,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  },
  {
    id: 'reviewer',
    name: 'مراجع المحتوى',
    description: 'يراجع المحتوى قبل النشر.',
    isSystem: false,
    isProtected: false,
    permissions: ['episodes.view'],
    memberCount: 3,
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-16T00:00:00.000Z',
  },
];

function TestProviders({
  children,
  initialRoles = SEEDED_ROLES,
  onCreate,
  onUpdate,
}: {
  children: ReactNode;
  initialRoles?: readonly StudioRole[];
  onCreate?(command: {
    name: string;
    description: string;
    permissions: readonly PermissionId[];
  }): Promise<StudioRole>;
  onUpdate?(roleId: string, permissions: readonly PermissionId[]): Promise<StudioRole>;
}) {
  const [roles, setRoles] = useState<StudioRole[]>(initialRoles.map((role) => ({ ...role })));
  const directory = useMemo<StudioMemberDirectoryContextValue>(
    () => ({
      data: { studioMembers: [...demoData.studioMembers] },
      roles,
      capabilities: FIXTURE_CAPABILITIES,
      isMutating: false,
      createStudioMember: vi.fn(async (command) => ({
        member: {
          id: 'studio_member_created' as const,
          name: command.name,
          email: command.email,
          role: command.role,
          roleName: roles.find((role) => role.id === command.role)?.name ?? command.role,
          joinedAt: '2026-08-16T00:00:00.000Z',
        },
        localDemoCredential: null,
      })),
      updateStudioMemberRole: vi.fn(async (memberId, role) => {
        const current = demoData.studioMembers.find((member) => member.id === memberId);
        if (!current) throw new Error('Missing Studio member.');
        return {
          ...current,
          role,
          roleName: roles.find((candidate) => candidate.id === role)?.name ?? role,
        };
      }),
      createRole: async (command) => {
        const created = onCreate
          ? await onCreate(command)
          : {
              id: 'role_created',
              name: command.name,
              description: command.description,
              isSystem: false,
              isProtected: false,
              permissions: [...command.permissions],
              memberCount: 0,
              createdAt: '2026-08-17T00:00:00.000Z',
              updatedAt: '2026-08-17T00:00:00.000Z',
            };
        setRoles((current) => [...current, created]);
        return created;
      },
      updateRolePermissions: async (roleId, permissions) => {
        const current = roles.find((role) => role.id === roleId);
        if (!current) throw new Error('Missing role.');
        const updated = onUpdate
          ? await onUpdate(roleId, permissions)
          : { ...current, permissions: [...permissions] };
        setRoles((items) => items.map((role) => (role.id === roleId ? updated : role)));
        return updated;
      },
    }),
    [onCreate, onUpdate, roles],
  );
  const auth = useMemo<AdminAuthContextValue>(
    () => ({
      status: 'authenticated',
      viewer: { ...demoData.viewer, permissions: [...PERMISSION_IDS] },
      deniedEmail: null,
      error: null,
      isSubmitting: false,
      demoAccounts: [],
      signIn: vi.fn(),
      signOut: vi.fn(),
      retry: vi.fn(),
    }),
    [],
  );
  return (
    <AdminAuthContext.Provider value={auth}>
      <StudioMemberDirectoryContext.Provider value={directory}>
        {children}
      </StudioMemberDirectoryContext.Provider>
    </AdminAuthContext.Provider>
  );
}

describe('dynamic role pages', () => {
  afterEach(cleanup);

  it('shows a role directory with one link per role instead of a matrix', () => {
    const { container } = render(
      <TestProviders>
        <MemoryRouter><RolesView /></MemoryRouter>
      </TestProviders>,
    );

    expect(screen.getByRole('heading', { name: 'الأدوار والصلاحيات' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'دور جديد' })).toHaveAttribute('href', '/roles/new');
    expect(screen.getByRole('link', { name: 'المشرف العام' })).toHaveAttribute('href', '/roles/admin');
    expect(screen.getByRole('link', { name: 'مراجع المحتوى' })).toHaveAttribute('href', '/roles/reviewer');
    expect(screen.getByText('عدد حسابات الاستوديو: 3')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/[٠-٩۰-۹]/);
  });

  it('creates a role from a dedicated breadcrumb page and opens its details', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn(async (command) => ({
      id: 'role_created',
      name: command.name,
      description: command.description,
      isSystem: false,
      isProtected: false,
      permissions: [...command.permissions],
      memberCount: 0,
      createdAt: '2026-08-17T00:00:00.000Z',
      updatedAt: '2026-08-17T00:00:00.000Z',
    }));
    render(
      <TestProviders onCreate={onCreate}>
        <MemoryRouter initialEntries={['/roles/new']}>
          <Routes>
            <Route path="/roles/new" element={<RoleNewView />} />
            <Route path="/roles/:roleId" element={<p>صفحة الدور المنشأ</p>} />
          </Routes>
        </MemoryRouter>
      </TestProviders>,
    );

    expect(screen.getByRole('heading', { name: 'دور جديد' })).toHaveFocus();
    const breadcrumb = screen.getByRole('navigation', { name: 'مسار الصفحة' });
    expect(within(breadcrumb).getByRole('link', { name: 'الأدوار والصلاحيات' })).toHaveAttribute('href', '/roles');
    await user.type(screen.getByRole('textbox', { name: 'اسم الدور' }), 'مراجع البرامج');
    await user.type(screen.getByRole('textbox', { name: /الوصف/ }), 'يراجع البرامج قبل نشرها.');
    const shows = screen.getByRole('group', { name: 'البرامج' });
    await user.click(within(shows).getByRole('radio', { name: 'إدارة' }));
    await user.click(screen.getByRole('button', { name: 'إنشاء الدور' }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith({
      name: 'مراجع البرامج',
      description: 'يراجع البرامج قبل نشرها.',
      permissions: ['shows.view', 'shows.manage'],
    }));
    expect(await screen.findByText('صفحة الدور المنشأ')).toBeInTheDocument();
  });

  it('edits one custom role while keeping the protected administrator read-only', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn(async (_roleId: string, permissions: readonly PermissionId[]) => ({
      ...SEEDED_ROLES[1],
      permissions: [...permissions],
    }));
    const view = render(
      <TestProviders onUpdate={onUpdate}>
        <MemoryRouter initialEntries={['/roles/reviewer']}>
          <Routes><Route path="/roles/:roleId" element={<RoleDetailsView />} /></Routes>
        </MemoryRouter>
      </TestProviders>,
    );

    expect(screen.getByRole('heading', { name: 'مراجع المحتوى' })).toHaveFocus();
    const articles = screen.getByRole('group', { name: 'المقالات' });
    await user.click(within(articles).getByRole('radio', { name: 'عرض فقط' }));
    await user.click(screen.getByRole('button', { name: 'حفظ الصلاحيات' }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('reviewer', [
      'episodes.view',
      'articles.view',
    ]));
    expect(await screen.findByText('حُفظت صلاحيات مراجع المحتوى.')).toHaveAttribute('role', 'status');

    view.unmount();
    render(
      <TestProviders>
        <MemoryRouter initialEntries={['/roles/admin']}>
          <Routes><Route path="/roles/:roleId" element={<RoleDetailsView />} /></Routes>
        </MemoryRouter>
      </TestProviders>,
    );
    expect(screen.getByText('صلاحيات المشرف العام ثابتة ولا يمكن تعديلها.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'حفظ الصلاحيات' })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'الحلقات' })).toBeDisabled();
  });

  it('shows a recoverable not-found state for an unknown role ID', () => {
    render(
      <TestProviders>
        <MemoryRouter initialEntries={['/roles/missing']}>
          <Routes><Route path="/roles/:roleId" element={<RoleDetailsView />} /></Routes>
        </MemoryRouter>
      </TestProviders>,
    );
    expect(screen.getByRole('heading', { name: 'الدور غير موجود' })).toHaveFocus();
    expect(screen.getByRole('link', { name: 'العودة إلى الأدوار' })).toHaveAttribute('href', '/roles');
  });
});
