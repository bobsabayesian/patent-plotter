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

export function placeText(el: TextEl): Placed {
  const s = el.sizeMm / CAP_UNITS;
  const rows = wrap(el.text, el.w / s);
  const lines: Line[] = [];
  rows.forEach((row, i) => {
    const base = el.y + (CAP_UNITS + i * LINE_UNITS) * s;
    for (const g of layoutText(row).glyphs) for (const stroke of g.strokes) lines.push(stroke.map(([gx, gy]): XY => [el.x + (g.x + gx) * s, base - gy * s]));
  });
  return { lines, box: [el.x, el.y, el.w, Math.max(1, (rows.length - 1) * LINE_UNITS * s + CAP_UNITS * s)] };
}

/** The drawing's ink bounds: a sheet has white all round it, which should not count when sizing it. */
export function boundsOf(lines: Line[]): [number, number, number, number] | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const l of lines) for (const [x, y] of l) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x0 === Infinity ? null : [x0, y0, x1, y1];
}

export function placeFigure(el: FigureEl, v: Vectorized | undefined): Placed {
  const b = v && boundsOf(v.lines);
  if (!v || !b || b[2] - b[0] <= 0) return { lines: [], box: [el.x, el.y, el.w, el.w * 1.3] };
  const s = el.w / (b[2] - b[0]);
  return {
    lines: v.lines.map((l) => l.map(([x, y]): XY => [el.x + (x - b[0]) * s, el.y + (y - b[1]) * s])),
    box: [el.x, el.y, el.w, (b[3] - b[1]) * s],
  };
}

export const placeEl = (el: El, vecs: ReadonlyMap<string, Vectorized>): Placed => (el.kind === 'text' ? placeText(el) : placeFigure(el, vecs.get(el.id)));

/** Everything on the page as one layer per pen, in the order the pens are swapped in; a pen with nothing to draw gets no layer. */
export function buildScene(doc: Doc, vecs: ReadonlyMap<string, Vectorized>): Scene {
  const { w, h } = pageMm(doc);
  const layers: Layer[] = doc.pens.map((p, index) => ({ index, color: p.color, widthMm: p.tipMm, lines: [] }));
  for (const el of doc.elements) layers[Math.min(el.pen, layers.length - 1)]!.lines.push(...placeEl(el, vecs).lines);
  return { widthMm: w, heightMm: h, layers };
}
