import type { Doc, El, FigureEl, TextEl } from './doc';
import { pageMm } from './doc';
import { layoutText } from './hatch/strokefont';
import type { Layer, Line, Scene } from './scene/types';
import type { XY } from './vector/simplify';
import type { Vectorized } from './vectorize/client';

/** In the stroke font, tall letters are 6 units high and a line of text takes 9. */
const CAP_UNITS = 6, LINE_UNITS = 9.5;

const wordWidth = (w: string) => layoutText(w).width;
const spaceWidth = () => layoutText('i i').width - layoutText('ii').width;

/** Break text into lines no wider than `maxUnits` (design units); a paragraph break is a blank line. */
export function wrap(text: string, maxUnits: number): string[] {
  const out: string[] = [];
  const sp = spaceWidth();
  for (const para of text.split(/\n/)) {
    let line = '', width = 0;
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const ww = wordWidth(word);
      if (line && width + sp + ww > maxUnits) { out.push(line); line = word; width = ww; }
      else { width += (line ? sp : 0) + ww; line = line ? `${line} ${word}` : word; }
    }
    out.push(line);
  }
  return out;
}

export interface Placed { lines: Line[]; /** where it ends up, mm: x, y, width, height */ box: [number, number, number, number] }

/** Lines in their own corner-at-the-origin frame, with the size of the frame. */
interface Local { lines: Line[]; w: number; h: number }

/** Turn a frame `k` quarter turns clockwise (page y runs down), so the top-left corner of the turned frame is again the origin. */
export function rotateLocal(l: Local, k: number): Local {
  const q = ((k % 4) + 4) % 4;
  if (!q) return l;
  const map = (p: XY): XY => (q === 1 ? [l.h - p[1], p[0]] : q === 2 ? [l.w - p[0], l.h - p[1]] : [p[1], l.w - p[0]]);
  return { lines: l.lines.map((line) => line.map(map)), w: q % 2 ? l.h : l.w, h: q % 2 ? l.w : l.h };
}

const put = (l: Local, x: number, y: number, scale = 1): Placed => ({
  lines: l.lines.map((line) => line.map(([px, py]): XY => [x + px * scale, y + py * scale])),
  box: [x, y, l.w * scale, l.h * scale],
});

export function placeText(el: TextEl): Placed {
  const s = el.sizeMm / CAP_UNITS;
  const rows = wrap(el.text, el.w / s);
  const lines: Line[] = [];
  rows.forEach((row, i) => {
    const base = (CAP_UNITS + i * LINE_UNITS) * s;
    const laid = layoutText(row);
    const free = el.w - laid.width * s;
    const x0 = el.align === 'center' ? free / 2 : el.align === 'right' ? free : 0;
    for (const g of laid.glyphs) for (const stroke of g.strokes) lines.push(stroke.map(([gx, gy]): XY => [x0 + (g.x + gx) * s, base - gy * s]));
  });
  return put(rotateLocal({ lines, w: el.w, h: Math.max(1, (rows.length - 1) * LINE_UNITS * s + CAP_UNITS * s) }, el.rot), el.x, el.y);
}

/** The drawing's ink bounds: a sheet has white all round it, which should not count when sizing it. */
export function boundsOf(lines: Line[]): [number, number, number, number] | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const l of lines) for (const [x, y] of l) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x0 === Infinity ? null : [x0, y0, x1, y1];
}

export function placeFigure(el: FigureEl, v: Vectorized | undefined): Placed {
  const b = v && boundsOf(v.lines);
  if (!v || !b || b[2] - b[0] <= 0) {
    const square = el.rot % 2 === 1; // while it is being traced, hold a placeholder of about the right shape
    return { lines: [], box: [el.x, el.y, el.w, square ? el.w / 1.3 : el.w * 1.3] };
  }
  const local = rotateLocal({ lines: v.lines.map((l) => l.map(([x, y]): XY => [x - b[0], y - b[1]])), w: b[2] - b[0], h: b[3] - b[1] }, el.rot);
  return put(local, el.x, el.y, el.w / local.w);
}

export const placeEl = (el: El, vecs: ReadonlyMap<string, Vectorized>): Placed => (el.kind === 'text' ? placeText(el) : placeFigure(el, vecs.get(el.id)));

/** Everything on the page as one layer per pen, in the order the pens are swapped in; a pen with nothing to draw gets no layer. */
export function buildScene(doc: Doc, vecs: ReadonlyMap<string, Vectorized>): Scene {
  const { w, h } = pageMm(doc);
  const layers: Layer[] = doc.pens.map((p, index) => ({ index, color: p.color, widthMm: p.tipMm, lines: [] }));
  for (const el of doc.elements) layers[Math.min(el.pen, layers.length - 1)]!.lines.push(...placeEl(el, vecs).lines);
  return { widthMm: w, heightMm: h, layers };
}
