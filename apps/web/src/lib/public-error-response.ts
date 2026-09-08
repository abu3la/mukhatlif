/** Branded route-handler fallback; never reflects error details or an untrusted destination. */
function escapeAttribute(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  );
}
function localRetryPath(path: string): string {
  try {
    const base = 'https://mukhtalif.invalid';
    const url = new URL(path, base);
    return url.origin === base ? url.pathname + url.search : '/';
  } catch {
    return '/';
  }
}

export function publicErrorResponse(status: 404 | 503, retryPath = '/'): Response {
  const missing = status === 404;
  const title = missing ? 'هذه الصفحة ليست هنا.' : 'تعذّر تحميل الصفحة الآن.';
  const description = missing
    ? 'ربما تغيّر الرابط أو حُذفت الصفحة. ابحث عمّا يهمك أو عد إلى الرئيسية.'
    : 'لم نتمكن من الوصول إلى المحتوى. حاول مرة أخرى بعد قليل.';
  const href = missing ? '/' : escapeAttribute(localRetryPath(retryPath));
  const action = missing ? 'العودة للرئيسية' : 'حاول مرة أخرى';
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title} | مختلف</title><link rel="stylesheet" href="/error-state.css"></head><body><main class="error-page"><a class="error-brand" href="/" aria-label="مختلف، الرئيسية"><img class="error-logo-light" src="/handoff/mukhtalif-logo.svg" width="122" height="41" alt="مختلف"><img class="error-logo-dark" src="/handoff/mukhtalif-logo-white.svg" width="122" height="41" alt="مختلف"></a><section aria-labelledby="error-title"><p class="error-code"><bdi>${status}</bdi></p><h1 id="error-title">${title}</h1><p class="error-description">${description}</p><div class="error-actions"><a class="error-primary" href="${href}">${action}</a><a class="error-search" href="/search">ابحث في مختلف</a></div></section></main></body></html>`;
  return new Response(html, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/html; charset=utf-8',
      ...(status === 503 ? { 'Retry-After': '60' } : {}),
    },
  });
}
