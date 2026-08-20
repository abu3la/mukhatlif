/**
 * Which client product a request came from.
 *
 * This is not an authorization input — permissions and membership decide what a
 * caller may do. The surface answers a different question: *which product* is
 * asking. It exists so that:
 *
 *   - a namespace can refuse a caller that clearly does not belong to it, which
 *     catches a misconfigured client long before it reaches a permission check;
 *   - per-surface behaviour and observability have one declared vocabulary
 *     instead of sniffing user agents.
 *
 * A native mobile app sends no Origin header, so CORS cannot distinguish it.
 * An explicit header can.
 */
export const CLIENT_SURFACES = ['web', 'mobile', 'studio'] as const;
export type ClientSurface = (typeof CLIENT_SURFACES)[number];

/** Header carrying the surface. Must be added to the CORS allowlist. */
export const CLIENT_SURFACE_HEADER = 'X-Client-Surface';

export function isClientSurface(value: string): value is ClientSurface {
  return (CLIENT_SURFACES as readonly string[]).includes(value);
}

/**
 * Which surfaces each API namespace serves.
 *
 * `studio` is the operator product; `web` and `mobile` are the listener
 * products. The public catalogue serves all three because the Studio previews
 * published content too.
 */
export const NAMESPACE_SURFACES = {
  /** Anonymous published catalogue. */
  public: CLIENT_SURFACES,
  /** Signed-in listener features. */
  app: ['web', 'mobile'],
  /** Operator dashboard. */
  studio: ['studio'],
} as const satisfies Readonly<Record<string, readonly ClientSurface[]>>;

export type ApiNamespace = keyof typeof NAMESPACE_SURFACES;
