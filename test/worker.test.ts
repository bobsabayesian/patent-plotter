import { describe, expect, it } from 'vitest';
import { handleApi } from '../worker/api';
import { MAX_PDF_BYTES, looksLikePdf } from '../worker/pdfs';
import { cleanCode, newCode, CODE_ALPHABET } from '../worker/sessions';
import type { Store } from '../worker/store';

const memory = () => {
  const m = new Map<string, { body: ArrayBuffer; type: string }>();
  const store: Store = { get: async (k) => m.get(k) ?? null, put: async (k, body, type) => { m.set(k, { body, type }); } };
  return { m, store };
};

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

const PDF = new TextEncoder().encode('%PDF-1.3\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
const put = (code: string, id: string, body: BodyInit, type = 'application/pdf') => new Request(`http://x/api/session/${code}/pdf/${id}`, { method: 'PUT', body, headers: { 'content-type': type } });

describe('uploaded PDFs', () => {
  const code = 'K7M2P-9QXAR';
  it('recognises a PDF by its header, even with a little in front of it', () => {
    expect(looksLikePdf(PDF)).toBe(true);
    expect(looksLikePdf(new TextEncoder().encode('\n\n  %PDF-1.7 rest'))).toBe(true);
    expect(looksLikePdf(new TextEncoder().encode('<html>not a pdf</html>'))).toBe(false);
    expect(looksLikePdf(new Uint8Array())).toBe(false);
  });
  it('keeps an upload under the session, and gives the same bytes back', async () => {
    const { m, store } = memory();
    expect((await handleApi(put(code, 'a1b2c3d4', PDF), store))!.status).toBe(200);
    expect([...m.keys()]).toEqual([`patent-plotter/pdfs/${code}/a1b2c3d4.pdf`]);
    const got = await handleApi(new Request(`http://x/api/session/${code.replace('-', '').toLowerCase()}/pdf/a1b2c3d4`), store);
    expect(got!.status).toBe(200);
    expect(got!.headers.get('content-type')).toBe('application/pdf');
    expect(new Uint8Array(await got!.arrayBuffer())).toEqual(PDF);
  });
  it('keeps each session\'s PDFs apart', async () => {
    const { store } = memory();
    await handleApi(put(code, 'a1b2c3d4', PDF), store);
    expect((await handleApi(new Request('http://x/api/session/22222-33333/pdf/a1b2c3d4'), store))!.status).toBe(404);
    expect((await handleApi(new Request(`http://x/api/session/${code}/pdf/ffffffff`), store))!.status).toBe(404);
  });
  it('refuses what is not a PDF, is empty, is too big, or has a bad code or id', async () => {
    const { m, store } = memory();
    expect((await handleApi(put(code, 'a1b2c3d4', '<html>hi</html>'), store))!.status).toBe(415);
    expect((await handleApi(put(code, 'a1b2c3d4', new Uint8Array()), store))!.status).toBe(400);
    const big = new Uint8Array(MAX_PDF_BYTES + 1); big.set(PDF);
    expect((await handleApi(put(code, 'a1b2c3d4', big), store))!.status).toBe(413);
    expect((await handleApi(put('nope', 'a1b2c3d4', PDF), store))!.status).toBe(400);
    for (const id of ['short', 'A1B2C3D4', '../../etc', 'a1b2c3d4e5']) expect((await handleApi(put(code, id, PDF), store))!.status, id).toBe(400);
    expect(m.size).toBe(0);
  });
  it('does not take other methods', async () => {
    const { store } = memory();
    expect((await handleApi(new Request(`http://x/api/session/${code}/pdf/a1b2c3d4`, { method: 'DELETE' }), store))!.status).toBe(405);
  });
});

describe('the Google fetching is gone', () => {
  it('has no search or patent lookup', async () => {
    const { store } = memory();
    expect((await handleApi(new Request('http://x/api/search?q=telephone'), store))!.status).toBe(404);
    expect((await handleApi(new Request('http://x/api/patent/US7654321B2'), store))!.status).toBe(404);
  });
});
