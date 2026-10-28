/**
 * A small relay for the two Google Patents calls the Worker cannot make itself (Google refuses Cloudflare's servers
 * but answers a home connection). It runs here, behind the cloudflared tunnel; the Worker sends it
 *
 *   GET /fetch?u=<a patents.google.com URL>      with header  x-relay-key: <shared secret>
 *
 * and gets back whatever Google said. It is not an open proxy: it needs the key, and it only fetches pages and search
 * feeds on patents.google.com. Calls are spaced out, and only a short queue is kept (then "busy"), so a burst of
 * searches does not get this connection refused by Google too. If Google does start refusing it (its "Sorry..." page,
 * or 429), the relay stops asking for a while, 20 minutes and then longer each time it is refused again, because
 * asking again and again into a block tends to make it last.
 *
 *   RELAY_KEY=... node relay/relay.mjs        (PORT, default 8788)
 */
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const MAX_BYTES = 5 * 1024 * 1024;

/** The URL to fetch, or an error message: only a patent page or a search feed on patents.google.com. */
export function checkTarget(raw) {
  let u;
  try { u = new URL(raw ?? ''); } catch { return { error: 'bad url' }; }
  if (u.protocol !== 'https:' || u.hostname !== 'patents.google.com' || u.username || u.password || u.port) return { error: 'only patents.google.com' };
  if (!/^\/(patent\/[A-Za-z0-9]+\/en|xhr\/query)$/.test(u.pathname)) return { error: 'only patent pages and the search feed' };
  return { url: u.href };
}

/** Google's refusal of a connection it thinks is a robot: a 429, or a 503 that is its "Sorry..." page. */
export function refusedByGoogle(status, body) {
  if (status === 429) return true;
  return status === 503 && /sorry|unusual traffic|captcha/i.test(body.subarray(0, 4096).toString('utf8'));
}

const same = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

/** The request handler; `fetchUpstream` and `gapMs` are parameters so a test does not touch Google or wait. */
export function createRelay({ key, fetchUpstream = fetch, gapMs = 1500, maxWaiting = 10, now = Date.now, coolMs = 20 * 60_000, maxCoolMs = 2 * 3600_000 }) {
  if (!key || key.length < 16) throw new Error('RELAY_KEY must be set, at least 16 characters');
  let last = Promise.resolve();
  let waiting = 0; // calls queued or in flight
  let blockedUntil = 0, strikes = 0; // when Google last refused us, and how many times running
  /** one call at a time, at least `gapMs` apart */
  const spaced = (fn) => {
    const run = last.then(fn);
    last = run.catch(() => {}).then(() => new Promise((r) => setTimeout(r, gapMs)));
    return run;
  };
  const send = (res, status, body, type = 'application/json') => { res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' }); res.end(body); };
  /** the answer while Google is refusing us: 503, marked so the Worker can say what is going on */
  const blocked = (res) => {
    const secs = Math.max(1, Math.ceil((blockedUntil - now()) / 1000));
    res.writeHead(503, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-relay-blocked': '1', 'retry-after': String(secs) });
    res.end(JSON.stringify({ error: 'google is limiting this connection', retryAfterSec: secs }));
  };
  return async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://relay');
    if (url.pathname === '/health') return send(res, 200, JSON.stringify({ ok: true, blockedForSec: Math.max(0, Math.ceil((blockedUntil - now()) / 1000)) }));
    if (url.pathname !== '/fetch' || req.method !== 'GET') return send(res, 404, '{"error":"not found"}');
    if (!same(String(req.headers['x-relay-key'] ?? ''), key)) return send(res, 401, '{"error":"bad key"}');
    const t = checkTarget(url.searchParams.get('u'));
    if (t.error) return send(res, 400, JSON.stringify({ error: t.error }));
    // Google has been refusing this connection: do not ask again until the cool-off is over
    if (now() < blockedUntil) return blocked(res);
    // a flood of searches must not become a flood to Google from this connection: past a short queue, say busy
    if (waiting >= maxWaiting) return send(res, 503, '{"error":"relay busy"}');
    waiting++;
    try {
      const r = await spaced(() => fetchUpstream(t.url, { headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9' }, signal: AbortSignal.timeout(20_000) }));
      const body = Buffer.from(await r.arrayBuffer());
      if (body.length > MAX_BYTES) return send(res, 502, '{"error":"too large"}');
      if (refusedByGoogle(r.status, body)) {
        strikes++;
        blockedUntil = now() + Math.min(coolMs * 2 ** (strikes - 1), maxCoolMs);
        return blocked(res);
      }
      strikes = 0;
      send(res, r.status, body, r.headers.get('content-type') ?? 'text/plain');
    } catch (e) {
      send(res, 502, JSON.stringify({ error: `relay could not reach Google: ${e?.message ?? e}` }));
    } finally {
      waiting--;
    }
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const port = +(process.env.PORT ?? 8788);
  createServer(createRelay({ key: process.env.RELAY_KEY ?? '' })).listen(port, '127.0.0.1', () => console.log(`patent relay on 127.0.0.1:${port}`));
}
