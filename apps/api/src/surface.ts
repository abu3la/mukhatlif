import type { MiddlewareHandler } from 'hono';
import {
  CLIENT_SURFACES,
  CLIENT_SURFACE_HEADER,
  NAMESPACE_SURFACES,
  isClientSurface,
  type ApiNamespace,
  type ClientSurface,
} from '@mukhtalif/types';
import type { AppEnv } from './auth';

/**
 * Resolves the declaring client surface once per request.
 *
 * An absent header resolves to null rather than a default. That keeps the
 * middleware backward compatible with clients written before the header
 * existed, and it keeps "did not say" distinguishable from "said web", which
 * matters when reading logs.
 *
 * A present but unrecognised value is rejected outright. Silently ignoring a
 * typo would let a client believe it had declared a surface it had not, and the
 * namespace guard below would then wave it through.
 */
export const resolveClientSurface: MiddlewareHandler<AppEnv> = async (c, next) => {
  const header = c.req.header(CLIENT_SURFACE_HEADER)?.trim().toLowerCase();
  if (!header) {
    c.set('clientSurface', null);
    await next();
    return;
  }
  if (!isClientSurface(header)) {
    return c.json(
      {
        error: `${CLIENT_SURFACE_HEADER} must be one of: ${CLIENT_SURFACES.join(', ')}`,
        code: 'UNKNOWN_CLIENT_SURFACE',
      },
      400,
    );
  }
  c.set('clientSurface', header);
  await next();
};

/**
 * Refuses a caller whose declared surface does not belong to this namespace.
 *
 * This is defence in depth, not the authorization boundary: membership and
 * permissions already decide access, and this runs before them. Its value is
 * catching a client wired to the wrong namespace immediately and unambiguously,
 * instead of surfacing as a confusing permission error.
 *
 * A caller that declares nothing is allowed through, so the header can be
 * adopted by each client independently without a coordinated release.
 */
export function requireNamespaceSurface(namespace: ApiNamespace): MiddlewareHandler<AppEnv> {
  const allowed = NAMESPACE_SURFACES[namespace] as readonly ClientSurface[];
  return async (c, next) => {
    const surface = c.get('clientSurface');
    if (surface && !allowed.includes(surface)) {
      return c.json(
        {
          error: `The ${surface} client may not call ${namespace} endpoints`,
          code: 'SURFACE_NOT_ALLOWED',
        },
        403,
      );
    }
    await next();
  };
}
