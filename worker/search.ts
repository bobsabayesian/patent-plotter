/**
 * Searching US patents, historic ones included (Google Patents reaches back to 1790; its text is OCR for the old ones, so
 * titles can be rough). Goes through the same JSON feed the Google Patents page itself uses; there is no official API.
 */
import { decode, IMAGE_HOST, safeFetch, type Fetcher } from './patents.ts';
import { PREFIX, type Store } from './store.ts';

export interface SearchHit {
  /** the publication number to load, e.g. "US416697A" */
  id: string;
  title: string;
  snippet: string;
  /** grant date, YYYY-MM-DD */
  date: string;
  inventor: string;
  assignee: string;
  /** a picture of the first drawing sheet, loadable through /api/img */
  thumb: string;
}
export interface SearchResult { total: number; pages: number; page: number; hits: SearchHit[] }

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const FIRST_YEAR = 1790;

/** The query Google's feed takes (itself a URL-encoded query string), or an error message. */
export function buildQuery(p: URLSearchParams, thisYear = new Date().getUTCFullYear()): { inner: string } | { error: string } {
  const q = (p.get('q') ?? '').trim();
  if (!q) return { error: 'type something to search for' };
  if (q.length > 200) return { error: 'that search is too long' };
  const year = (name: string): number | null | 'bad' => {
    const raw = (p.get(name) ?? '').trim();
    if (!raw) return null;
    const n = /^\d{4}$/.test(raw) ? +raw : NaN;
    return n >= FIRST_YEAR && n <= thisYear ? n : 'bad';
  };
  const from = year('from'), to = year('to');
  if (from === 'bad' || to === 'bad') return { error: `years run from ${FIRST_YEAR} to ${thisYear}` };
  if (from && to && from > to) return { error: 'the first year comes after the last' };
  const sort = p.get('sort');
  const page = Math.floor(+(p.get('page') ?? 0));
  if (!(page >= 0 && page < 100)) return { error: 'no such page' };
  const parts = [`q=${encodeURIComponent(q)}`, 'country=US', 'type=PATENT'];
  if (from) parts.push(`after=publication:${from}0101`);
  if (to) parts.push(`before=publication:${to}1231`);
  if (sort === 'old' || sort === 'new') parts.push(`sort=${sort}`);
  if (page) parts.push(`page=${page}`);
  return { inner: parts.join('&') };
}

/** Pick the hits out of Google's feed. */
export function parseSearch(feed: unknown, page: number): SearchResult {
  const results = (feed as { results?: { total_num_results?: number; total_num_pages?: number; cluster?: { result?: unknown[] }[] } })?.results;
  const rows = (results?.cluster?.[0]?.result ?? []) as { patent?: Record<string, string> }[];
  const hits: SearchHit[] = [];
  for (const r of rows) {
    const p = r.patent;
    if (!p?.publication_number) continue;
    hits.push({
      id: p.publication_number,
      title: decode(p.title ?? '') || '(untitled)',
      snippet: decode(p.snippet ?? ''),
      date: p.grant_date || p.publication_date || '',
      inventor: decode(p.inventor ?? ''),
      assignee: decode(p.assignee ?? ''),
      thumb: p.thumbnail ? `https://${IMAGE_HOST}/${p.thumbnail}` : '',
    });
  }
  return { total: results?.total_num_results ?? hits.length, pages: Math.min(100, results?.total_num_pages ?? 1), page, hits };
}

/** A search is kept this long before it is looked up again; one older than that is still used when the source is down. */
const FRESH_MS = 7 * 24 * 3600 * 1000;

async function hash(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d).slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** GET /api/search?q=&from=&to=&sort=old|new&page=  ->  SearchResult  (kept in the bucket; see FRESH_MS) */
export async function handleSearch(req: Request, store: Store, doFetch: Fetcher = fetch, now = Date.now()): Promise<Response | null> {
  const url = new URL(req.url);
  if (url.pathname !== '/api/search') return null;
  if (req.method !== 'GET') return json(405, { error: 'GET only' });
  const built = buildQuery(url.searchParams);
  if ('error' in built) return json(400, { error: built.error });
  const page = Math.floor(+(url.searchParams.get('page') ?? 0));

  const key = `${PREFIX}search/${await hash(built.inner)}.json`;
  const kept = await store.get(key);
  let old: { cachedAt: number; result: SearchResult } | null = null;
  try { if (kept) old = JSON.parse(new TextDecoder().decode(kept.body)); } catch { /* a damaged entry is looked up again */ }
  if (old && now - old.cachedAt < FRESH_MS) return json(200, old.result);

  const r = await safeFetch(doFetch, `https://patents.google.com/xhr/query?url=${encodeURIComponent(built.inner)}&exp=`, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; patent-plotter)' } });
  let result: SearchResult | null = null;
  if (r.ok) { try { result = parseSearch(await r.json(), page); } catch { /* unreadable: treated as a failure below */ } }
  if (result) {
    await store.put(key, new TextEncoder().encode(JSON.stringify({ cachedAt: now, result })).buffer as ArrayBuffer, 'application/json');
    return json(200, result);
  }
  if (old) return json(200, old.result); // the source is down: an old answer beats none
  return json(502, { error: r.status === 599 ? 'could not reach the patent source; try again in a moment' : `patent search said ${r.status}; try again in a moment` });
}
