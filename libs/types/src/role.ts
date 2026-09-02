import type { PermissionId } from './permission';

/**
 * Stable built-in role identifiers. Deployments may add any number of custom
 * roles; this tuple is a seed list, not the complete role vocabulary.
 */
export const SYSTEM_ROLE_IDS = ['admin', 'editor'] as const;
export type SystemRoleId = (typeof SYSTEM_ROLE_IDS)[number];

/** Opaque role identifier returned by the API. */
export type RoleId = string;

/** A role as presented and edited in the Studio access directory. */
export interface StudioRole {
  id: RoleId;
  name: string;
  description: string;
  isSystem: boolean;
  isProtected: boolean;
  permissions: PermissionId[];
  memberCount: number;
  /** ISO timestamp */
  createdAt: string;
  /** ISO timestamp */
  updatedAt: string;
}
