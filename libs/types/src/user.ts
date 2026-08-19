import type { PermissionId } from './permission';
import type { RoleId } from './role';

export type UserLocale = 'ar' | 'en';

/**
 * A Mukhtalif application user. Application users may listen, follow shows,
 * and hold subscriptions. They never carry Studio roles or permissions.
 */
export interface User {
  id: string;
  email: string;
  displayName: string;
  locale: UserLocale;
  /** ISO timestamp */
  createdAt: string;
}

/** Subscriber-directory projection. Auth linkage is deliberately server-only. */
export type SubscriberUser = User;

/** App profile returned by `/me`. Studio permissions are never added here. */
export type AuthenticatedUser = User;

/**
 * A member of the private Studio administration workspace. This is a distinct
 * entity from an application User even when both rows link to the same Auth ID.
 */
export interface StudioMember {
  id: string;
  email: string;
  displayName: string;
  role: RoleId;
  roleName: string;
  locale: UserLocale;
  /** ISO timestamp */
  createdAt: string;
}

/** Studio directory projection. The immutable Auth UUID stays server-only. */
export interface StudioMemberAccess extends StudioMember {
  authLinked: boolean;
}

/** Authenticated Studio identity returned by `/studio/me`. */
export interface AuthenticatedStudioMember extends StudioMember {
  permissions: PermissionId[];
}

export const STUDIO_MEMBER_INVITATION_AUDIT_ACTION = 'studio_member.invited' as const;

export interface StudioMemberInvitationAuditLog {
  id: string;
  actorStudioMemberId: string;
  action: typeof STUDIO_MEMBER_INVITATION_AUDIT_ACTION;
  targetStudioMemberId: string;
  invitedEmail: string;
  assignedRole: RoleId;
  locale: UserLocale;
  requestId: string;
  /** ISO timestamp */
  createdAt: string;
}

export const STUDIO_MEMBER_INVITATION_ERROR_CODES = [
  'VALIDATION_ERROR',
  'ADMIN_REQUIRED',
  'ROLE_NOT_FOUND',
  'PROTECTED_ROLE',
  'EMAIL_ALREADY_EXISTS',
  'AUTH_IDENTITY_ALREADY_EXISTS',
  'AUTH_PROVISIONING_UNAVAILABLE',
  'INVITE_DELIVERY_FAILED',
  'STUDIO_MEMBER_PROVISIONING_FAILED',
  'STUDIO_MEMBER_PROVISIONING_PARTIAL_FAILURE',
] as const;

export type StudioMemberInvitationErrorCode =
  (typeof STUDIO_MEMBER_INVITATION_ERROR_CODES)[number];

export interface StudioMemberInvitationErrorResponse {
  error: string;
  code: StudioMemberInvitationErrorCode;
}

export const STUDIO_MEMBER_ACCESS_AUDIT_ACTION = 'studio_member.role_changed' as const;

export interface StudioMemberAccessAuditLog {
  id: string;
  actorStudioMemberId: string;
  action: typeof STUDIO_MEMBER_ACCESS_AUDIT_ACTION;
  targetStudioMemberId: string;
  previousRole: RoleId;
  newRole: RoleId;
  requestId: string;
  /** ISO timestamp */
  createdAt: string;
}

export const ROLE_PERMISSION_AUDIT_ACTION = 'role.permissions_changed' as const;
export const ROLE_CREATED_AUDIT_ACTION = 'role.created' as const;

export interface RoleCreatedAuditLog {
  id: string;
  actorStudioMemberId: string;
  action: typeof ROLE_CREATED_AUDIT_ACTION;
  targetRole: RoleId;
  roleName: string;
  initialPermissions: PermissionId[];
  requestId: string;
  /** ISO timestamp */
  createdAt: string;
}

export interface RolePermissionAuditLog {
  id: string;
  actorStudioMemberId: string;
  action: typeof ROLE_PERMISSION_AUDIT_ACTION;
  targetRole: RoleId;
  previousPermissions: PermissionId[];
  newPermissions: PermissionId[];
  requestId: string;
  /** ISO timestamp */
  createdAt: string;
}

export type AccessAuditLog =
  | StudioMemberAccessAuditLog
  | RoleCreatedAuditLog
  | RolePermissionAuditLog
  | StudioMemberInvitationAuditLog;
