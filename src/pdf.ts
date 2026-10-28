import type { PDFDocumentProxy } from 'pdfjs-dist';

/**
 * Turning a patent PDF into things the app can use: a page as grey pixels (to vectorize), a page as a picture (for
 * thumbnails and the crop dialog), and a page's text. These take an opened document and a way to make a canvas, so
 * the same code runs in the browser and under test; loading pdf.js itself is in pdfLoad.ts.
 */
export interface Gray { data: Uint8Array; w: number; h: number }

export interface Surface {
  canvas: unknown;
  ctx: CanvasRenderingContext2D;
  /** the picture as a PNG data URL */
  toPng(): string;
}
export type MakeSurface = (w: number, h: number) => Surface;

/** Patent sheets are 8.5 x 11 in; this long side is about 200 dpi, enough for fine pen lines. */
export const TRACE_PX = 2200;

async function paint(doc: PDFDocumentProxy, pageNumber: number, longSidePx: number, make: MakeSurface): Promise<Surface & { w: number; h: number }> {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: longSidePx / Math.max(base.width, base.height) });
  const w = Math.max(1, Math.ceil(viewport.width)), h = Math.max(1, Math.ceil(viewport.height));
  const s = make(w, h);
  s.ctx.fillStyle = '#fff';
  s.ctx.fillRect(0, 0, w, h);
  await page.render({ canvas: s.canvas as HTMLCanvasElement, canvasContext: s.ctx, viewport }).promise;
  page.cleanup();
  return { ...s, w, h };
}

/** A page as grey pixels (0 black .. 255 white), its long side `longSidePx` pixels. */
export async function renderGray(doc: PDFDocumentProxy, pageNumber: number, longSidePx: number, make: MakeSurface): Promise<Gray> {
  const { ctx, w, h } = await paint(doc, pageNumber, longSidePx, make);
  const rgba = ctx.getImageData(0, 0, w, h).data;
  const data = new Uint8Array(w * h);
  for (let i = 0; i < data.length; i++) data[i] = (rgba[i * 4]! * 0.299 + rgba[i * 4 + 1]! * 0.587 + rgba[i * 4 + 2]! * 0.114) | 0;
  return { data, w, h };
}

/** A page as a PNG data URL, its long side `longSidePx` pixels. */
export async function renderPng(doc: PDFDocumentProxy, pageNumber: number, longSidePx: number, make: MakeSurface): Promise<string> {
  return (await paint(doc, pageNumber, longSidePx, make)).toPng();
}

/**
 * The text on a page, line by line in reading order. A page of a scan has none (a text layer comes only from
 * the patent office's own text pages), and gives an empty string.
 */
export async function pageText(doc: PDFDocumentProxy, pageNumber: number): Promise<string> {
  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();
  const lines: string[] = [];
  let line = '';
  for (const item of content.items) {
    if (!('str' in item)) continue;
    line += item.str;
    if (item.hasEOL) { lines.push(line); line = ''; }
  }
  if (line) lines.push(line);
  page.cleanup();
  return lines.map((l) => l.replace(/\s+/g, ' ').trim()).join('\n').trim();
}
