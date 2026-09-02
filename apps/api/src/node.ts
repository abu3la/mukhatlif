import { serve, type HttpBindings } from '@hono/node-server';
import app from './index';
import { resolveTrustedClientAddress } from './runtime/client-address';
import { createHostingerRuntime } from './runtime/hostinger-env';

const runtime = createHostingerRuntime(process.env);

const server = serve({
  hostname: '0.0.0.0',
  port: runtime.port,
  fetch: (request, httpBindings) => {
    const url = new URL(request.url);
    if (url.pathname === '/health/live' && request.method === 'GET') {
      return new Response('{"status":"ok"}', {
        headers: { 'cache-control': 'no-store', 'content-type': 'application/json; charset=UTF-8' },
      });
    }
    const clientAddress = resolveTrustedClientAddress(
      (httpBindings as HttpBindings).incoming,
      runtime.trustedProxyHops,
    );
    return app.fetch(request, {
      ...runtime.bindings,
      CLIENT_ADDRESS: clientAddress,
    });
  },
});

let closing = false;
function shutdown(signal: string): void {
  if (closing) return;
  closing = true;
  console.info(`Received ${signal}; closing the API listener.`);
  server.close((error) => {
    if (error) {
      console.error('API listener shutdown failed.', error);
      process.exitCode = 1;
    }
  });
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
