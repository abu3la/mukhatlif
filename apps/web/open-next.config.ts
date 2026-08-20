import { defineCloudflareConfig } from '@opennextjs/cloudflare';

/**
 * Cloudflare Workers adapter for the public site.
 *
 * No incremental cache is configured yet: the site's reads already carry
 * `next: { revalidate: 60 }` and a single Worker isolate is enough for the
 * current traffic. Adding an R2 or KV cache is a later, measured decision —
 * wiring one now would add a binding nobody has validated against real load.
 */
export default defineCloudflareConfig();
