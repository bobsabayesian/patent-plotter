import { handlePatents, type Allow, type Fetcher } from './patents.ts';
import { handleSearch } from './search.ts';
import { handleSessions } from './sessions.ts';
import type { Store } from './store.ts';

/** All of /api/*; null when the path is not one of ours. */
export async function handleApi(req: Request, store: Store, doFetch?: Fetcher, allow?: Allow): Promise<Response | null> {
  if (!new URL(req.url).pathname.startsWith('/api/')) return null;
  return (await handleSessions(req, store)) ?? (await handleSearch(req, store, doFetch, allow)) ?? (await handlePatents(req, store, doFetch, allow)) ?? new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: { 'content-type': 'application/json' } });
}
