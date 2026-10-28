import type { PDFDocumentProxy } from 'pdfjs-dist';
import { pageText, renderGray, renderPng, TRACE_PX, type Gray } from './pdf';
import { domSurface, openPdf } from './pdfLoad';

/**
 * The PDFs of this visit: opened once, with their pages rendered on demand and remembered. A PDF just uploaded is
 * held from the bytes in hand; one from an earlier visit is fetched back from the session.
 */
const bytes = new Map<string, Uint8Array>();
const docs = new Map<string, Promise<PDFDocumentProxy>>();
const grays = new Map<string, Promise<Gray>>();
const pngs = new Map<string, Promise<string>>();
/** Rendered sheets are millions of pixels each: keep only the last few. */
const KEEP_GRAYS = 6;

export function hold(id: string, data: Uint8Array) { bytes.set(id, data); }

export function forget(id: string) {
  bytes.delete(id);
  docs.get(id)?.then((d) => d.loadingTask.destroy()).catch(() => {});
  docs.delete(id);
  for (const m of [grays, pngs]) for (const k of m.keys()) if (k.startsWith(`${id}:`)) m.delete(k);
}

export function getDoc(code: string, id: string): Promise<PDFDocumentProxy> {
  let p = docs.get(id);
  if (!p) {
    p = (async () => {
      let data = bytes.get(id);
      if (!data) {
        const r = await fetch(`/api/session/${code}/pdf/${id}`);
        if (!r.ok) throw new Error(r.status === 404 ? 'That PDF is no longer on the server' : `Could not get the PDF (${r.status})`);
        data = new Uint8Array(await r.arrayBuffer());
        bytes.set(id, data);
      }
      // pdf.js takes ownership of the array it is given, so hand it a copy and keep ours
      return openPdf(data.slice());
    })();
    p.catch(() => docs.delete(id));
    docs.set(id, p);
  }
  return p;
}

const remember = <T,>(m: Map<string, Promise<T>>, key: string, make: () => Promise<T>): Promise<T> => {
  let p = m.get(key);
  if (!p) { p = make(); p.catch(() => m.delete(key)); m.set(key, p); }
  return p;
};

/** A page (0-based) as grey pixels at tracing resolution. */
export function pageGray(code: string, id: string, page: number): Promise<Gray> {
  const key = `${id}:${page}`;
  const fresh = !grays.has(key);
  const p = remember(grays, key, async () => renderGray(await getDoc(code, id), page + 1, TRACE_PX, domSurface));
  if (fresh) while (grays.size > KEEP_GRAYS) grays.delete(grays.keys().next().value!);
  return p;
}

/** A page (0-based) as a PNG data URL, its long side `px` pixels. */
export function pagePng(code: string, id: string, page: number, px: number): Promise<string> {
  return remember(pngs, `${id}:${page}:${px}`, async () => renderPng(await getDoc(code, id), page + 1, px, domSurface));
}

export async function textOf(code: string, id: string, page: number): Promise<string> {
  return pageText(await getDoc(code, id), page + 1);
}
