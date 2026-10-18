/** Run with `node tools/learning-preview/server.mjs`; binds loopback only. */
import { createServer } from '../../apps/admin/node_modules/vite/dist/node/index.js';
import react from '../../apps/admin/node_modules/@vitejs/plugin-react/dist/index.js';
import { fileURLToPath, URL } from 'node:url';
const root = fileURLToPath(new URL('./', import.meta.url));
const workspace = fileURLToPath(new URL('../../', import.meta.url));
const server = await createServer({
  root,
  configFile: false,
  plugins: [react()],
  publicDir: `${workspace}apps/web/public`,
  resolve: {
    alias: [
      { find: /^\.\.\/customer-provider$/, replacement: `${root}customer.tsx` },
      { find: /^\.\.\/customer-ui$/, replacement: `${root}customer.tsx` },
      { find: 'next/link', replacement: `${root}link.tsx` },
      { find: /^react$/, replacement: `${workspace}apps/web/node_modules/react` },
      { find: /^react\//, replacement: `${workspace}apps/web/node_modules/react/` },
      { find: /^react-dom$/, replacement: `${workspace}apps/web/node_modules/react-dom` },
      { find: /^react-dom\//, replacement: `${workspace}apps/web/node_modules/react-dom/` },
      { find: '@mukhtalif/types', replacement: `${workspace}libs/types/src/index.ts` },
    ],
  },
  server: {
    host: '127.0.0.1',
    port: 3102,
    strictPort: true,
    fs: { allow: [workspace] },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:18787',
        rewrite: (path) => path.replace(/^\/api/, ''),
        configure(proxy) {
          proxy.on('proxyReq', (request, incoming) => {
            const id = incoming.headers.authorization?.replace(/^Bearer /, '');
            if (['usr-listener-1', 'usr-listener-2'].includes(id))
              request.setHeader('X-Dev-User', id);
          });
        },
      },
    },
  },
});
await server.listen();
server.printUrls();
