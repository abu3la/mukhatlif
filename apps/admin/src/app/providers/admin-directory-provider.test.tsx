import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useStudioMemberDirectory } from '@/application';
import {
  FIXTURE_CREATED_ACCOUNT_PASSWORD,
  createFixtureAdminRepository,
} from '@/data';
import { demoData, type AdminViewer } from '@/lib';
import {
  StudioMemberDirectoryProvider,
  resolveLocalDemoCredential,
} from './admin-directory-provider';

const ADMIN_VIEWER: AdminViewer = {
  ...demoData.viewer,
  permissions: [...demoData.viewer.permissions],
};

function Probe() {
  const directory = useStudioMemberDirectory();
  const [errorCode, setErrorCode] = useState('');

  return (
    <div>
      <output aria-label="عدد حسابات الاستوديو">
        {directory.data.studioMembers.length}
      </output>
      <button
        type="button"
        onClick={() => {
          void directory
            .createStudioMember({
              name: 'ليان الحربي',
              email: 'lian.harbi@example.com',
              role: 'editor',
              locale: 'ar',
            })
            .catch((error: unknown) => {
              if (
                error &&
                typeof error === 'object' &&
                'code' in error &&
                typeof error.code === 'string'
              ) {
                setErrorCode(error.code);
              }
            });
        }}
      >
        إضافة حساب
      </button>
      {errorCode ? <output aria-label="رمز الخطأ">{errorCode}</output> : null}
    </div>
  );
}

function RolePermissionProbe() {
  const directory = useStudioMemberDirectory();

  return (
    <button
      type="button"
      onClick={() => {
        void directory.updateRolePermissions('editor', [
          'episodes.view',
          'access.view',
          'access.manage',
        ]);
      }}
    >
      تحديث صلاحيات الدور الحالي
    </button>
  );
}

function Providers({
  children,
  onViewerRoleUpdated,
  viewer,
  repository,
  queryClient,
  scope,
}: {
  children: ReactNode;
  onViewerRoleUpdated?: () => Promise<void>;
  viewer: AdminViewer;
  repository: ReturnType<typeof createFixtureAdminRepository>;
  queryClient: QueryClient;
  scope?: 'roles' | 'members';
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <StudioMemberDirectoryProvider
        repository={repository}
        viewer={viewer}
        scope={scope}
        onViewerRoleUpdated={onViewerRoleUpdated}
      >
        {children}
      </StudioMemberDirectoryProvider>
    </QueryClientProvider>
  );
}

describe('StudioMemberDirectoryProvider account creation', () => {
  afterEach(cleanup);

  it('never exposes a local password for the Hono repository', () => {
    expect(resolveLocalDemoCredential('hono')).toBeNull();
    expect(resolveLocalDemoCredential('fixture')).toEqual({
      password: FIXTURE_CREATED_ACCOUNT_PASSWORD,
    });
  });

  it('updates the cached access directory after a successful creation', async () => {
    const user = userEvent.setup();
    const repository = createFixtureAdminRepository({
      now: () => new Date('2026-08-16T10:00:00.000Z'),
    });
    const readDirectory = vi.spyOn(repository, 'readStudioMemberDirectory');
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <Providers
        viewer={ADMIN_VIEWER}
        repository={repository}
        queryClient={queryClient}
      >
        <Probe />
      </Providers>,
    );

    const initialCount = demoData.studioMembers.length;
    expect(await screen.findByLabelText('عدد حسابات الاستوديو')).toHaveTextContent(
      String(initialCount),
    );
    await user.click(screen.getByRole('button', { name: 'إضافة حساب' }));

    await waitFor(() =>
      expect(screen.getByLabelText('عدد حسابات الاستوديو')).toHaveTextContent(
        String(initialCount + 1),
      ),
    );
    expect(readDirectory).toHaveBeenCalledOnce();
  });

  it('blocks the mutation before the repository when access.manage is absent', async () => {
    const user = userEvent.setup();
    const repository = createFixtureAdminRepository();
    const createStudioMember = vi.spyOn(repository, 'createStudioMember');
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const viewer: AdminViewer = {
      ...ADMIN_VIEWER,
      role: 'editor',
      permissions: ['access.view'],
    };

    render(
      <Providers viewer={viewer} repository={repository} queryClient={queryClient}>
        <Probe />
      </Providers>,
    );

    await screen.findByLabelText('عدد حسابات الاستوديو');
    await user.click(screen.getByRole('button', { name: 'إضافة حساب' }));

    expect(await screen.findByLabelText('رمز الخطأ')).toHaveTextContent('FORBIDDEN');
    expect(createStudioMember).not.toHaveBeenCalled();
  });

  it('refreshes the authenticated viewer after changing permissions for their role', async () => {
    const user = userEvent.setup();
    const repository = createFixtureAdminRepository();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const onViewerRoleUpdated = vi.fn(async () => undefined);
    const viewer: AdminViewer = {
      ...ADMIN_VIEWER,
      role: 'editor',
      roleName: 'مدير المحتوى',
      permissions: ['access.view', 'access.manage'],
    };

    render(
      <Providers
        viewer={viewer}
        repository={repository}
        queryClient={queryClient}
        scope="roles"
        onViewerRoleUpdated={onViewerRoleUpdated}
      >
        <RolePermissionProbe />
      </Providers>,
    );

    await user.click(
      await screen.findByRole('button', { name: 'تحديث صلاحيات الدور الحالي' }),
    );

    await waitFor(() => expect(onViewerRoleUpdated).toHaveBeenCalledOnce());
  });
});
