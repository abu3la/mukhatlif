/** Match the actual Studio host, not Vite PROD (also true on public development). */
export function publicWebsite(hostname: string, productionTarget?: string) {
  if (
    ['studio.mukhtalif-development.workers.dev', 'localhost', '127.0.0.1', '[::1]'].includes(
      hostname,
    )
  ) {
    return { href: 'https://web.mukhtalif-development.workers.dev', label: 'التطوير' };
  }
  if (hostname === 'studio.mukhtalif.net') {
    return productionTarget === 'live'
      ? { href: 'https://mukhtalif.net', label: 'الموقع الأساسي' }
      : { href: 'https://staging.mukhtalif.net', label: 'ما قبل الإطلاق' };
  }
  // Unknown/preview hosts must not silently send an editor to production.
  return null;
}
