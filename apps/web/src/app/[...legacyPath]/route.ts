import { ApiUnavailableError, NotFoundError, resolveLegacyRedirect } from '@/lib/api';
import { publicErrorResponse } from '@/lib/public-error-response';
import { canonicalLegacyRequestPath, legacyRedirectResponse } from '@/lib/legacy-redirect';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  let requestUrl: URL;
  try {
    requestUrl = new URL(request.url);
  } catch {
    return publicErrorResponse(404);
  }

  const sourcePath = canonicalLegacyRequestPath(requestUrl.pathname);
  if (!sourcePath) return publicErrorResponse(404);

  try {
    const resolution = await resolveLegacyRedirect(sourcePath);
    return legacyRedirectResponse(resolution, sourcePath, requestUrl) ?? publicErrorResponse(404);
  } catch (error) {
    if (error instanceof NotFoundError) return publicErrorResponse(404);
    if (error instanceof ApiUnavailableError) {
      return publicErrorResponse(503, requestUrl.pathname + requestUrl.search);
    }
    throw error;
  }
}
