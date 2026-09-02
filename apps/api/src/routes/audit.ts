import { Hono } from 'hono';
import { requirePermission, type AppEnv } from '../auth';
import { getRepository } from '../repo';

/** Read-only access-change history. Audit records have no mutation endpoint. */
export const auditRoute = new Hono<AppEnv>().get(
  '/',
  requirePermission('access.view'),
  async (c) => {
    const repo = getRepository(c.env);
    const [memberInvitations, memberRoleChanges, roleCreations, rolePermissionChanges] =
      await Promise.all([
        repo.listStudioMemberInvitationAuditLogs(),
        repo.listStudioMemberAccessAuditLogs(),
        repo.listRoleCreatedAuditLogs(),
        repo.listRolePermissionAuditLogs(),
      ]);
    return c.json(
      [...memberInvitations, ...memberRoleChanges, ...roleCreations, ...rolePermissionChanges].sort(
        (left, right) => right.createdAt.localeCompare(left.createdAt),
      ),
    );
  },
);
