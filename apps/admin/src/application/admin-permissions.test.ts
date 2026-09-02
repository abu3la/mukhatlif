import { DEFAULT_ROLE_PERMISSIONS } from '@mukhtalif/types';
import { describe, expect, it } from 'vitest';
import {
  canManagePage,
  canViewPage,
  firstViewablePage,
  hasPermission,
  hasStudioAccess,
} from './admin-permissions';

describe('admin permissions', () => {
  it('checks canonical page permissions instead of inferring access from a role', () => {
    expect(hasPermission(DEFAULT_ROLE_PERMISSIONS.editor, 'episodes.manage')).toBe(true);
    expect(canViewPage(DEFAULT_ROLE_PERMISSIONS.editor, 'episodes')).toBe(true);
    expect(canManagePage(DEFAULT_ROLE_PERMISSIONS.editor, 'episodes')).toBe(true);
    expect(canViewPage([], 'overview')).toBe(false);
    expect(canManagePage(DEFAULT_ROLE_PERMISSIONS.admin, 'overview')).toBe(false);
  });

  it('allows a custom Studio member with one configured view permission into the Studio', () => {
    const permissions = ['forms.view'] as const;

    expect(hasStudioAccess(permissions)).toBe(true);
    expect(canViewPage(permissions, 'forms')).toBe(true);
    expect(canManagePage(permissions, 'forms')).toBe(false);
    expect(firstViewablePage(permissions)).toBe('forms');
  });

  it('selects the first permitted page that the repository supports', () => {
    const permissions = ['guests.view', 'subscribers.view'] as const;

    expect(firstViewablePage(permissions, (page) => page !== 'guests')).toBe(
      'subscribers',
    );
  });
});
