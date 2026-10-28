import type { PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { MakeSurface } from './pdf';

/** Where pdf.js finds its WebAssembly decoders (the vite plugin serves them there). Patent scans are JBIG2, which needs one. */
export const WASM_URL = '/pdfjs/wasm/';

let lib: Promise<typeof import('pdfjs-dist')> | null = null;

/** pdf.js is large, so it is only fetched when a PDF is first opened. */
function loadLib() {
  lib ??= import('pdfjs-dist').then((m) => { m.GlobalWorkerOptions.workerSrc = workerUrl; return m; });
  return lib;
}

export async function openPdf(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  const pdfjs = await loadLib();
  return pdfjs.getDocument({ data: bytes, wasmUrl: WASM_URL }).promise;
}

/** A canvas on the page to draw a PDF page on. */
export const domSurface: MakeSurface = (w, h) => {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  return { canvas, ctx, toPng: () => canvas.toDataURL('image/png') };
};
