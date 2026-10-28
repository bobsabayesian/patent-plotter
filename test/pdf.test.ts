import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { pageText, renderGray, type MakeSurface } from '../src/pdf';
import { vectorizeLineArt } from '../src/vectorize/skeleton';

const make: MakeSurface = (w, h) => {
  const canvas = createCanvas(w, h);
  return { canvas, ctx: canvas.getContext('2d') as unknown as CanvasRenderingContext2D, toPng: () => `data:image/png;base64,${canvas.toBuffer('image/png').toString('base64')}` };
};
/** pdf.js reads the JBIG2 scans of old patents with a WebAssembly decoder, found here as the app finds it under /pdfjs/wasm/. */
const wasmUrl = pathToFileURL(`${process.cwd()}/node_modules/pdfjs-dist/wasm/`).href;
const open = (data: Uint8Array) => getDocument({ data, useSystemFonts: true, wasmUrl }).promise as unknown as Promise<PDFDocumentProxy>;

/** A one-page PDF: a thick rectangle drawn as a vector and a line of text. */
function tinyPdf(): Uint8Array {
  const content = 'q 4 w 100 100 400 300 re S Q BT /F1 24 Tf 100 600 Td (FIG. 1 Hello) Tj ET';
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets = objs.map((o, i) => { const at = out.length; out += `${i + 1} 0 obj\n${o}\nendobj\n`; return at; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(out);
}

describe('a PDF page, rendered and traced', () => {
  it('reads a page as pixels, and the lines drawn on it come out where they were drawn', async () => {
    const doc = await open(tinyPdf());
    const g = await renderGray(doc, 1, 1100, make);
    expect([g.w, g.h]).toEqual([850, 1100]); // 612 x 792 pt, long side 1100
    expect(g.data.length).toBe(g.w * g.h);
    let ink = 0;
    for (const v of g.data) if (v < 128) ink++;
    expect(ink / g.data.length).toBeGreaterThan(0.01);

    const lines = vectorizeLineArt(g.data, g.w, g.h, { cleanEdges: false });
    // the rectangle: 100..500 pt across, 100..400 pt up from the bottom, at 1100/792 px per pt
    const k = 1100 / 792;
    const xs = lines.flat().map((p) => p[0]), ys = lines.flat().map((p) => p[1]);
    // (text above it is traced too, so check the box edges exist rather than the extremes)
    const near = (v: number, target: number) => Math.abs(v - target) < 3;
    expect(xs.some((x) => near(x, 100 * k))).toBe(true);
    expect(xs.some((x) => near(x, 500 * k))).toBe(true);
    expect(ys.some((y) => near(y, 1100 - 100 * k))).toBe(true);
    expect(ys.some((y) => near(y, 1100 - 400 * k))).toBe(true);
  }, 60_000);

  it('reads the text of a page, in order', async () => {
    const doc = await open(tinyPdf());
    expect(await pageText(doc, 1)).toBe('FIG. 1 Hello');
  });

  it('reads a scanned patent sheet (JBIG2), which is blank unless the decoder is found', async () => {
    const doc = await open(new Uint8Array(readFileSync(new URL('./fixtures/US261.pdf', import.meta.url))));
    expect(doc.numPages).toBe(4);
    const g = await renderGray(doc, 1, 2200, make);
    expect(g.h).toBe(2200);
    let ink = 0;
    for (const v of g.data) if (v < 128) ink++;
    expect(ink / g.data.length).toBeGreaterThan(0.03); // about 5%: the drawing and its page edge
    const lines = vectorizeLineArt(g.data, g.w, g.h);
    expect(lines.length).toBeGreaterThan(1500);
    expect(lines.length).toBeLessThan(3500);
    // the black band the scan leaves along the bottom is gone, not turned into pen strokes
    const bottom = lines.filter((l) => l.every(([, y]) => y > g.h * 0.96));
    expect(bottom.reduce((n, l) => n + l.length, 0)).toBeLessThan(60);
  }, 120_000);

  it('finds the text the patent office put on its pages, even over a scan', async () => {
    const doc = await open(new Uint8Array(readFileSync(new URL('./fixtures/US261.pdf', import.meta.url))));
    expect(await pageText(doc, 1)).toMatch(/Hackling Machine/);
    expect(await pageText(doc, 2)).toMatch(/UNITED STATES PATENT OFFICE/);
  }, 60_000);
});
