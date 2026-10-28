import { handleApi } from './api.ts';
import { relayFetcher } from './patents.ts';
import type { Store } from './store.ts';

/** The slice of an R2 bucket that is used here (avoids pulling in the full Workers types). */
interface Bucket {
  put(key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType: string } }): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer>; httpMetadata?: { contentType?: string } } | null>;
}
interface Env {
  FILES: Bucket;
  ASSETS: { fetch(req: Request): Promise<Response> };
  /** where the Google Patents relay answers, and the key it wants (a secret): see relay/README.md */
  RELAY_URL?: string;
  RELAY_KEY?: string;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const store: Store = {
      get: async (key) => { const o = await env.FILES.get(key); return o ? { body: await o.arrayBuffer(), type: o.httpMetadata?.contentType ?? 'application/octet-stream' } : null; },
      put: async (key, body, contentType) => { await env.FILES.put(key, body, { httpMetadata: { contentType } }); },
    };
    return (await handleApi(req, store, relayFetcher(env.RELAY_URL, env.RELAY_KEY))) ?? env.ASSETS.fetch(req);
  },
};
