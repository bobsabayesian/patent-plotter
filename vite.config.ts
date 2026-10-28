import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { handleApi } from './worker/api.ts';
import type { Store } from './worker/store.ts';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** The short commit this build was made from, so an exported file says which version of the app made it. */
function commit() {
  try {
    const run = (c: string) => execSync(c, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return run('git rev-parse --short HEAD') + (run('git status --porcelain') ? '-dirty' : '');
  } catch { return 'unknown'; }
}
const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version as string;

/** Under `npm run dev`, serve /api/* with the Worker's handler, keeping what it stores in ./.dev-store instead of R2. */
const devApi = {
  name: 'dev-api',
  configureServer(server: import('vite').ViteDevServer) {
    const file = (key: string) => join('.dev-store', key);
    const store: Store = {
      get: async (key) => {
        try { return { body: new Uint8Array(await readFile(file(key))).buffer as ArrayBuffer, type: await readFile(file(key) + '.type', 'utf8') }; } catch { return null; }
      },
      put: async (key, body, type) => { await mkdir(dirname(file(key)), { recursive: true }); await writeFile(file(key), Buffer.from(body)); await writeFile(file(key) + '.type', type); },
    };
    server.middlewares.use(async (req, res, next) => {
      if (!req.url?.startsWith('/api/')) return next();
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const request = new Request(`http://localhost${req.url}`, {
        method: req.method,
        headers: req.headers as Record<string, string>,
        body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
      });
      const out = await handleApi(request, store);
      if (!out) return next();
      res.statusCode = out.status;
      out.headers.forEach((v, k) => res.setHeader(k, v));
      res.end(Buffer.from(await out.arrayBuffer()));
    });
  },
};

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version), __APP_COMMIT__: JSON.stringify(commit()) },
  plugins: [react(), devApi],
  worker: { format: 'es' },
  test: { include: ['test/**/*.test.{ts,tsx}'] },
});
