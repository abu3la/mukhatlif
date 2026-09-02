import type { RoleId, SystemRoleId } from './role';

/** Studio pages governed by the role permission matrix. */
export const STUDIO_PAGE_IDS = [
  'overview',
  'episodes',
  'shows',
  'guests',
  'articles',
  'subscribers',
  'forms',
  'access',
] as const;

export type StudioPageId = (typeof STUDIO_PAGE_IDS)[number];
export type PermissionAction = 'view' | 'manage';

export const STUDIO_PAGE_ACTIONS = {
  overview: ['view'],
  episodes: ['view', 'manage'],
  shows: ['view', 'manage'],
  guests: ['view', 'manage'],
  articles: ['view', 'manage'],
  subscribers: ['view', 'manage'],
  forms: ['view', 'manage'],
  access: ['view', 'manage'],
} as const satisfies Readonly<Record<StudioPageId, readonly PermissionAction[]>>;

export type PermissionActionFor<Page extends StudioPageId> =
  (typeof STUDIO_PAGE_ACTIONS)[Page][number];

/**
 * Overview is read-only. Every other page has separate read and management
 * capabilities. Keep this list explicit so API validation and database
 * migrations share a stable, reviewable permission vocabulary.
 */
export const PERMISSION_IDS = [
  'overview.view',
  'episodes.view',
  'episodes.manage',
  'shows.view',
  'shows.manage',
  'guests.view',
  'guests.manage',
  'articles.view',
  'articles.manage',
  'subscribers.view',
  'subscribers.manage',
  'forms.view',
  'forms.manage',
  'access.view',
  'access.manage',
] as const;

export type PermissionId = (typeof PERMISSION_IDS)[number];

/**
 * @deprecated Access permissions may be assigned to custom roles. This empty
 * alias remains only so older integrations compile while moving to `/roles`.
 */
export const ADMIN_RESERVED_PERMISSION_IDS = [] as const satisfies readonly PermissionId[];

export const DEFAULT_ROLE_PERMISSIONS = {
  editor: [
    'overview.view',
    'episodes.view',
    'episodes.manage',
    'shows.view',
    'shows.manage',
    'guests.view',
    'guests.manage',
    'articles.view',
    'articles.manage',
    'forms.view',
    'forms.manage',
  ],
  admin: [...PERMISSION_IDS],
} as const satisfies Readonly<Record<SystemRoleId, readonly PermissionId[]>>;

/** Dynamic matrix keyed by every role ID currently known to the server. */
export type RolePermissionMatrix = Record<RoleId, PermissionId[]>;

export interface RolePermissionSet {
  role: RoleId;
  permissions: PermissionId[];
}

export function isPermissionId(value: string): value is PermissionId {
  return (PERMISSION_IDS as readonly string[]).includes(value);
}

/**
 * Deduplicates permissions, adds the matching view permission for every
 * management permission, and returns the canonical ordering.
 */
export function normalizePermissionIds(permissions: readonly PermissionId[]): PermissionId[] {
  const normalized = new Set<PermissionId>(permissions);

  for (const permission of permissions) {
    if (!permission.endsWith('.manage')) continue;
    const viewPermission = permission.replace(/\.manage$/, '.view');
    if (isPermissionId(viewPermission)) normalized.add(viewPermission);
  }

  return PERMISSION_IDS.filter((permission) => normalized.has(permission));
}

export function createDefaultRolePermissionMatrix(): RolePermissionMatrix {
  return {
    editor: [...DEFAULT_ROLE_PERMISSIONS.editor],
    admin: [...DEFAULT_ROLE_PERMISSIONS.admin],
  };
}
