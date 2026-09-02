import { ApiUnavailableError, NotFoundError, resolveLegacyRedirect } from '@/lib/api';
import { canonicalLegacyRequestPath, legacyRedirectResponse } from '@/lib/legacy-redirect';

export const dynamic = 'force-dynamic';

function plainResponse(status: 404 | 503, message: string): Response {
  return new Response(message, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
      ...(status === 503 ? { 'Retry-After': '60' } : {}),
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  let requestUrl: URL;
  try {
    requestUrl = new URL(request.url);
  } catch {
    return plainResponse(404, 'Not found');
  }

  const sourcePath = canonicalLegacyRequestPath(requestUrl.pathname);
  if (!sourcePath) return plainResponse(404, 'Not found');

  try {
    const resolution = await resolveLegacyRedirect(sourcePath);
    return (
      legacyRedirectResponse(resolution, sourcePath, requestUrl) ??
      plainResponse(404, 'Not found')
    );
  } catch (error) {
    if (error instanceof NotFoundError) return plainResponse(404, 'Not found');
    if (error instanceof ApiUnavailableError) {
      return plainResponse(503, 'Service temporarily unavailable');
    }
    throw error;
  }
}
