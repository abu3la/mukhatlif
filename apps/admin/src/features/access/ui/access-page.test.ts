import { describe, expect, it } from 'vitest';
import { AdminRepositoryError } from '@/data';
import {
  accessPermissionUpdateErrorMessage,
} from './access-page';
import { studioMemberRoleUpdateErrorMessage } from './users-page';

describe('access update messages', () => {
  it('explains that the final administrator cannot be demoted', () => {
    const error = new AdminRepositoryError({
      code: 'CONFLICT',
      operation: 'updateStudioMemberRole',
      message: 'last administrator',
      status: 409,
      retryable: false,
    });

    expect(studioMemberRoleUpdateErrorMessage(error)).toBe(
      'لا يمكن تغيير دور المشرف العام الوحيد.',
    );
  });

  it('gives a specific recovery step for a stale permission matrix', () => {
    const error = new AdminRepositoryError({
      code: 'CONFLICT',
      operation: 'updateRolePermissions',
      message: 'stale permissions',
      status: 409,
      retryable: false,
    });

    expect(accessPermissionUpdateErrorMessage(error)).toBe(
      'تغيّر الدور في جلسة أخرى. حدّث الصفحة ثم حاول مرة أخرى.',
    );
  });
});
