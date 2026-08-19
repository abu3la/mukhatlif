import { STUDIO_PAGE_IDS } from '@mukhtalif/types';
import type {
  AdminViewer,
  PermissionId,
  StudioPageId,
} from '@/lib';

export const STUDIO_PAGE_LABELS = {
  overview: 'نظرة عامة',
  episodes: 'الحلقات',
  shows: 'البرامج',
  guests: 'الضيوف',
  articles: 'المقالات',
  subscribers: 'المشتركون',
  access: 'إدارة الوصول',
} as const satisfies Record<StudioPageId, string>;

export type PermissionSubject =
  | Pick<AdminViewer, 'permissions'>
  | readonly PermissionId[];

function permissionList(subject: PermissionSubject): readonly PermissionId[] {
  return 'permissions' in subject ? subject.permissions : subject;
}

export function hasPermission(
  subject: PermissionSubject,
  permission: PermissionId,
): boolean {
  return permissionList(subject).includes(permission);
}

export function canViewPage(subject: PermissionSubject, page: StudioPageId): boolean {
  return hasPermission(subject, `${page}.view` as PermissionId);
}

export function canManagePage(subject: PermissionSubject, page: StudioPageId): boolean {
  if (page === 'overview') return false;
  return hasPermission(subject, `${page}.manage` as PermissionId);
}

export function hasStudioAccess(subject: PermissionSubject): boolean {
  return STUDIO_PAGE_IDS.some((page) => canViewPage(subject, page));
}

export function firstViewablePage(
  subject: PermissionSubject,
  isAvailable: (page: StudioPageId) => boolean = () => true,
): StudioPageId | null {
  return STUDIO_PAGE_IDS.find(
    (page) => isAvailable(page) && canViewPage(subject, page),
  ) ?? null;
}
