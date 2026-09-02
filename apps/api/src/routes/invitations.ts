import { Hono } from 'hono';
import { createClient } from '@supabase/supabase-js';
import type {
  StudioInvitationErrorCode,
  StudioInvitationErrorResponse,
  StudioInvitationState,
} from '@mukhtalif/types';
import { acceptStudioInvitationSchema } from '@mukhtalif/validation';
import type { AppEnv } from '../auth';
import { getSupabaseCredentials } from '../env';
import { getRepository } from '../repo';

function invitationError(
  error: string,
  code: StudioInvitationErrorCode,
): StudioInvitationErrorResponse {
  return { error, code };
}

/**
 * Studio invitation acceptance and initial password setup.
 *
 * These two routes are reachable by an identity that has a verified Supabase
 * Auth session but is not yet an active Studio operator, so they authenticate
 * on `authUserId` rather than going through `requireStudioAuth`. They never
 * require a Studio permission: the invitee has none until they accept.
 *
 * The service-role credential stays inside the Worker. The browser sends only
 * its bearer token and a chosen password, and receives only its own membership
 * summary back.
 */
export const studioInvitationsRoute = new Hono<AppEnv>()
  .get('/me', async (c) => {
    const authUserId = c.get('authUserId');
    if (!authUserId) return c.json({ error: 'Authentication required' }, 401);

    const member = await getRepository(c.env).getStudioMemberAccessByAuthId(authUserId);
    // An identity with no Studio membership is a valid, non-secret answer: it
    // reveals nothing beyond what the caller already proved about themselves.
    if (!member) {
      const state: StudioInvitationState = { status: 'none' };
      return c.json(state);
    }
    const state: StudioInvitationState = {
      status: member.status,
      email: member.email,
      displayName: member.displayName,
      roleName: member.roleName,
    };
    return c.json(state);
  })
  .post('/accept', async (c) => {
    const authUserId = c.get('authUserId');
    if (!authUserId) return c.json({ error: 'Authentication required' }, 401);

    let payload: unknown;
    try {
      payload = await c.req.json();
    } catch {
      return c.json(invitationError('Invalid acceptance request', 'VALIDATION_ERROR'), 400);
    }
    const parsed = acceptStudioInvitationSchema.safeParse(payload);
    if (!parsed.success) {
      const weak = parsed.error.issues.some((issue) => issue.path[0] === 'password');
      return c.json(
        invitationError(
          weak ? 'Password does not meet the minimum requirements' : 'Invalid acceptance request',
          weak ? 'WEAK_PASSWORD' : 'VALIDATION_ERROR',
        ),
        400,
      );
    }

    const repo = getRepository(c.env);
    const member = await repo.getStudioMemberAccessByAuthId(authUserId);
    if (!member) {
      return c.json(invitationError('No Studio invitation for this identity', 'NO_INVITATION'), 403);
    }
    if (member.status === 'active') {
      return c.json(
        invitationError('This invitation was already accepted', 'ALREADY_ACCEPTED'),
        409,
      );
    }

    const requestId = crypto.randomUUID();
    const credentials = getSupabaseCredentials(c.env);
    if (credentials) {
      // The password is set first. If acceptance then fails the membership stays
      // pending and the request is retryable, whereas flipping first could leave
      // an active member with no password and no way in.
      const supabase = createClient(credentials.url, credentials.serviceRoleKey, {
        auth: { persistSession: false },
      });
      const { error } = await supabase.auth.admin.updateUserById(authUserId, {
        password: parsed.data.password,
      });
      if (error) {
        console.error('Studio invitation password update failed', {
          requestId,
          authCode: error.code,
          authStatus: error.status,
        });
        // Supabase enforces its own password policy on top of ours.
        if (error.code === 'weak_password') {
          return c.json(
            invitationError('Password does not meet the minimum requirements', 'WEAK_PASSWORD'),
            400,
          );
        }
        return c.json(
          invitationError('Could not set the password', 'PASSWORD_UPDATE_FAILED'),
          502,
        );
      }
    }

    const result = await repo.acceptStudioInvitation(authUserId, requestId);
    if (result.status === 'accepted') {
      return c.json({
        status: 'accepted' as const,
        member: {
          id: result.member.id,
          email: result.member.email,
          displayName: result.member.displayName,
          roleName: result.member.roleName,
        },
      });
    }
    if (result.status === 'already_active') {
      return c.json(
        invitationError('This invitation was already accepted', 'ALREADY_ACCEPTED'),
        409,
      );
    }
    if (result.status === 'not_found') {
      return c.json(invitationError('No Studio invitation for this identity', 'NO_INVITATION'), 403);
    }
    return c.json(invitationError('Could not complete the invitation', 'ACCEPTANCE_FAILED'), 500);
  });
