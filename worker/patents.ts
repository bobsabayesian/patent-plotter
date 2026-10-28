/**
 * US patents, read from Google Patents (no key needed) and cached in the bucket. The drawings are the patent office's
 * 1-bit PNG scans; they are fetched through this server because the image host sends no CORS headers.
 */
import { PREFIX, type Store } from './store.ts';

export interface PatentRecord {
  /** canonical, e.g. "US7654321B2" */
  id: string;
  title: string;
  abstract: string;
  inventors: string[];
  assignee: string;
  filed: string;
  issued: string;
  claims: string[];
  /** the drawing sheets, in order (the front page is left out) */
  drawings: string[];
}

export const IMAGE_HOST = 'patentimages.storage.googleapis.com';

/**
 * "7,654,321", "US 7654321 B2", "us7654321b2" -> "US7654321B2" / "US7654321"; null if it is not a US patent number.
 * Historic ones are short ("US261A": the third patent of 1837) or start with X (the pre-1836 patents, "USX8803I1").
 */
export function normalizeNumber(raw: string): string | null {
  const s = raw.replace(/[\s,./-]+/g, '').toUpperCase();
  const m = /^(?:US)?(X\d{1,6}|\d{1,8}|D\d{1,7}|RE\d{1,6}|PP\d{1,6}|H\d{1,5}|T\d{1,6})([A-Z]\d?)?$/.exec(s);
  return m ? `US${m[1]}${m[2] ?? ''}` : null;
}

export const decode = (s: string) => s
  .replace(/<[^>]*>/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&hellip;/g, '…').replace(/&apos;/g, "'").replace(/&[mn]dash;/g, '–')
  .replace(/\s+/g, ' ').trim();

const meta = (html: string, name: string, scheme?: string): string[] => {
  const out: string[] = [];
  for (const m of html.matchAll(/<meta name="([^"]+)" content="([^"]*)"(?: scheme="([^"]*)")?/g)) if (m[1] === name && (scheme === undefined || m[3] === scheme)) out.push(decode(m[2]!));
  return out;
};

/** Pull the record out of a Google Patents page. */
export function parsePatentPage(html: string, id: string): PatentRecord {
  const title = decode(/<meta name="DC.title" content="([^"]*)"/.exec(html)?.[1] ?? '') || decode(/<title>([^<]*)/.exec(html)?.[1]?.replace(/^[^-]*-/, '').replace(/- Google Patents.*$/s, '') ?? '');
  const abs = /<section itemprop="abstract"[\s\S]*?<div itemprop="content"[^>]*>([\s\S]*?)<\/section>/.exec(html)?.[1] ?? '';
  const claimsHtml = /<section itemprop="claims"[\s\S]*?<\/section>/.exec(html)?.[0] ?? '';
  // each top-level claim div holds its text; dependent claims say "The ... of claim N", so keep them all in order
  const claims = [...claimsHtml.matchAll(/<div id="CLM-\d+"[^>]*>([\s\S]*?)(?=<div id="CLM-\d+"|$)/g)].map((m) => decode(m[1]!)).filter(Boolean);
  const seen = new Set<string>();
  const drawings: string[] = [];
  for (const m of html.matchAll(/<meta itemprop="full" content="(https:\/\/patentimages\.storage\.googleapis\.com\/[^"]+\.png)"/g)) {
    const url = m[1]!, name = url.slice(url.lastIndexOf('/') + 1);
    if (/-D0*0\.png$/.test(name) || seen.has(name)) continue; // D00000 is the front page
    seen.add(name);
    drawings.push(url);
  }
  return {
    id,
    title,
    abstract: decode(abs),
    inventors: meta(html, 'DC.contributor', 'inventor'),
    assignee: meta(html, 'DC.contributor', 'assignee')[0] ?? '',
    filed: meta(html, 'DC.date', 'dateSubmitted')[0] ?? '',
    issued: meta(html, 'DC.date', 'issue')[0] ?? '',
    claims,
    drawings,
  };
}

const json = (status: number, body: unknown, cache = 'no-store') => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': cache } });

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
const UA = { 'user-agent': 'Mozilla/5.0 (compatible; patent-plotter)' };

/** A short stable key for an image URL. */
async function hash(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d).slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 *   GET /api/patent/<number>   -> a PatentRecord (cached in the bucket)
 *   GET /api/img?u=<image url> -> the drawing (only from the patent image host; cached in the bucket)
 */
export async function handlePatents(req: Request, store: Store, doFetch: Fetcher = fetch): Promise<Response | null> {
  const url = new URL(req.url);
  if (req.method !== 'GET') return /^\/api\/(patent|img)\b/.test(url.pathname) ? json(405, { error: 'GET only' }) : null;

  const p = /^\/api\/patent\/([^/]+)\/?$/.exec(url.pathname);
  if (p) {
    const id = normalizeNumber(decodeURIComponent(p[1]!));
    if (!id) return json(400, { error: 'that does not look like a US patent number' });
    const key = `${PREFIX}patents/${id}.json`;
    const hit = await store.get(key);
    if (hit) return new Response(hit.body, { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=86400' } });
    // Google wants the kind code for some numbers and not others: as given, without it, then the usual ones
    const bare = id.replace(/[A-Z]\d?$/, '');
    for (const tryId of new Set([id, bare, `${bare}A`, `${bare}B2`, `${bare}B1`])) {
      const r = await doFetch(`https://patents.google.com/patent/${tryId}/en`, { headers: UA });
      if (!r.ok) continue;
      const rec = parsePatentPage(await r.text(), id);
      if (!rec.title && !rec.drawings.length) continue;
      await store.put(key, new TextEncoder().encode(JSON.stringify(rec)).buffer as ArrayBuffer, 'application/json');
      return json(200, rec, 'public, max-age=86400');
    }
    return json(404, { error: `no patent found for ${id}` });
  }

  if (url.pathname === '/api/img') {
    const u = url.searchParams.get('u') ?? '';
    let target: URL;
    try { target = new URL(u); } catch { return json(400, { error: 'bad url' }); }
    if (target.protocol !== 'https:' || target.hostname !== IMAGE_HOST) return json(400, { error: 'only patent drawings can be fetched' });
    const key = `${PREFIX}img/${await hash(target.href)}`;
    const hit = await store.get(key);
    const headers = { 'cache-control': 'public, max-age=604800' };
    if (hit) return new Response(hit.body, { headers: { ...headers, 'content-type': hit.type } });
    const r = await doFetch(target.href, { headers: UA });
    if (!r.ok) return json(502, { error: `image host said ${r.status}` });
    const type = r.headers.get('content-type') ?? 'image/png';
    if (!type.startsWith('image/')) return json(502, { error: 'not an image' });
    const body = await r.arrayBuffer();
    await store.put(key, body, type);
    return new Response(body, { headers: { ...headers, 'content-type': type } });
  }
  return null;
}
