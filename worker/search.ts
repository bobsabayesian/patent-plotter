/**
 * Searching US patents, historic ones included (Google Patents reaches back to 1790; its text is OCR for the old ones, so
 * titles can be rough). Goes through the same JSON feed the Google Patents page itself uses; there is no official API.
 */
import { decode, IMAGE_HOST, type Fetcher } from './patents.ts';

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

/** GET /api/search?q=&from=&to=&sort=old|new&page=  ->  SearchResult */
export async function handleSearch(req: Request, doFetch: Fetcher = fetch): Promise<Response | null> {
  const url = new URL(req.url);
  if (url.pathname !== '/api/search') return null;
  if (req.method !== 'GET') return json(405, { error: 'GET only' });
  const built = buildQuery(url.searchParams);
  if ('error' in built) return json(400, { error: built.error });
  const r = await doFetch(`https://patents.google.com/xhr/query?url=${encodeURIComponent(built.inner)}&exp=`, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; patent-plotter)' } });
  if (!r.ok) return json(502, { error: `patent search said ${r.status}; try again in a moment` });
  let feed: unknown;
  try { feed = await r.json(); } catch { return json(502, { error: 'patent search sent something unreadable' }); }
  return json(200, parseSearch(feed, Math.floor(+(url.searchParams.get('page') ?? 0))));
}
