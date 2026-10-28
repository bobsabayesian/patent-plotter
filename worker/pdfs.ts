/**
 * The patent PDFs a visitor uploads, kept in the bucket under their session code so they are still there when they come
 * back: one file per PDF, named by a short id the session's document refers to. The code is the only key, as for sessions.
 */
import { cleanCode } from './sessions.ts';
import { PREFIX, type Store } from './store.ts';

export const MAX_PDF_BYTES = 30 * 1024 * 1024;
const ID = /^[a-f0-9]{8}$/;

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

/** %PDF- at the start of the file (a few programs put a little before it, which readers accept). */
export function looksLikePdf(bytes: Uint8Array): boolean {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024));
  return head.includes('%PDF-');
}

/**
 *   PUT /api/session/<code>/pdf/<id>   (application/pdf body)  -> { ok }
 *   GET /api/session/<code>/pdf/<id>                           -> the PDF
 */
export async function handlePdfs(req: Request, store: Store): Promise<Response | null> {
  const m = /^\/api\/session\/([^/]+)\/pdf\/([^/]+)\/?$/.exec(new URL(req.url).pathname);
  if (!m) return null;
  const code = cleanCode(decodeURIComponent(m[1]!));
  if (!code) return json(400, { error: 'bad code' });
  const id = decodeURIComponent(m[2]!);
  if (!ID.test(id)) return json(400, { error: 'bad pdf id' });
  const key = `${PREFIX}pdfs/${code}/${id}.pdf`;
  if (req.method === 'GET') {
    const f = await store.get(key);
    return f ? new Response(f.body, { headers: { 'content-type': 'application/pdf', 'cache-control': 'private, max-age=3600' } }) : json(404, { error: 'no such pdf' });
  }
  if (req.method === 'PUT') {
    const body = await req.arrayBuffer();
    if (body.byteLength === 0) return json(400, { error: 'empty' });
    if (body.byteLength > MAX_PDF_BYTES) return json(413, { error: `a PDF can be at most ${MAX_PDF_BYTES / 1024 / 1024} MB` });
    if (!looksLikePdf(new Uint8Array(body))) return json(415, { error: 'that is not a PDF' });
    await store.put(key, body, 'application/pdf');
    return json(200, { ok: true });
  }
  return json(405, { error: 'method not allowed' });
}
