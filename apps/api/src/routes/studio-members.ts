import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type {
  StudioMemberInvitationErrorCode,
  StudioMemberInvitationErrorResponse,
} from '@mukhtalif/types';
import { toPaginatedList } from '@mukhtalif/types';
import {
  inviteStudioMemberSchema,
  isPaginatedRequest,
  listQuerySchema,
  resolveListQuery,
  updateStudioMemberRoleSchema,
} from '@mukhtalif/validation';
import { requirePermission, type AppEnv } from '../auth';
import { ApiConfigurationError, getStudioInviteRedirectUrl, getSupabaseCredentials } from '../env';
import { getRepository } from '../repo';

function invitationError(
  error: string,
  code: StudioMemberInvitationErrorCode,
): StudioMemberInvitationErrorResponse {
  return { error, code };
}

/** Studio-only directory, invitation, and role assignment. */
export const studioMembersRoute = new Hono<AppEnv>()
  .get(
    '/',
    requirePermission('access.view'),
    zValidator('query', listQuerySchema),
    async (c) => {
      const input = c.req.valid('query');
      const repo = getRepository(c.env);
      if (!isPaginatedRequest(input)) return c.json(await repo.listStudioMembers());
      const query = resolveListQuery(input);
      return c.json(toPaginatedList(await repo.listStudioMembersPage(query), query));
    },
  )
  .post('/', requirePermission('access.manage'), async (c) => {
    let payload: unknown;
    try {
      payload = await c.req.json();
    } catch {
      return c.json(invitationError('Invalid Studio invitation request', 'VALIDATION_ERROR'), 400);
    }
    const parsed = inviteStudioMemberSchema.safeParse(payload);
    if (!parsed.success) {
      return c.json(invitationError('Invalid Studio invitation request', 'VALIDATION_ERROR'), 400);
    }

    const repo = getRepository(c.env);
    const selectedRole = await repo.getRole(parsed.data.role);
    if (!selectedRole) {
      return c.json(invitationError('The selected role does not exist', 'ROLE_NOT_FOUND'), 422);
    }
    if (selectedRole.isProtected && c.get('studioMember')!.role !== 'admin') {
      return c.json(
        invitationError('Only an administrator can assign the protected role', 'PROTECTED_ROLE'),
        403,
      );
    }

    let redirectTo: string | undefined;
    try {
      if (getSupabaseCredentials(c.env)) {
        redirectTo = getStudioInviteRedirectUrl(c.env) ?? undefined;
        if (!redirectTo) {
          return c.json(
            invitationError(
              'Studio invitation service is not configured',
              'AUTH_PROVISIONING_UNAVAILABLE',
            ),
            503,
          );
        }
      }
    } catch (error) {
      if (!(error instanceof ApiConfigurationError)) throw error;
      return c.json(
        invitationError(
          'Studio invitation service is not configured',
          'AUTH_PROVISIONING_UNAVAILABLE',
        ),
        503,
      );
    }

    const result = await repo.inviteStudioMember(
      c.get('studioMember')!.id,
      parsed.data,
      crypto.randomUUID(),
      redirectTo,
    );

    if (result.status === 'created') return c.json(result.member, 201);
    if (result.status === 'forbidden') {
      return c.json(invitationError('Permission required: access.manage', 'ADMIN_REQUIRED'), 403);
    }
    if (result.status === 'role_not_found') {
      return c.json(invitationError('The selected role does not exist', 'ROLE_NOT_FOUND'), 422);
    }
    if (result.status === 'protected_role') {
      return c.json(
        invitationError('Only an administrator can assign the protected role', 'PROTECTED_ROLE'),
        403,
      );
    }
    if (result.status === 'duplicate_email') {
      return c.json(
        invitationError('A Studio member with this email already exists', 'EMAIL_ALREADY_EXISTS'),
        409,
      );
    }
    if (result.status === 'auth_identity_exists') {
      return c.json(
        invitationError(
          'This email already has an Auth identity; Studio membership was not changed',
          'AUTH_IDENTITY_ALREADY_EXISTS',
        ),
        409,
      );
    }
    if (result.status === 'unavailable') {
      return c.json(
        invitationError(
          'Studio invitation service is not configured',
          'AUTH_PROVISIONING_UNAVAILABLE',
        ),
        503,
      );
    }
    if (result.status === 'invite_failed') {
      return c.json(
        invitationError('The invitation email could not be delivered', 'INVITE_DELIVERY_FAILED'),
        422,
      );
    }
    if (result.status === 'provision_failed') {
      return c.json(
        invitationError(
          'The Studio member could not be provisioned',
          'STUDIO_MEMBER_PROVISIONING_FAILED',
        ),
        422,
      );
    }
    return c.json(
      invitationError(
        'Studio membership provisioning needs administrator review',
        'STUDIO_MEMBER_PROVISIONING_PARTIAL_FAILURE',
      ),
      500,
    );
  })
  .patch(
    '/:id/role',
    requirePermission('access.manage'),
    zValidator('json', updateStudioMemberRoleSchema),
    async (c) => {
      const result = await getRepository(c.env).changeStudioMemberRole(
        c.get('studioMember')!.id,
        c.req.param('id'),
        c.req.valid('json').role,
        crypto.randomUUID(),
      );

      if (result.status === 'not_found') return c.json({ error: 'Studio member not found' }, 404);
      if (result.status === 'forbidden') {
        return c.json({ error: 'Permission required: access.manage' }, 403);
      }
      if (result.status === 'role_not_found') {
        return c.json({ error: 'The selected role does not exist' }, 422);
      }
      if (result.status === 'protected_role') {
        return c.json({ error: 'Only an administrator can change protected access' }, 403);
      }
      if (result.status === 'self_demotion') {
        return c.json({ error: 'Administrators cannot change their own access role' }, 409);
      }
      if (result.status === 'last_admin') {
        return c.json({ error: 'At least one administrator must remain' }, 409);
      }
      if (result.status === 'updated' || result.status === 'unchanged') {
        return c.json(result.member);
      }
      return c.json({ error: 'Studio role change failed' }, 500);
    },
  );
