import { describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { checkTarget, createRelay } from '../relay/relay.mjs';

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
  it('refuses other hosts even with the key, and passes Google refusals on as they are', async () => {
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
