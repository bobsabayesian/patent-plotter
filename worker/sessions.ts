/**
 * Sessions: a visitor's work, kept under a short code so they can come back to it on any device. The code is the
 * only key (anyone who has it can read and change that session, and nobody can list sessions), so it is long enough
 * not to be guessed: 10 characters from 32, 50 bits. Same scheme as moire's workspace codes.
 */
import { PREFIX, type Store } from './store.ts';

/** No 0, O, 1 or I, so a code can be read out loud. */
export const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE = /^[23456789A-HJ-NP-Z]{5}-[23456789A-HJ-NP-Z]{5}$/;

export const MAX_SESSION_BYTES = 256 * 1024;

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

/** A new random session code such as "K7M2P-9QXAR". */
export function newCode(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const chars: string[] = [];
  while (chars.length < 10) for (const b of random(16)) if (chars.length < 10) chars.push(CODE_ALPHABET[b % CODE_ALPHABET.length]!); // 256 is a whole number of 32s: no bias
  return `${chars.slice(0, 5).join('')}-${chars.slice(5).join('')}`;
}

/** What someone typed as the canonical code (case, spaces and the dash do not matter), or null when it cannot be one. */
export function cleanCode(raw: string): string | null {
  const s = raw.replace(/[\s-]+/g, '').toUpperCase();
  const dashed = s.length === 10 ? `${s.slice(0, 5)}-${s.slice(5)}` : s;
  return CODE.test(dashed) ? dashed : null;
}

/**
 *   POST /api/session         -> { code }      (a fresh code; nothing is stored until the first PUT)
 *   GET  /api/session/<code>  -> the saved JSON, or 404
 *   PUT  /api/session/<code>  -> { ok }        (JSON body)
 */
export async function handleSessions(req: Request, store: Store, now = Date.now()): Promise<Response | null> {
  const url = new URL(req.url);
  const m = /^\/api\/session(?:\/([^/]+))?\/?$/.exec(url.pathname);
  if (!m) return null;
  if (m[1] === undefined) {
    if (req.method !== 'POST') return json(405, { error: 'POST only' });
    return json(200, { code: newCode() });
  }
  const code = cleanCode(decodeURIComponent(m[1]));
  if (!code) return json(400, { error: 'bad code' });
  const key = `${PREFIX}sessions/${code}.json`;
  if (req.method === 'GET') {
    const f = await store.get(key);
    return f ? new Response(f.body, { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } }) : json(404, { error: 'no such session' });
  }
  if (req.method === 'PUT') {
    const body = await req.arrayBuffer();
    if (body.byteLength === 0) return json(400, { error: 'empty' });
    if (body.byteLength > MAX_SESSION_BYTES) return json(413, { error: 'too large' });
    let doc: unknown;
    try { doc = JSON.parse(new TextDecoder().decode(body)); } catch { return json(400, { error: 'not JSON' }); }
    if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) return json(400, { error: 'not an object' });
    const stamped = new TextEncoder().encode(JSON.stringify({ ...doc, savedAt: new Date(now).toISOString() }));
    await store.put(key, stamped.buffer as ArrayBuffer, 'application/json');
    return json(200, { ok: true });
  }
  return json(405, { error: 'method not allowed' });
}
