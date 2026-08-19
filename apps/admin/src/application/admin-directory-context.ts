import { createContext, useContext } from 'react';
import type {
  AdminRepositoryCapabilities,
  CreateStudioMemberCommand,
} from '@/data';
import type {
  AdminStudioMemberDirectory,
  PermissionId,
  RoleId,
  StudioMember,
  StudioMemberId,
  StudioRole,
} from '@/lib';

export interface StudioMemberDirectoryContextValue {
  readonly data: AdminStudioMemberDirectory;
  readonly roles: readonly StudioRole[];
  readonly capabilities: AdminRepositoryCapabilities;
  readonly isMutating: boolean;
  createStudioMember(
    command: CreateStudioMemberCommand,
  ): Promise<CreateStudioMemberResult>;
  updateStudioMemberRole(
    memberId: StudioMemberId,
    role: RoleId,
  ): Promise<StudioMember>;
  createRole(command: {
    readonly name: string;
    readonly description: string;
    readonly permissions: readonly PermissionId[];
  }): Promise<StudioRole>;
  updateRolePermissions(
    role: RoleId,
    permissions: readonly PermissionId[],
  ): Promise<StudioRole>;
}

export interface CreateStudioMemberResult {
  readonly member: StudioMember;
  readonly localDemoCredential: {
    readonly password: string;
  } | null;
}

export const StudioMemberDirectoryContext =
  createContext<StudioMemberDirectoryContextValue | null>(null);

export function useStudioMemberDirectory(): StudioMemberDirectoryContextValue {
  const context = useContext(StudioMemberDirectoryContext);
  if (!context) {
    throw new Error(
      'useStudioMemberDirectory must be used inside StudioMemberDirectoryProvider.',
    );
  }
  return context;
}
