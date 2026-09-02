import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useMemo, useState, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AdminAuthContext,
  StudioMemberDirectoryContext,
  type AdminAuthContextValue,
  type StudioMemberDirectoryContextValue,
} from '@/application';
import { AdminRepositoryError, type CreateStudioMemberCommand } from '@/data';
import {
  demoData,
  type PermissionId,
  type StudioMember,
  type StudioRole,
} from '@/lib';
import {
  CreateStudioMemberView,
  StudioMembersView,
  studioMemberCreateErrorMessage,
} from './users-page';

const CAPABILITIES = {
  'core-dashboard': true,
  'content-mutations': true,
  'subscription-mutations': true,
  'episode-audio-upload': true,
  'guest-management': true,
  'admin-analytics': true,
  'access-management': true,
} as const;

const ROLES: readonly StudioRole[] = [
  {
    id: 'admin',
    name: 'المشرف العام',
    description: 'صلاحيات الإدارة الكاملة.',
    isSystem: true,
    isProtected: true,
    permissions: [...demoData.viewer.permissions],
    memberCount: 1,
    createdAt: demoData.asOf,
    updatedAt: demoData.asOf,
  },
  {
    id: 'editor',
    name: 'مدير المحتوى',
    description: 'إدارة المحتوى.',
    isSystem: true,
    isProtected: false,
    permissions: ['episodes.view'],
    memberCount: 1,
    createdAt: demoData.asOf,
    updatedAt: demoData.asOf,
  },
  {
    id: 'reviewer',
    name: 'مراجع المحتوى',
    description: 'مراجعة المحتوى.',
    isSystem: false,
    isProtected: false,
    permissions: ['articles.view'],
    memberCount: 0,
    createdAt: demoData.asOf,
    updatedAt: demoData.asOf,
  },
];

const CREATED_MEMBER: StudioMember = {
  id: 'studio_member_created',
  name: 'سارة الحربي',
  email: 'sarah@example.com',
  role: 'editor',
  roleName: 'مدير المحتوى',
  joinedAt: '2026-08-17T00:00:00.000Z',
};

function createAuthValue(permissions: PermissionId[]): AdminAuthContextValue {
  return {
    status: 'authenticated',
    viewer: { ...demoData.viewer, permissions },
    deniedEmail: null,
    error: null,
    isSubmitting: false,
    demoAccounts: [],
    signIn: vi.fn(async () => undefined),
    signOut: vi.fn(async () => undefined),
    retry: vi.fn(async () => undefined),
  };
}

function TestProviders({
  children,
  permissions = [...demoData.viewer.permissions],
  onCreate,
}: {
  children: ReactNode;
  permissions?: PermissionId[];
  onCreate?(command: CreateStudioMemberCommand): Promise<StudioMember>;
}) {
  const [members, setMembers] = useState<StudioMember[]>([
    ...demoData.studioMembers,
  ]);
  const directory = useMemo<StudioMemberDirectoryContextValue>(
    () => ({
      data: { studioMembers: members },
      roles: ROLES,
      capabilities: CAPABILITIES,
      isMutating: false,
      createStudioMember: async (command) => {
        const created = onCreate ? await onCreate(command) : CREATED_MEMBER;
        setMembers((current) => [...current, created]);
        return {
          member: created,
          localDemoCredential: { password: 'MukhtalifDemo2026!' },
        };
      },
      updateStudioMemberRole: async (memberId, role) => {
        const current = members.find((member) => member.id === memberId);
        if (!current) throw new Error('Missing Studio member.');
        const updated = {
          ...current,
          role,
          roleName: ROLES.find((candidate) => candidate.id === role)?.name ?? role,
        };
        setMembers((items) =>
          items.map((member) => (member.id === memberId ? updated : member)),
        );
        return updated;
      },
      createRole: vi.fn(),
      updateRolePermissions: vi.fn(),
    }),
    [members, onCreate],
  );

  return (
    <MemoryRouter>
      <AdminAuthContext.Provider value={createAuthValue(permissions)}>
        <StudioMemberDirectoryContext.Provider value={directory}>
          {children}
        </StudioMemberDirectoryContext.Provider>
      </AdminAuthContext.Provider>
    </MemoryRouter>
  );
}

describe('Studio account pages', () => {
  afterEach(cleanup);

  it('lists Studio accounts only and never app users', () => {
    const { container } = render(
      <TestProviders>
        <StudioMembersView />
      </TestProviders>,
    );

    expect(screen.getByRole('heading', { name: 'حسابات الاستوديو' })).toBeInTheDocument();
    expect(screen.getByText('admin@demo.mukhtalif.local')).toBeInTheDocument();
    expect(screen.getByText('editor@demo.mukhtalif.local')).toBeInTheDocument();
    expect(screen.queryByText('listener@demo.mukhtalif.local')).not.toBeInTheDocument();
    expect(screen.getByText('عدد حسابات الاستوديو: 2')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/[٠-٩۰-۹]/);
  });

  it('links to a dedicated account-creation page', () => {
    render(
      <TestProviders>
        <StudioMembersView />
      </TestProviders>,
    );

    expect(screen.getByRole('link', { name: 'إضافة حساب' })).toHaveAttribute(
      'href',
      '/users/new',
    );
  });

  it('renders a semantic breadcrumb for the new Studio account', () => {
    render(
      <TestProviders>
        <CreateStudioMemberView />
      </TestProviders>,
    );

    const breadcrumb = screen.getByRole('navigation', { name: 'مسار الصفحة' });
    expect(
      within(breadcrumb).getByRole('link', { name: 'حسابات الاستوديو' }),
    ).toHaveAttribute('href', '/users');
    expect(screen.getByRole('heading', { name: 'إضافة حساب إداري' })).toHaveFocus();
  });

  it('creates a Studio account with a real Studio role and shows local credentials', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn(async () => CREATED_MEMBER);
    render(
      <TestProviders onCreate={onCreate}>
        <CreateStudioMemberView />
      </TestProviders>,
    );

    await user.type(screen.getByRole('textbox', { name: 'الاسم' }), '  سارة الحربي  ');
    await user.type(
      screen.getByRole('textbox', { name: 'البريد الإلكتروني' }),
      'SARAH@EXAMPLE.COM',
    );
    const roleSelect = screen.getByRole('combobox', { name: 'الدور الإداري' });
    expect(within(roleSelect).queryByRole('option', { name: 'المستمع' })).not.toBeInTheDocument();
    await user.selectOptions(roleSelect, 'editor');
    await user.click(screen.getByRole('button', { name: 'إضافة الحساب' }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith({
        name: 'سارة الحربي',
        email: 'sarah@example.com',
        role: 'editor',
        locale: 'ar',
      }),
    );
    expect(await screen.findByText('أُضيف حساب سارة الحربي.')).toBeInTheDocument();
    expect(screen.getByText('MukhtalifDemo2026!')).toBeInTheDocument();
  });

  it('updates another Studio member role without account-link gating', async () => {
    const user = userEvent.setup();
    render(
      <TestProviders>
        <StudioMembersView />
      </TestProviders>,
    );

    const editorRow = screen.getByText('ليان السبيعي').closest('article');
    expect(editorRow).not.toBeNull();
    const roleSelect = within(editorRow!).getByRole('combobox', {
      name: 'دور ليان السبيعي',
    });
    await user.selectOptions(roleSelect, 'reviewer');
    await user.click(within(editorRow!).getByRole('button', { name: 'حفظ الدور' }));
    expect(await within(editorRow!).findByText('حُفظ دور ليان السبيعي.')).toBeInTheDocument();
    expect(screen.queryByText(/ربط حساب/)).not.toBeInTheDocument();
  });

  it('hides account creation when access management is unavailable', () => {
    render(
      <TestProviders permissions={['access.view']}>
        <StudioMembersView />
      </TestProviders>,
    );

    expect(screen.queryByRole('link', { name: 'إضافة حساب' })).not.toBeInTheDocument();
  });

  it('maps an existing Auth identity without calling it a duplicate Studio member', () => {
    const error = new AdminRepositoryError({
      code: 'CONFLICT',
      operation: 'createStudioMember',
      message: 'Auth identity already exists.',
      retryable: false,
      context: { remoteCode: 'AUTH_IDENTITY_ALREADY_EXISTS' },
    });

    expect(studioMemberCreateErrorMessage(error)).toBe(
      'هذا البريد مرتبط بحساب دخول موجود. راجع مسؤول النظام لإضافته إلى الاستوديو.',
    );
  });
});
