import { handlePdfs } from './pdfs.ts';
import { handleSessions } from './sessions.ts';
import type { Store } from './store.ts';

/** All of /api/*; null when the path is not one of ours. */
export async function handleApi(req: Request, store: Store): Promise<Response | null> {
  if (!new URL(req.url).pathname.startsWith('/api/')) return null;
  return (await handlePdfs(req, store)) ?? (await handleSessions(req, store)) ?? new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: { 'content-type': 'application/json' } });
}
