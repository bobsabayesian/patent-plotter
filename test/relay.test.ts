import { describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { checkTarget, createRelay, refusedByGoogle } from '../relay/relay.mjs';

const KEY = 'k'.repeat(24);

/** The relay on a real local port, with a stand-in for Google. */
async function up(upstream: (url: string) => Response | Promise<Response>) {
  const seen: { url: string; ua: string }[] = [];
  const server: Server = createServer(createRelay({ key: KEY, gapMs: 0, fetchUpstream: (async (u: string, init?: RequestInit) => { seen.push({ url: u, ua: String((init?.headers as Record<string, string>)['user-agent']) }); return upstream(u); }) as typeof fetch }));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, seen, close: () => new Promise((r) => server.close(r)) };
}
const page = 'https://patents.google.com/patent/US261A/en';
const get = (base: string, u: string, key: string | null = KEY) => fetch(`${base}/fetch?u=${encodeURIComponent(u)}`, { headers: key ? { 'x-relay-key': key } : {} });

describe('relay target check', () => {
  it('lets through patent pages and the search feed on patents.google.com only', () => {
    expect(checkTarget(page)).toHaveProperty('url');
    expect(checkTarget('https://patents.google.com/xhr/query?url=q%3Dbicycle&exp=')).toHaveProperty('url');
    for (const bad of ['', 'nonsense', 'http://patents.google.com/patent/US261A/en', 'https://evil.example/patent/US261A/en', 'https://patents.google.com.evil.example/patent/US261A/en', 'https://patents.google.com@evil.example/patent/US261A/en', 'https://patents.google.com:8443/patent/US261A/en', 'https://patents.google.com/', 'https://patents.google.com/patent/../../x/en', 'https://patents.google.com/xhr/other'])
      expect(checkTarget(bad)).toHaveProperty('error');
  });
});

describe('relay load', () => {
  it('says busy past a short queue instead of piling up calls to Google', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const server = createServer(createRelay({ key: KEY, gapMs: 0, maxWaiting: 2, fetchUpstream: (async () => { await gate; return new Response('ok'); }) as typeof fetch }));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const pending = [get(base, page), get(base, page)];
    await new Promise((r) => setTimeout(r, 50));
    expect((await get(base, page)).status).toBe(503);
    release();
    expect((await Promise.all(pending)).map((r) => r.status)).toEqual([200, 200]);
    expect((await get(base, page)).status).toBe(200); // the queue drains
    await new Promise((r) => server.close(r));
  });
});

describe('relay', () => {
  it('refuses to start without a real key', () => {
    expect(() => createRelay({ key: '' })).toThrow();
    expect(() => createRelay({ key: 'short' })).toThrow();
  });
  it('answers health checks without a key, and nothing else without one', async () => {
    const r = await up(() => new Response('x'));
    expect((await fetch(`${r.base}/health`)).status).toBe(200);
    expect((await get(r.base, page, null)).status).toBe(401);
    expect((await get(r.base, page, 'wrong'.repeat(5))).status).toBe(401);
    expect((await fetch(`${r.base}/other`, { headers: { 'x-relay-key': KEY } })).status).toBe(404);
    expect(r.seen).toHaveLength(0); // nothing reached Google
    await r.close();
  });
  it('fetches an allowed page as a browser would and passes the answer through', async () => {
    const r = await up(() => new Response('<html>hi</html>', { status: 200, headers: { 'content-type': 'text/html; charset=UTF-8' } }));
    const res = await get(r.base, page);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html; charset=UTF-8');
    expect(await res.text()).toBe('<html>hi</html>');
    expect(r.seen[0]!.url).toBe(page);
    expect(r.seen[0]!.ua).toMatch(/Chrome/);
    await r.close();
  });
  it('refuses other hosts even with the key, and reports a Google refusal as a 503', async () => {
    const r = await up(() => new Response('Sorry...', { status: 503 }));
    expect((await get(r.base, 'https://evil.example/patent/US1A/en')).status).toBe(400);
    expect((await get(r.base, page)).status).toBe(503);
    expect(r.seen).toHaveLength(1);
    await r.close();
  });
  it('says so when Google cannot be reached', async () => {
    const r = await up(() => { throw new Error('connect ECONNREFUSED'); });
    const res = await get(r.base, page);
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: string }).error).toMatch(/could not reach Google/);
    await r.close();
  });
});

describe('relay back-off when Google refuses it', () => {
  const sorry = () => new Response('<html><title>Sorry...</title>We\'re sorry... unusual traffic from your computer network</html>', { status: 503, headers: { 'content-type': 'text/html' } });
  const MIN = 60_000;

  /** The relay with a clock the test moves and a Google it controls. */
  async function rig() {
    let clock = 1_000_000, mode: 'sorry' | 'ok' | 'throttle' = 'sorry', asked = 0;
    const server = createServer(createRelay({
      key: KEY, gapMs: 0, now: () => clock, coolMs: 20 * MIN, maxCoolMs: 2 * 60 * MIN,
      fetchUpstream: (async () => { asked++; return mode === 'sorry' ? sorry() : mode === 'throttle' ? new Response('slow down', { status: 429 }) : new Response('<html>fine</html>', { status: 200 }); }) as typeof fetch,
    }));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    return {
      base, asked: () => asked, tick: (ms: number) => { clock += ms; }, set: (m: typeof mode) => { mode = m; },
      health: async () => (await fetch(`${base}/health`)).json() as Promise<{ ok: boolean; blockedForSec: number }>,
      close: () => new Promise((r) => server.close(r)),
    };
  }

  it('recognises Google refusing it', () => {
    expect(refusedByGoogle(503, Buffer.from('<title>Sorry...</title>'))).toBe(true);
    expect(refusedByGoogle(503, Buffer.from('our servers are unusual traffic'))).toBe(true);
    expect(refusedByGoogle(429, Buffer.from(''))).toBe(true);
    expect(refusedByGoogle(503, Buffer.from('<html>maintenance</html>'))).toBe(false); // a plain 503 is not a block
    expect(refusedByGoogle(200, Buffer.from('Sorry, no results'))).toBe(false);
    expect(refusedByGoogle(404, Buffer.from('Sorry'))).toBe(false);
  });
  it('stops asking Google once it is refused, and marks the answer so the Worker can say why', async () => {
    const r = await rig();
    const first = await get(r.base, page);
    expect(first.status).toBe(503);
    expect(first.headers.get('x-relay-blocked')).toBe('1');
    expect(Number(first.headers.get('retry-after'))).toBe(20 * 60);
    expect(await first.text()).not.toContain('unusual traffic'); // not Google's page
    for (let i = 0; i < 5; i++) expect((await get(r.base, page)).headers.get('x-relay-blocked')).toBe('1');
    expect(r.asked()).toBe(1); // five more tries, none reached Google
    expect((await r.health()).blockedForSec).toBeGreaterThan(0);
    await r.close();
  });
  it('tries again once the cool-off is over, and goes back to normal when Google answers', async () => {
    const r = await rig();
    await get(r.base, page);
    r.tick(19 * MIN);
    await get(r.base, page);
    expect(r.asked()).toBe(1); // not yet
    r.tick(2 * MIN);
    r.set('ok');
    const again = await get(r.base, page);
    expect(again.status).toBe(200);
    expect(await again.text()).toContain('fine');
    expect(r.asked()).toBe(2);
    expect((await r.health()).blockedForSec).toBe(0);
    await r.close();
  });
  it('waits twice as long each time Google refuses again, up to a limit, and starts over after a success', async () => {
    const r = await rig();
    const wait = async () => Number((await get(r.base, page)).headers.get('retry-after'));
    expect(await wait()).toBe(20 * 60);
    r.tick(21 * MIN); expect(await wait()).toBe(40 * 60);
    r.tick(41 * MIN); expect(await wait()).toBe(80 * 60);
    r.tick(81 * MIN); expect(await wait()).toBe(120 * 60); // capped at two hours
    r.tick(121 * MIN); r.set('ok');
    expect((await get(r.base, page)).status).toBe(200);
    r.set('throttle');
    expect(await wait()).toBe(20 * 60); // back to the first step
    await r.close();
  });
});
