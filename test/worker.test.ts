import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { handleApi } from '../worker/api';
import { cleanCode, newCode, CODE_ALPHABET } from '../worker/sessions';
import { normalizeNumber, parsePatentPage } from '../worker/patents';
import type { Store } from '../worker/store';

const memory = () => {
  const m = new Map<string, { body: ArrayBuffer; type: string }>();
  const store: Store = { get: async (k) => m.get(k) ?? null, put: async (k, body, type) => { m.set(k, { body, type }); } };
  return { m, store };
};
const page = readFileSync(new URL('./fixtures/us7654321.html', import.meta.url), 'utf8');

describe('patent numbers', () => {
  it('accepts the usual ways of writing one', () => {
    expect(normalizeNumber('7,654,321')).toBe('US7654321');
    expect(normalizeNumber('US 7654321 B2')).toBe('US7654321B2');
    expect(normalizeNumber('us7654321b2')).toBe('US7654321B2');
    expect(normalizeNumber('D654,321')).toBe('USD654321');
    expect(normalizeNumber('RE39,000')).toBe('USRE39000');
  });
  it('rejects what is not a US patent number', () => {
    for (const bad of ['', 'abc', '123', 'EP1234567', '../../etc', 'US7654321B2/../x']) expect(normalizeNumber(bad)).toBeNull();
  });
});

describe('parsePatentPage', () => {
  const rec = parsePatentPage(page, 'US7654321B2');
  it('reads the title, people and dates', () => {
    expect(rec.title).toBe('Formation fluid sampling apparatus and methods');
    expect(rec.inventors).toContain('Colin Longfield');
    expect(rec.assignee).toBe('Schlumberger Technology Corp');
    expect(rec.filed).toBe('2006-12-27');
    expect(rec.issued).toBe('2010-02-02');
  });
  it('reads the abstract and claims as plain text', () => {
    expect(rec.abstract.startsWith('A fluid sampling system retrieves a formation fluid sample')).toBe(true);
    expect(rec.abstract).not.toMatch(/[<>]/);
    expect(rec.claims.length).toBeGreaterThanOrEqual(5);
    expect(rec.claims[0]).toMatch(/^1\. A fluid sampling system/);
  });
  it('lists the drawing sheets once each, without the front page', () => {
    expect(rec.drawings.length).toBeGreaterThan(3);
    expect(new Set(rec.drawings).size).toBe(rec.drawings.length);
    expect(rec.drawings.every((u) => u.startsWith('https://patentimages.storage.googleapis.com/') && !/D0*0\.png$/.test(u))).toBe(true);
    expect(rec.drawings[0]).toMatch(/D00001\.png$/);
  });
});

describe('sessions', () => {
  it('makes codes people can read aloud, and cleans what they type', () => {
    for (let i = 0; i < 50; i++) { const c = newCode(); expect(c).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/); expect([...c.replace('-', '')].every((ch) => CODE_ALPHABET.includes(ch))).toBe(true); }
    expect(cleanCode(' k7m2p 9qxar ')).toBe('K7M2P-9QXAR');
    expect(cleanCode('K7M2P9QXAR')).toBe('K7M2P-9QXAR');
    expect(cleanCode('K7M2P-9QXA0')).toBeNull(); // no zero
    expect(cleanCode('short')).toBeNull();
  });
  it('keeps what is put and gives it back, under the shared prefix', async () => {
    const { m, store } = memory();
    const mint = await handleApi(new Request('http://x/api/session', { method: 'POST' }), store);
    const { code } = (await mint!.json()) as { code: string };
    const url = `http://x/api/session/${code}`;
    expect((await handleApi(new Request(url), store))!.status).toBe(404);
    const put = await handleApi(new Request(url, { method: 'PUT', body: JSON.stringify({ patent: 'US7654321B2' }) }), store);
    expect(put!.status).toBe(200);
    expect([...m.keys()]).toEqual([`patent-plotter/sessions/${code}.json`]);
    const got = (await (await handleApi(new Request(url.toLowerCase().replace(code.toLowerCase(), code.toLowerCase().replace('-', ''))), store))!.json()) as { patent: string; savedAt: string };
    expect(got.patent).toBe('US7654321B2');
    expect(got.savedAt).toMatch(/^\d{4}-\d\d-\d\dT/);
  });
  it('refuses bad codes, non-JSON and oversize bodies', async () => {
    const { store } = memory();
    expect((await handleApi(new Request('http://x/api/session/nope'), store))!.status).toBe(400);
    const code = newCode();
    expect((await handleApi(new Request(`http://x/api/session/${code}`, { method: 'PUT', body: 'not json' }), store))!.status).toBe(400);
    expect((await handleApi(new Request(`http://x/api/session/${code}`, { method: 'PUT', body: '[1]' }), store))!.status).toBe(400);
    expect((await handleApi(new Request(`http://x/api/session/${code}`, { method: 'PUT', body: JSON.stringify({ x: 'a'.repeat(300_000) }) }), store))!.status).toBe(413);
  });
});

describe('patent api', () => {
  it('fetches a patent once and then serves it from the bucket', async () => {
    const { store } = memory();
    let calls = 0;
    const doFetch = async (u: string) => { calls++; expect(u).toBe('https://patents.google.com/patent/US7654321B2/en'); return new Response(page); };
    const r1 = await handleApi(new Request('http://x/api/patent/7,654,321B2'), store, doFetch);
    expect(r1!.status).toBe(200);
    expect(((await r1!.json()) as { title: string }).title).toMatch(/Formation fluid/);
    await handleApi(new Request('http://x/api/patent/US7654321B2'), store, doFetch);
    expect(calls).toBe(1);
  });
  it('says so when there is no such patent', async () => {
    const { store } = memory();
    const r = await handleApi(new Request('http://x/api/patent/US9999999'), store, async () => new Response('nope', { status: 404 }));
    expect(r!.status).toBe(404);
    expect((await handleApi(new Request('http://x/api/patent/hello'), store))!.status).toBe(400);
  });
  it('only proxies drawings from the patent image host', async () => {
    const { store } = memory();
    const doFetch = async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } });
    for (const bad of ['https://evil.example/a.png', 'http://patentimages.storage.googleapis.com/a.png', 'https://patentimages.storage.googleapis.com.evil.example/a.png', 'nonsense'])
      expect((await handleApi(new Request(`http://x/api/img?u=${encodeURIComponent(bad)}`), store, doFetch))!.status).toBe(400);
    const ok = await handleApi(new Request(`http://x/api/img?u=${encodeURIComponent('https://patentimages.storage.googleapis.com/a/b.png')}`), store, doFetch);
    expect(ok!.status).toBe(200);
    expect(ok!.headers.get('content-type')).toBe('image/png');
  });
});
