import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
import {
  StudioMemberDirectoryContext,
  canManagePage,
  canViewPage,
  type StudioMemberDirectoryContextValue,
} from '@/application';
import {
  FIXTURE_CREATED_ACCOUNT_PASSWORD,
  type AdminRepository,
} from '@/data';
import { AdminRepositoryError } from '@/data/repository-error';
import type { AdminStudioMemberDirectory, AdminViewer, StudioRole } from '@/lib';

export function resolveLocalDemoCredential(
  repositoryKind: AdminRepository['kind'],
): { readonly password: string } | null {
  return repositoryKind === 'fixture'
    ? { password: FIXTURE_CREATED_ACCOUNT_PASSWORD }
    : null;
}

function DirectoryLoadingState() {
  return (
    <section className="embedded-state" aria-busy="true" aria-live="polite">
      <p>جارٍ تحميل بيانات الإدارة…</p>
    </section>
  );
}

function DirectoryErrorState({ onRetry }: { onRetry(): void }) {
  return (
    <section className="embedded-state" role="alert">
      <h1>تعذر تحميل بيانات الإدارة</h1>
      <p>تعذّر تحميل بيانات الإدارة. حاول مرة أخرى.</p>
      <button className="button button--primary" type="button" onClick={onRetry}>
        إعادة المحاولة
      </button>
    </section>
  );
}

function accessForbidden(operation: string): AdminRepositoryError {
  return new AdminRepositoryError({
    code: 'FORBIDDEN',
    operation,
    message: 'Access-management permission is required.',
    retryable: false,
    context: { requiredPermission: 'access.manage' },
  });
}

export function StudioMemberDirectoryProvider({
  children,
  onViewerRoleUpdated,
  repository,
  scope = 'members',
  viewer,
}: {
  children: ReactNode;
  onViewerRoleUpdated?: () => Promise<void>;
  repository: AdminRepository;
  scope?: 'roles' | 'members';
  viewer: AdminViewer;
}) {
  const queryClient = useQueryClient();
  const [activeOperations, setActiveOperations] = useState(0);
  const directoryQueryKey = useMemo(
    () => ['admin-studio', repository.kind, viewer.id, 'studio-members'] as const,
    [repository.kind, viewer.id],
  );
  const roleQueryKey = useMemo(
    () => ['admin-studio', repository.kind, viewer.id, 'roles'] as const,
    [repository.kind, viewer.id],
  );
  const directoryQuery = useQuery({
    queryKey: directoryQueryKey,
    queryFn: () => {
      if (!canViewPage(viewer, 'access')) {
        throw accessForbidden('readStudioMemberDirectory');
      }
      return repository.readStudioMemberDirectory();
    },
    enabled: scope === 'members',
  });
  const roleQuery = useQuery({
    queryKey: roleQueryKey,
    queryFn: () => {
      if (!canViewPage(viewer, 'access')) {
        throw accessForbidden('readRoles');
      }
      return repository.readRoles();
    },
  });

  const runOperation = useCallback(async <T,>(operation: () => Promise<T>): Promise<T> => {
    setActiveOperations((count) => count + 1);
    try {
      return await operation();
    } finally {
      setActiveOperations((count) => Math.max(0, count - 1));
    }
  }, []);

  const value = useMemo<StudioMemberDirectoryContextValue | null>(() => {
    if ((scope === 'members' && !directoryQuery.data) || !roleQuery.data) return null;
    return {
      data: directoryQuery.data ?? { studioMembers: [] },
      roles: roleQuery.data,
      capabilities: repository.capabilities,
      isMutating: activeOperations > 0,
      createStudioMember: (command) =>
        runOperation(async () => {
          if (!canManagePage(viewer, 'access')) {
            throw accessForbidden('createStudioMember');
          }
          const created = await repository.createStudioMember(command);
          queryClient.setQueryData<AdminStudioMemberDirectory>(
            directoryQueryKey,
            (current) =>
              current
                ? { studioMembers: [...current.studioMembers, created] }
                : current,
          );
          await queryClient.invalidateQueries({ queryKey: roleQueryKey, exact: true });
          return {
            member: created,
            localDemoCredential: resolveLocalDemoCredential(repository.kind),
          };
        }),
      updateStudioMemberRole: (memberId, role) =>
        runOperation(async () => {
          if (!canManagePage(viewer, 'access')) {
            throw accessForbidden('updateStudioMemberRole');
          }
          const updated = await repository.updateStudioMemberRole(memberId, role);
          queryClient.setQueryData<AdminStudioMemberDirectory>(directoryQueryKey, (current) =>
            current
              ? {
                  studioMembers: current.studioMembers.map((member) =>
                    member.id === updated.id ? updated : member,
                  ),
                }
              : current,
          );
          await queryClient.invalidateQueries({ queryKey: roleQueryKey, exact: true });
          return updated;
        }),
      createRole: (command) =>
        runOperation(async () => {
          if (!canManagePage(viewer, 'access')) throw accessForbidden('createRole');
          const created = await repository.createRole(command);
          queryClient.setQueryData<StudioRole[]>(roleQueryKey, (current) =>
            current ? [...current, created] : current,
          );
          return created;
        }),
      updateRolePermissions: (role, permissions) =>
        runOperation(async () => {
          if (!canManagePage(viewer, 'access')) {
            throw accessForbidden('updateRolePermissions');
          }
          const updated = await repository.updateRolePermissions(role, permissions);
          queryClient.setQueryData<StudioRole[]>(roleQueryKey, (current) =>
            current
              ? current.map((candidate) =>
                  candidate.id === updated.id ? updated : candidate,
                )
              : current,
          );
          if (updated.id === viewer.role) await onViewerRoleUpdated?.();
          return updated;
        }),
    };
  }, [
    activeOperations,
    directoryQuery.data,
    directoryQueryKey,
    onViewerRoleUpdated,
    roleQuery.data,
    roleQueryKey,
    queryClient,
    repository,
    runOperation,
    scope,
    viewer,
  ]);

  if ((scope === 'members' && directoryQuery.isPending) || roleQuery.isPending) {
    return <DirectoryLoadingState />;
  }
  if ((scope === 'members' && directoryQuery.error) || roleQuery.error) {
    return (
      <DirectoryErrorState
        onRetry={() => {
          if (scope === 'members') void directoryQuery.refetch();
          void roleQuery.refetch();
        }}
      />
    );
  }
  if (!value) return <DirectoryLoadingState />;

  return (
    <StudioMemberDirectoryContext.Provider value={value}>
      {children}
    </StudioMemberDirectoryContext.Provider>
  );
}
